import { SettlerState } from '../../Population/types'
import { MoveTargetType } from '../../Movement/types'
import {
	BehaviourIntentType,
	type BehaviourIntent,
	BehaviourIntentPriority,
	EnqueueActionsReason,
	RequestDispatchReason,
	SetWaitStateReason
} from '../Behaviour/intentTypes'
import { SettlerActionType, type SettlerAction } from '../Actions/types'
import type { MapManager } from '../../Map'
import type { MovementManager } from '../../Movement'
import type { PopulationManager } from '../../Population'
import type { SettlerActionsManager } from '../Actions'
import type { SettlerWorkRuntimePort } from '../Work/runtime'
import type { SettlerActionFailureReason } from '../failureReasons'
import type { EventManager } from '../../events'
import { MovementEvents } from '../../Movement/events'

interface NavigationQueueExecution {
	settlerId: string
}

export interface YieldRequestedData {
	requesterEntityId: string
	blockerEntityId: string
	mapId: string
	tile: { x: number, y: number }
}

export interface SettlerNavigationDeps {
	event: EventManager
	map: MapManager
	movement: MovementManager
	population: PopulationManager
	actions: SettlerActionsManager
	work: SettlerWorkRuntimePort
}

export class SettlerNavigationManager {
	private pendingIntents: BehaviourIntent[] = []
	private pendingExecutions = new Map<string, NavigationQueueExecution>()
	private executionSequence = 0

	constructor(private readonly deps: SettlerNavigationDeps) {
		this.deps.event.on<YieldRequestedData>(MovementEvents.SS.YieldRequested, this.handleMovementSSYieldRequested)
	}

	private readonly handleMovementSSYieldRequested = (data: YieldRequestedData): void => {
		this.onYieldRequested(data)
	}

	public onYieldRequested(data: YieldRequestedData): void {
		const blocker = this.deps.population.getSettler(data.blockerEntityId)
		if (!blocker || blocker.mapId !== data.mapId) {
			return
		}
		if (this.deps.movement.hasActiveMovement(blocker.id)) {
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

		const requesterPosition = this.deps.movement.getEntityPosition(data.requesterEntityId)
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

		if (this.deps.actions.isBusy(blocker.id) && !this.deps.actions.isCurrentActionYieldInterruptible(blocker.id)) {
			return
		}

		const stepAsideTargetId = `yield:${yieldMode}:${data.requesterEntityId}:${Math.round(yieldTarget.x)},${Math.round(yieldTarget.y)}`
		const stepAsideAction: SettlerAction = {
			type: SettlerActionType.Move,
			position: yieldTarget,
			targetType: MoveTargetType.Spot,
			targetId: stepAsideTargetId,
			setState: SettlerState.Moving
		}
		const token = this.registerExecution({
			settlerId: blocker.id
		})

		this.pendingIntents.push({
			type: BehaviourIntentType.EnqueueActions,
			priority: BehaviourIntentPriority.High,
			settlerId: blocker.id,
			actions: [stepAsideAction],
			completionToken: token,
			reason: EnqueueActionsReason.NavigationYield
		})
	}

	public update(): void {
		for (const settler of this.deps.population.getSettlers()) {
			if (!this.isTransitState(settler.state)) {
				continue
			}
			if (this.deps.actions.isBusy(settler.id)) {
				continue
			}
			if (this.deps.movement.hasActiveMovement(settler.id)) {
				continue
			}
			const assignment = this.deps.work.getAssignment(settler.id)
			if (!assignment) {
				this.pendingIntents.push({
					type: BehaviourIntentType.SetWaitState,
					priority: BehaviourIntentPriority.Low,
					settlerId: settler.id,
					reason: SetWaitStateReason.ClearWait,
					waitReason: undefined,
					state: SettlerState.Idle
				})
				continue
			}

			this.pendingIntents.push({
				type: BehaviourIntentType.RequestDispatch,
				priority: BehaviourIntentPriority.Normal,
				settlerId: settler.id,
				reason: RequestDispatchReason.Recovery
			})
		}
	}

	public consumePendingIntents(): BehaviourIntent[] {
		const intents = this.pendingIntents
		this.pendingIntents = []
		return intents
	}

	public handleRoutedQueueCompleted(token: string): void {
		const execution = this.consumeExecution(token)
		if (!execution) {
			return
		}
		this.enqueuePostYieldIntent(execution.settlerId)
	}

	public handleRoutedQueueFailed(token: string, _reason: SettlerActionFailureReason): void {
		const execution = this.consumeExecution(token)
		if (!execution) {
			return
		}
		this.enqueuePostYieldIntent(execution.settlerId)
	}

	public discardRoutedExecution(token: string): void {
		this.consumeExecution(token)
	}

	private enqueuePostYieldIntent(settlerId: string): void {
		const assignment = this.deps.work.getAssignment(settlerId)
		if (!assignment) {
			this.pendingIntents.push({
				type: BehaviourIntentType.SetWaitState,
				priority: BehaviourIntentPriority.Low,
				settlerId,
				reason: SetWaitStateReason.ClearWait,
				waitReason: undefined,
				state: SettlerState.Idle
			})
			return
		}
		this.pendingIntents.push({
			type: BehaviourIntentType.RequestDispatch,
			priority: BehaviourIntentPriority.Normal,
			settlerId,
			reason: RequestDispatchReason.Recovery
		})
	}

	private registerExecution(execution: NavigationQueueExecution): string {
		const token = `nav:${++this.executionSequence}`
		this.pendingExecutions.set(token, execution)
		return token
	}

	private consumeExecution(token: string): NavigationQueueExecution | undefined {
		const execution = this.pendingExecutions.get(token)
		if (!execution) {
			return undefined
		}
		this.pendingExecutions.delete(token)
		return execution
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
		const map = this.deps.map.getMap(mapId)
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
			if (!this.deps.movement.isTileFreeForYield(mapId, tileX, tileY, blockerEntityId)) {
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
		const map = this.deps.map.getMap(mapId)
		if (!map) {
			return null
		}
		if (!this.deps.movement.hasActiveMovement(requesterEntityId)) {
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

		if (!this.deps.movement.isTileFreeForYield(mapId, requesterTileX, requesterTileY, requesterEntityId)) {
			return null
		}

		return {
			x: requesterTileX * tileWidth + tileWidth / 2,
			y: requesterTileY * tileHeight + tileHeight / 2
		}
	}
}
