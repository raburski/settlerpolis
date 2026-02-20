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
import { ReservationKind } from '../../../Reservation'

const EAT_DURATION_MS = 2500

export interface EatPlanDeps {
	buildings: BuildingManager
	reservations: ReservationSystem
}

export const buildEatPlan = (settlerId: string, source: FoodSource, deps: EatPlanDeps): NeedPlanResult => {
	const actions: WorkAction[] = []
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
		const reservation = deps.reservations.reserve({
			kind: ReservationKind.Storage,
			direction: 'outgoing',
			buildingInstanceId: building.id,
			itemType: source.itemType,
			quantity: 1,
			ownerId: settlerId,
			allowInternal: true
		})
		if (!reservation || reservation.kind !== ReservationKind.Storage) {
			return { reason: 'food_unavailable' }
		}

		let amenityReservation: AmenitySlotReservationResult | null = null
		if (buildingDef?.amenitySlots && buildingDef.amenitySlots.count > 0) {
			const amenity = deps.reservations.reserve({
				kind: ReservationKind.Amenity,
				buildingInstanceId: building.id,
				settlerId
			})
			if (!amenity || amenity.kind !== ReservationKind.Amenity) {
				deps.reservations.release(reservation.ref)
				return { reason: 'amenity_full' }
			}
			amenityReservation = {
				reservationId: amenity.reservationId,
				slotIndex: amenity.slotIndex,
				position: amenity.position
			}
		}

		actions.push(
			{
				type: WorkActionType.Move,
				position: reservation.position,
				targetType: MoveTargetType.StorageSlot,
				targetId: reservation.reservationId,
				setState: SettlerState.MovingToBuilding
			},
			{
				type: WorkActionType.WithdrawStorage,
				buildingInstanceId: building.id,
				itemType: source.itemType,
				quantity: 1,
				reservationId: reservation.reservationId,
				reservationRefs: [reservation.ref],
				setState: SettlerState.CarryingItem
			}
		)

		if (amenityReservation) {
			actions.push({
				type: WorkActionType.Move,
				position: amenityReservation.position,
				targetType: MoveTargetType.AmenitySlot,
				targetId: amenityReservation.reservationId,
				reservationRefs: [{ kind: ReservationKind.Amenity, reservationId: amenityReservation.reservationId }],
				setState: SettlerState.CarryingItem
			})
		}
	}

	if (source.type === 'ground') {
		const lootReservation = deps.reservations.reserve({
			kind: ReservationKind.Loot,
			itemId: source.itemId,
			ownerId: settlerId
		})
		if (!lootReservation || lootReservation.kind !== ReservationKind.Loot) {
			return { reason: 'food_reserved' }
		}
		actions.push(
			{ type: WorkActionType.Move, position: source.position, targetType: MoveTargetType.Item, targetId: source.itemId, setState: SettlerState.MovingToItem },
			{
				type: WorkActionType.PickupLoot,
				itemId: source.itemId,
				reservationRefs: [lootReservation.ref],
				setState: SettlerState.CarryingItem
			}
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
			satisfyValue
		}
	}
}
