import { v4 as uuidv4 } from 'uuid'
import { SettlerState } from '../../../Population/types'
import type { WorkAction } from '../../Work/types'
import { WorkActionType } from '../../Work/types'
import { MoveTargetType } from '../../../Movement/types'
import type { BedLocation } from '../policies/BedPolicy'
import { NeedType } from '../NeedTypes'
import type { NeedPlanResult } from '../types'
import type { BuildingManager } from '../../../Buildings'
import type { ReservationSystem, AmenitySlotReservationResult } from '../../../Reservation'
import { ReservationKind } from '../../../Reservation'

const SLEEP_DURATION_MS = 8000

export interface SleepPlanDeps {
	buildings: BuildingManager
	reservations: ReservationSystem
}

export const buildSleepPlan = (settlerId: string, bed: BedLocation, deps: SleepPlanDeps): NeedPlanResult => {
	const actions: WorkAction[] = []
	let satisfyValue: number | undefined
	let amenityReservation: AmenitySlotReservationResult | null = null

	const building = deps.buildings.getBuildingInstance(bed.buildingInstanceId)
	const buildingDef = building ? deps.buildings.getBuildingDefinition(building.buildingId) : undefined
	if (typeof buildingDef?.amenityNeeds?.fatigue === 'number') {
		satisfyValue = buildingDef.amenityNeeds.fatigue
	}

	if (buildingDef?.amenitySlots && buildingDef.amenitySlots.count > 0) {
		const amenity = deps.reservations.reserve({
			kind: ReservationKind.Amenity,
			buildingInstanceId: bed.buildingInstanceId,
			settlerId
		})
		if (!amenity || amenity.kind !== ReservationKind.Amenity) {
			return { reason: 'amenity_full' }
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
		type: WorkActionType.Move,
		position: moveTargetPosition,
		targetType: moveTargetType,
		targetId: moveTargetId,
		reservationRefs: amenityReservation
			? [{ kind: ReservationKind.Amenity, reservationId: amenityReservation.reservationId }]
			: undefined,
		setState: SettlerState.MovingToBuilding
	})

	actions.push({
		type: WorkActionType.Sleep,
		durationMs: SLEEP_DURATION_MS,
		setState: SettlerState.Working
	})

	return {
		plan: {
			id: uuidv4(),
			needType: NeedType.Fatigue,
			actions,
			satisfyValue
		}
	}
}
