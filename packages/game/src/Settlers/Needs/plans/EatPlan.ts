import { v4 as uuidv4 } from 'uuid'
import type { BuildingManager } from '../../../Buildings'
import type { ReservationSystem, AmenitySlotReservationResult } from '../../../Reservation'
import { SettlerState } from '../../../Population/types'
import type { WorkAction } from '../../Work/types'
import { WorkActionType } from '../../Work/types'
import { MoveTargetType } from '../../../Movement/types'
import type { FoodSource } from '../policies/FoodSourcePolicy'
import { NeedType } from '../NeedTypes'
import type { NeedPlanResult } from '../types'

const EAT_DURATION_MS = 2500

export interface EatPlanDeps {
	buildings: BuildingManager
	reservations: ReservationSystem
}

export const buildEatPlan = (settlerId: string, source: FoodSource, deps: EatPlanDeps): NeedPlanResult => {
	const actions: WorkAction[] = []
	const releaseFns: Array<() => void> = []
	let satisfyValue: number | undefined

	if (source.type === 'storage') {
		const building = deps.buildings.getBuildingInstance(source.buildingInstanceId)
		if (!building) {
			return { reason: 'food_building_missing' }
		}
		const buildingDef = deps.buildings.getBuildingDefinition(building.buildingId)
		if (typeof buildingDef?.amenityNeeds?.hunger === 'number') {
			satisfyValue = buildingDef.amenityNeeds.hunger
		}
		const reservation = deps.reservations.reserveStorageOutgoingInternal(building.id, source.itemType, 1, settlerId)
		if (!reservation) {
			return { reason: 'food_unavailable' }
		}
		releaseFns.push(() => deps.reservations.releaseStorageReservation(reservation.reservationId))

		let amenityReservation: AmenitySlotReservationResult | null = null
		if (buildingDef?.amenitySlots && buildingDef.amenitySlots.count > 0) {
			amenityReservation = deps.reservations.reserveAmenitySlot(building.id, settlerId)
			if (!amenityReservation) {
				releaseFns.forEach(fn => fn())
				return { reason: 'amenity_full' }
			}
			releaseFns.push(() => deps.reservations.releaseAmenitySlot(amenityReservation!.reservationId))
		}

		actions.push(
			{ type: WorkActionType.Move, position: reservation.position, targetType: MoveTargetType.StorageSlot, targetId: reservation.reservationId, setState: SettlerState.MovingToBuilding },
			{ type: WorkActionType.WithdrawStorage, buildingInstanceId: building.id, itemType: source.itemType, quantity: 1, reservationId: reservation.reservationId, setState: SettlerState.CarryingItem }
		)

		if (amenityReservation) {
			actions.push({
				type: WorkActionType.Move,
				position: amenityReservation.position,
				targetType: MoveTargetType.AmenitySlot,
				targetId: amenityReservation.reservationId,
				setState: SettlerState.CarryingItem
			})
		}
	}

	if (source.type === 'ground') {
		const reserved = deps.reservations.reserveLootItem(source.itemId, settlerId)
		if (!reserved) {
			return { reason: 'food_reserved' }
		}
		releaseFns.push(() => deps.reservations.releaseLootReservation(source.itemId, settlerId))
		actions.push(
			{ type: WorkActionType.Move, position: source.position, targetType: MoveTargetType.Item, targetId: source.itemId, setState: SettlerState.MovingToItem },
			{ type: WorkActionType.PickupLoot, itemId: source.itemId, setState: SettlerState.CarryingItem }
		)
	}

	actions.push({
		type: WorkActionType.Consume,
		itemType: source.itemType,
		quantity: source.type === 'carried' ? source.quantity : 1,
		durationMs: EAT_DURATION_MS,
		setState: SettlerState.Working
	})

	return {
		plan: {
			id: uuidv4(),
			needType: NeedType.Hunger,
			actions,
			satisfyValue,
			releaseReservations: () => releaseFns.forEach(fn => fn())
		}
	}
}
