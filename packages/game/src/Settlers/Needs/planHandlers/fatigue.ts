import { NeedType } from '../NeedTypes'
import { NeedPlanningFailureReason } from '../../failureReasons'
import { BedPolicy } from '../policies/BedPolicy'
import type { NeedPlannerDeps } from '../plannerDeps'
import type { NeedPlanHandler } from './types'
import type { SettlerAction } from '../../Actions/types'
import { SettlerActionType } from '../../Actions/types'
import { MoveTargetType } from '../../../Movement/types'
import { SettlerState } from '../../../Population/types'
import { ReservationKind, type AmenitySlotReservationResult } from '../../../Reservation'

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
		let amenityReservation: AmenitySlotReservationResult | null = null

		const building = this.managers.buildings.getBuildingInstance(bed.buildingInstanceId)
		const buildingDef = building ? this.managers.buildings.getBuildingDefinition(building.buildingId) : undefined
		if (typeof buildingDef?.amenityNeeds?.fatigue === 'number') {
			satisfyValue = buildingDef.amenityNeeds.fatigue
		}

		if (buildingDef?.amenitySlots && buildingDef.amenitySlots.count > 0) {
			const amenity = this.managers.reservations.reserve({
				kind: ReservationKind.Amenity,
				buildingInstanceId: bed.buildingInstanceId,
				settlerId
			})
			if (!amenity || amenity.kind !== ReservationKind.Amenity) {
				return { reason: NeedPlanningFailureReason.AmenityFull }
			}
			amenityReservation = {
				reservationId: amenity.reservationId,
				slotIndex: amenity.slotIndex,
				position: amenity.position
			}
		}

		const moveTargetPosition = amenityReservation?.position ?? bed.position
		const moveTargetId = amenityReservation?.reservationId ?? bed.buildingInstanceId
		const moveTargetType = amenityReservation ? MoveTargetType.AmenitySlot : MoveTargetType.Building

		actions.push({
			type: SettlerActionType.Move,
			position: moveTargetPosition,
			targetType: moveTargetType,
			targetId: moveTargetId,
			reservationRefs: amenityReservation
				? [{ kind: ReservationKind.Amenity, reservationId: amenityReservation.reservationId }]
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
