import { NeedType } from '../NeedTypes'
import { NeedPlanningFailureReason } from '../../failureReasons'
import { BedPolicy } from '../policies/BedPolicy'
import type { NeedPlannerDeps } from '../plannerDeps'
import type { NeedPlanHandler } from './types'
import type { SettlerAction } from '../../Actions/types'
import { SettlerActionType } from '../../Actions/types'
import { MoveTargetType } from '../../../Movement/types'
import { SettlerState } from '../../../Population/types'
import { ReservationKind, type OccupancySlotReservationResult } from '../../../Reservation'

const SLEEP_DURATION_MS = 8000

export class FatigueNeedPlanHandler implements NeedPlanHandler {
	public readonly type = NeedType.Fatigue
	private readonly bedPolicy: BedPolicy

	constructor(private managers: NeedPlannerDeps) {
		this.bedPolicy = new BedPolicy({
			buildings: managers.buildings,
			population: managers.population
		})
	}

	public build(settlerId: string) {
		const bed = this.bedPolicy.findBed(settlerId)
		if (!bed) {
			return { reason: NeedPlanningFailureReason.NoHome }
		}

		const actions: SettlerAction[] = []
		let satisfyValue: number | undefined
		let occupancyReservation: OccupancySlotReservationResult | null = null

		const building = this.managers.buildings.getBuildingInstance(bed.buildingInstanceId)
		const buildingDef = building ? this.managers.buildings.getBuildingDefinition(building.buildingId) : undefined
		if (typeof buildingDef?.amenityNeeds?.fatigue === 'number') {
			satisfyValue = buildingDef.amenityNeeds.fatigue
		}

		const buildingOccupancy = buildingDef?.occupancy
		const hasAnyOccupancy = Boolean(
			buildingOccupancy
			&& (
				(buildingOccupancy.totalCapacity ?? 0) > 0
				|| (buildingOccupancy.insideCapacity ?? 0) > 0
				|| (buildingOccupancy.outsideSlots?.count ?? 0) > 0
			)
		)
		if (hasAnyOccupancy) {
			const occupancy = this.managers.reservations.reserve({
				kind: ReservationKind.Occupancy,
				buildingInstanceId: bed.buildingInstanceId,
				settlerId
			})
			if (!occupancy || occupancy.kind !== ReservationKind.Occupancy) {
				return { reason: NeedPlanningFailureReason.OccupancyFull }
			}
			occupancyReservation = {
				reservationId: occupancy.reservationId,
				mode: occupancy.mode,
				slotIndex: occupancy.slotIndex,
				position: occupancy.position
			}
		}

		const moveTargetPosition = occupancyReservation?.position ?? bed.position
		const moveTargetId = occupancyReservation?.reservationId ?? bed.buildingInstanceId
		const moveTargetType = occupancyReservation ? MoveTargetType.OccupancySlot : MoveTargetType.Building

		actions.push({
			type: SettlerActionType.Move,
			position: moveTargetPosition,
			targetType: moveTargetType,
			targetId: moveTargetId,
			reservationRefs: occupancyReservation
				? [{ kind: ReservationKind.Occupancy, reservationId: occupancyReservation.reservationId }]
				: undefined,
			setState: SettlerState.MovingToBuilding
		})

		actions.push({
			type: SettlerActionType.Sleep,
			durationMs: SLEEP_DURATION_MS,
			setState: SettlerState.Working
		})

		return {
			plan: {
				actions,
				satisfyValue
			}
		}
	}
}
