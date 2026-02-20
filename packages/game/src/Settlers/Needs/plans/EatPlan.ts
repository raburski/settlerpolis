import { v4 as uuidv4 } from 'uuid'
import type { BuildingManager } from '../../../Buildings'
import type { ReservationSystem, AmenitySlotReservationResult } from '../../../Reservation'
import { SettlerState } from '../../../Population/types'
import type { SettlerAction } from '../../Actions/types'
import { SettlerActionType } from '../../Actions/types'
import { MoveTargetType } from '../../../Movement/types'
import type { FoodSource } from '../policies/FoodSourcePolicy'
import { NeedType } from '../NeedTypes'
import type { NeedPlanResult } from '../types'
import { ReservationKind } from '../../../Reservation'
import { NeedPlanningFailureReason } from '../../failureReasons'

const EAT_DURATION_MS = 2500

export interface EatPlanDeps {
	buildings: BuildingManager
	reservations: ReservationSystem
}

export const buildEatPlan = (settlerId: string, source: FoodSource, deps: EatPlanDeps): NeedPlanResult => {
	const actions: SettlerAction[] = []
	let satisfyValue: number | undefined

	if (source.type === 'storage') {
		const building = deps.buildings.getBuildingInstance(source.buildingInstanceId)
		if (!building) {
			return { reason: NeedPlanningFailureReason.FoodBuildingMissing }
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
			return { reason: NeedPlanningFailureReason.FoodUnavailable }
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
				return { reason: NeedPlanningFailureReason.AmenityFull }
			}
			amenityReservation = {
				reservationId: amenity.reservationId,
				slotIndex: amenity.slotIndex,
				position: amenity.position
			}
		}

		actions.push(
			{
				type: SettlerActionType.Move,
				position: reservation.position,
				targetType: MoveTargetType.StorageSlot,
				targetId: reservation.reservationId,
				setState: SettlerState.MovingToBuilding
			},
			{
				type: SettlerActionType.WithdrawStorage,
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
				type: SettlerActionType.Move,
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
			return { reason: NeedPlanningFailureReason.FoodReserved }
		}
		actions.push(
			{ type: SettlerActionType.Move, position: source.position, targetType: MoveTargetType.Item, targetId: source.itemId, setState: SettlerState.MovingToItem },
			{
				type: SettlerActionType.PickupLoot,
				itemId: source.itemId,
				reservationRefs: [lootReservation.ref],
				setState: SettlerState.CarryingItem
			}
		)
	}

	actions.push({
		type: SettlerActionType.Consume,
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
