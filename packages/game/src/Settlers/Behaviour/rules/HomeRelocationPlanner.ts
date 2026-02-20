import { ConstructionStage } from '../../../Buildings/types'
import type { BuildingManager } from '../../../Buildings'
import type { MapManager } from '../../../Map'
import { MoveTargetType } from '../../../Movement/types'
import type { ReservationSystem } from '../../../Reservation'
import type { RoadManager } from '../../../Roads'
import { calculateDistance } from '../../../utils'
import type { PopulationManager } from '../../../Population'
import { SettlerState } from '../../../Population/types'
import type { WorkAction, WorkAssignment } from '../../Work/types'
import { WorkActionType, WorkProviderType } from '../../Work/types'
import { ReservationKind } from '../../../Reservation'

const HOME_MOVE_CHECK_COOLDOWN_MS = 15000
const HOME_MOVE_COOLDOWN_MS = 90000
const HOME_MOVE_IMPROVEMENT_RATIO = 0.7
const HOME_MOVE_MIN_IMPROVEMENT_TILES = 2
const HOME_MOVE_PACK_MS = 3000
const HOME_MOVE_UNPACK_MS = 3000

export interface HomeRelocationPlannerDeps {
	buildings: BuildingManager
	population: PopulationManager
	reservations: ReservationSystem
	roads: RoadManager
	map: MapManager
}

export interface HomeRelocationPlan {
	actions: WorkAction[]
}

export class HomeRelocationPlanner {
	private lastHomeMoveAt = new Map<string, number>()
	private lastHomeMoveCheckAt = new Map<string, number>()

	public tryBuildPlan(
		settlerId: string,
		assignment: WorkAssignment,
		simulationTimeMs: number,
		deps: HomeRelocationPlannerDeps
	): HomeRelocationPlan | null {
		if (assignment.providerType !== WorkProviderType.Building || !assignment.buildingInstanceId) {
			return null
		}

		const settler = deps.population.getSettler(settlerId)
		if (!settler?.houseId) {
			return null
		}

		if (!this.canAttemptHomeMove(settlerId, simulationTimeMs)) {
			return null
		}

		const plan = this.buildHomeMovePlan(
			settlerId,
			settler.houseId,
			assignment.buildingInstanceId,
			deps
		)
		if (!plan) {
			return null
		}

		this.lastHomeMoveAt.set(settlerId, simulationTimeMs)
		return plan
	}

	public reset(): void {
		this.lastHomeMoveAt.clear()
		this.lastHomeMoveCheckAt.clear()
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
		settlerId: string,
		currentHouseId: string,
		workplaceId: string,
		deps: HomeRelocationPlannerDeps
	): HomeRelocationPlan | null {
		const workplace = deps.buildings.getBuildingInstance(workplaceId)
		if (!workplace) {
			return null
		}

		const currentHouse = deps.buildings.getBuildingInstance(currentHouseId)
		if (!currentHouse) {
			return null
		}

		const mapId = workplace.mapId
		const currentCost = this.estimateCommuteDistance(deps, mapId, currentHouse.position, workplace.position)
		if (currentCost === null) {
			return null
		}

		const tileSize = this.getTileSize(deps, mapId)
		const minImprovement = HOME_MOVE_MIN_IMPROVEMENT_TILES * tileSize

		let bestHouse: typeof currentHouse | null = null
		let bestCost = currentCost

		const houses = deps.buildings.getAllBuildings()
			.filter(building => building.mapId === mapId && building.playerId === workplace.playerId)
			.filter(building => building.stage === ConstructionStage.Completed)
			.filter(building => building.id !== currentHouse.id)
			.filter(building => {
				const definition = deps.buildings.getBuildingDefinition(building.buildingId)
				if (!definition?.spawnsSettlers) {
					return false
				}
				if ((definition.maxOccupants ?? 0) <= 0) {
					return false
				}
				return deps.reservations.canReserveHouseSlot(building.id)
			})

		for (const house of houses) {
			const cost = this.estimateCommuteDistance(deps, mapId, house.position, workplace.position)
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

		const houseReservation = deps.reservations.reserve({
			kind: ReservationKind.House,
			houseId: bestHouse.id,
			settlerId
		})
		if (!houseReservation || houseReservation.kind !== ReservationKind.House) {
			return null
		}

		const actions: WorkAction[] = [
			{ type: WorkActionType.Move, position: currentHouse.position, targetType: MoveTargetType.House, targetId: currentHouse.id, setState: SettlerState.MovingHome },
			{ type: WorkActionType.Wait, durationMs: HOME_MOVE_PACK_MS, setState: SettlerState.Packing },
			{ type: WorkActionType.Move, position: bestHouse.position, targetType: MoveTargetType.House, targetId: bestHouse.id, setState: SettlerState.MovingHome },
			{
				type: WorkActionType.ChangeHome,
				reservationId: houseReservation.reservationId,
				houseId: bestHouse.id,
				reservationRefs: [houseReservation.ref]
			},
			{ type: WorkActionType.Wait, durationMs: HOME_MOVE_UNPACK_MS, setState: SettlerState.Unpacking },
			{ type: WorkActionType.Move, position: workplace.position, targetType: MoveTargetType.Building, targetId: workplace.id, setState: SettlerState.MovingToBuilding }
		]

		return { actions }
	}

	private estimateCommuteDistance(
		deps: HomeRelocationPlannerDeps,
		mapId: string,
		from: { x: number, y: number },
		to: { x: number, y: number }
	): number | null {
		const roadData = deps.roads.getRoadData(mapId) || undefined
		const path = deps.map.findPath(mapId, from, to, {
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

	private getTileSize(deps: HomeRelocationPlannerDeps, mapId: string): number {
		return deps.map.getMap(mapId)?.tiledMap.tilewidth || 32
	}
}
