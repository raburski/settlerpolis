import { calculateDistance } from '../../../utils'
import { ConstructionStage } from '../../../Buildings/types'
import { SettlerState } from '../../../Population/types'
import { WorkActionType, WorkProviderType } from '../types'
import type { WorkAction, WorkStep } from '../types'
import { WorkPolicyResultType } from './constants'
import type { WorkPolicy, WorkPolicyContext, WorkPolicyResult } from './types'

const HOME_MOVE_CHECK_COOLDOWN_MS = 15000
const HOME_MOVE_COOLDOWN_MS = 90000
const HOME_MOVE_IMPROVEMENT_RATIO = 0.7
const HOME_MOVE_MIN_IMPROVEMENT_TILES = 2
const HOME_MOVE_PACK_MS = 3000
const HOME_MOVE_UNPACK_MS = 3000

export class HomeRelocationPolicy implements WorkPolicy {
	public readonly id = 'home-relocation'
	private lastHomeMoveAt = new Map<string, number>()
	private lastHomeMoveCheckAt = new Map<string, number>()

	public onNoStep(ctx: WorkPolicyContext): WorkPolicyResult | null {
		return this.tryEnqueueHomeMove(ctx)
	}

	public onWaitStep(ctx: WorkPolicyContext, _step: WorkStep): WorkPolicyResult | null {
		return this.tryEnqueueHomeMove(ctx)
	}

	private tryEnqueueHomeMove(ctx: WorkPolicyContext): WorkPolicyResult | null {
		const assignment = ctx.assignment
		if (assignment.providerType !== WorkProviderType.Building || !assignment.buildingInstanceId) {
			return null
		}

		const settler = ctx.managers.population.getSettler(ctx.settlerId)
		if (!settler?.houseId) {
			return null
		}

		const nowMs = ctx.simulationTimeMs
		if (!this.canAttemptHomeMove(ctx.settlerId, nowMs)) {
			return null
		}

		const plan = this.buildHomeMovePlan(ctx, settler.houseId, assignment.buildingInstanceId)
		if (!plan) {
			return null
		}

		this.lastHomeMoveAt.set(ctx.settlerId, nowMs)

		return {
			type: WorkPolicyResultType.Enqueue,
			actions: plan.actions,
			onComplete: () => {
				ctx.managers.population.setSettlerState(ctx.settlerId, SettlerState.Idle)
			},
			onFail: () => {
				plan.releaseReservation()
				ctx.managers.population.setSettlerState(ctx.settlerId, SettlerState.Idle)
			}
		}
	}

	private canAttemptHomeMove(settlerId: string, nowMs: number): boolean {
		const lastCheck = this.lastHomeMoveCheckAt.get(settlerId) || 0
		if (nowMs - lastCheck < HOME_MOVE_CHECK_COOLDOWN_MS) {
			return false
		}
		this.lastHomeMoveCheckAt.set(settlerId, nowMs)

		const lastMove = this.lastHomeMoveAt.get(settlerId) || 0
		if (nowMs - lastMove < HOME_MOVE_COOLDOWN_MS) {
			return false
		}

		return true
	}

	private buildHomeMovePlan(
		ctx: WorkPolicyContext,
		currentHouseId: string,
		workplaceId: string
	): { actions: WorkAction[], releaseReservation: () => void } | null {
		const workplace = ctx.managers.buildings.getBuildingInstance(workplaceId)
		if (!workplace) {
			return null
		}

		const currentHouse = ctx.managers.buildings.getBuildingInstance(currentHouseId)
		if (!currentHouse) {
			return null
		}

		const mapName = workplace.mapName
		const currentCost = this.estimateCommuteDistance(ctx, mapName, currentHouse.position, workplace.position)
		if (currentCost === null) {
			return null
		}

		const tileSize = this.getTileSize(ctx, mapName)
		const minImprovement = HOME_MOVE_MIN_IMPROVEMENT_TILES * tileSize

		let bestHouse: typeof currentHouse | null = null
		let bestCost = currentCost

		const houses = ctx.managers.buildings.getAllBuildings()
			.filter(building => building.mapName === mapName && building.playerId === workplace.playerId)
			.filter(building => building.stage === ConstructionStage.Completed)
			.filter(building => building.id !== currentHouse.id)
			.filter(building => {
				const definition = ctx.managers.buildings.getBuildingDefinition(building.buildingId)
				if (!definition?.spawnsSettlers) {
					return false
				}
				if ((definition.maxOccupants ?? 0) <= 0) {
					return false
				}
				return ctx.managers.reservations.canReserveHouseSlot(building.id)
			})

		for (const house of houses) {
			const cost = this.estimateCommuteDistance(ctx, mapName, house.position, workplace.position)
			if (cost === null) {
				continue
			}
			if (cost < bestCost) {
				bestCost = cost
				bestHouse = house
			}
		}

		if (!bestHouse) {
			return null
		}

		if (bestCost > currentCost * HOME_MOVE_IMPROVEMENT_RATIO) {
			return null
		}

		if (currentCost - bestCost < minImprovement) {
			return null
		}

		const reservationId = ctx.managers.reservations.reserveHouseSlot(bestHouse.id, ctx.settlerId)
		if (!reservationId) {
			return null
		}

		const releaseReservation = () => ctx.managers.reservations.releaseHouseReservation(reservationId)
		const actions: WorkAction[] = [
			{ type: WorkActionType.Move, position: currentHouse.position, targetType: 'house', targetId: currentHouse.id, setState: SettlerState.MovingHome },
			{ type: WorkActionType.Wait, durationMs: HOME_MOVE_PACK_MS, setState: SettlerState.Packing },
			{ type: WorkActionType.Move, position: bestHouse.position, targetType: 'house', targetId: bestHouse.id, setState: SettlerState.MovingHome },
			{ type: WorkActionType.ChangeHome, reservationId, houseId: bestHouse.id },
			{ type: WorkActionType.Wait, durationMs: HOME_MOVE_UNPACK_MS, setState: SettlerState.Unpacking },
			{ type: WorkActionType.Move, position: workplace.position, targetType: 'building', targetId: workplace.id, setState: SettlerState.MovingToBuilding }
		]

		return { actions, releaseReservation }
	}

	private estimateCommuteDistance(
		ctx: WorkPolicyContext,
		mapName: string,
		from: { x: number, y: number },
		to: { x: number, y: number }
	): number | null {
		const roadData = ctx.managers.roads.getRoadData(mapName) || undefined
		const path = ctx.managers.map.findPath(mapName, from, to, {
			roadData,
			allowDiagonal: true
		})
		if (!path || path.length === 0) {
			return null
		}
		return this.calculatePathDistance(path)
	}

	private calculatePathDistance(path: Array<{ x: number, y: number }>): number {
		if (path.length <= 1) {
			return 0
		}
		let total = 0
		for (let i = 1; i < path.length; i++) {
			total += calculateDistance(path[i - 1], path[i])
		}
		return total
	}

	private getTileSize(ctx: WorkPolicyContext, mapName: string): number {
		return ctx.managers.map.getMap(mapName)?.tiledMap.tilewidth || 32
	}
}
