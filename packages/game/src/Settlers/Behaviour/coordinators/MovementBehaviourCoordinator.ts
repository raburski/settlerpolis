import type { SettlerId } from '../../../ids'
import { SettlerState } from '../../../Population/types'
import { MoveTargetType } from '../../../Movement/types'
import { SettlerActionType, type SettlerAction } from '../../Actions/types'
import type { SettlerBehaviourDeps } from '../deps'

export interface YieldRequestedData {
	requesterEntityId: string
	blockerEntityId: string
	mapId: string
	tile: { x: number, y: number }
}

interface MovementBehaviourCoordinatorDeps {
	managers: Pick<SettlerBehaviourDeps, 'population' | 'movement' | 'actions' | 'work' | 'map'>
	dispatchNextStep: (settlerId: SettlerId) => void
}

export class MovementBehaviourCoordinator {
	constructor(private readonly deps: MovementBehaviourCoordinatorDeps) {}

	public handleYieldRequested(data: YieldRequestedData): void {
		const blocker = this.deps.managers.population.getSettler(data.blockerEntityId)
		if (!blocker) {
			return
		}
		if (blocker.mapId !== data.mapId) {
			return
		}
		if (this.deps.managers.movement.hasActiveMovement(blocker.id)) {
			return
		}
		if (
			blocker.state !== SettlerState.Idle &&
			blocker.state !== SettlerState.WaitingForWork &&
			blocker.state !== SettlerState.Assigned &&
			blocker.state !== SettlerState.Working
		) {
			return
		}

		const requesterPosition = this.deps.managers.movement.getEntityPosition(data.requesterEntityId)
		const stepAsideTarget = requesterPosition
			? this.findYieldSidePosition(blocker.mapId, blocker.id, blocker.position, requesterPosition)
			: null
		const swapTarget = stepAsideTarget || !requesterPosition
			? null
			: this.findYieldSwapPosition(blocker.mapId, data.requesterEntityId, blocker.position, requesterPosition)
		const yieldTarget = stepAsideTarget ?? swapTarget
		if (!yieldTarget) {
			return
		}
		const yieldMode = stepAsideTarget ? 'side' : 'swap'

		const stepAsideTargetId = `yield:${yieldMode}:${data.requesterEntityId}:${Math.round(yieldTarget.x)},${Math.round(yieldTarget.y)}`
		const stepAsideAction: SettlerAction = {
			type: SettlerActionType.Move,
			position: yieldTarget,
			targetType: MoveTargetType.Spot,
			targetId: stepAsideTargetId,
			setState: SettlerState.Moving
		}

		if (this.deps.managers.actions.isBusy(blocker.id)) {
			if (!this.deps.managers.actions.isCurrentActionYieldInterruptible(blocker.id)) {
				return
			}
			this.deps.managers.actions.expediteCurrentWaitAction(blocker.id)
			this.deps.managers.actions.insertActionsAfterCurrent(blocker.id, [stepAsideAction])
			return
		}

		this.deps.managers.actions.enqueue(blocker.id, [stepAsideAction], () => {
			if (this.deps.managers.actions.isBusy(blocker.id)) {
				return
			}
			const assignment = this.deps.managers.work.getAssignment(blocker.id)
			if (!assignment) {
				this.deps.managers.population.setSettlerWaitReason(blocker.id, undefined)
				this.deps.managers.population.setSettlerState(blocker.id, SettlerState.Idle)
				return
			}
			this.deps.dispatchNextStep(blocker.id)
		})
	}

	public recoverOrphanedMovingSettlers(): void {
		for (const settler of this.deps.managers.population.getSettlers()) {
			if (!this.isTransitState(settler.state)) {
				continue
			}
			if (this.deps.managers.actions.isBusy(settler.id)) {
				continue
			}
			if (this.deps.managers.movement.hasActiveMovement(settler.id)) {
				continue
			}
			const assignment = this.deps.managers.work.getAssignment(settler.id)
			if (!assignment) {
				this.deps.managers.population.setSettlerWaitReason(settler.id, undefined)
				this.deps.managers.population.setSettlerState(settler.id, SettlerState.Idle)
				continue
			}
			this.deps.dispatchNextStep(settler.id)
		}
	}

	private isTransitState(state: SettlerState): boolean {
		return state === SettlerState.Moving
			|| state === SettlerState.MovingToItem
			|| state === SettlerState.CarryingItem
			|| state === SettlerState.MovingToBuilding
			|| state === SettlerState.MovingToTool
			|| state === SettlerState.MovingToResource
	}

	private findYieldSidePosition(
		mapId: string,
		blockerEntityId: string,
		currentPosition: { x: number, y: number },
		requesterPosition: { x: number, y: number }
	): { x: number, y: number } | null {
		const map = this.deps.managers.map.getMap(mapId)
		if (!map) {
			return null
		}
		const tileWidth = map.tiledMap.tilewidth || 32
		const tileHeight = map.tiledMap.tileheight || 32
		const baseTileX = Math.floor(currentPosition.x / tileWidth)
		const baseTileY = Math.floor(currentPosition.y / tileHeight)
		const requesterTileX = Math.floor(requesterPosition.x / tileWidth)
		const requesterTileY = Math.floor(requesterPosition.y / tileHeight)
		const incoming = {
			x: Math.sign(baseTileX - requesterTileX),
			y: Math.sign(baseTileY - requesterTileY)
		}

		if (incoming.x === 0 && incoming.y === 0) {
			return null
		}

		const sideDirections = [
			{ x: -incoming.y, y: incoming.x },
			{ x: incoming.y, y: -incoming.x }
		]

		for (const direction of sideDirections) {
			const tileX = baseTileX + direction.x
			const tileY = baseTileY + direction.y
			if (tileX < 0 || tileY < 0 || tileX >= map.collision.width || tileY >= map.collision.height) {
				continue
			}
			const tileIndex = tileY * map.collision.width + tileX
			if (map.collision.data[tileIndex] !== 0) {
				continue
			}
			if (!this.deps.managers.movement.isTileFreeForYield(mapId, tileX, tileY, blockerEntityId)) {
				continue
			}
			return {
				x: tileX * tileWidth + tileWidth / 2,
				y: tileY * tileHeight + tileHeight / 2
			}
		}

		return null
	}

	private findYieldSwapPosition(
		mapId: string,
		requesterEntityId: string,
		blockerPosition: { x: number, y: number },
		requesterPosition: { x: number, y: number }
	): { x: number, y: number } | null {
		const map = this.deps.managers.map.getMap(mapId)
		if (!map) {
			return null
		}
		if (!this.deps.managers.movement.hasActiveMovement(requesterEntityId)) {
			return null
		}

		const tileWidth = map.tiledMap.tilewidth || 32
		const tileHeight = map.tiledMap.tileheight || 32
		const blockerTileX = Math.floor(blockerPosition.x / tileWidth)
		const blockerTileY = Math.floor(blockerPosition.y / tileHeight)
		const requesterTileX = Math.floor(requesterPosition.x / tileWidth)
		const requesterTileY = Math.floor(requesterPosition.y / tileHeight)

		const dx = Math.abs(blockerTileX - requesterTileX)
		const dy = Math.abs(blockerTileY - requesterTileY)
		if (Math.max(dx, dy) !== 1) {
			return null
		}

		if (!this.deps.managers.movement.isTileFreeForYield(mapId, requesterTileX, requesterTileY, requesterEntityId)) {
			return null
		}

		return {
			x: requesterTileX * tileWidth + tileWidth / 2,
			y: requesterTileY * tileHeight + tileHeight / 2
		}
	}
}
