import { NeedType } from '../NeedTypes'
import { NeedPlanningFailureReason } from '../../failureReasons'
import { FoodSourcePolicy } from '../policies/FoodSourcePolicy'
import type { NeedPlannerDeps } from '../plannerDeps'
import type { NeedPlanHandler } from './types'
import type { SettlerAction } from '../../Actions/types'
import { SettlerActionType } from '../../Actions/types'
import { MoveTargetType } from '../../../Movement/types'
import { SettlerState } from '../../../Population/types'
import { ReservationKind, type AmenitySlotReservationResult } from '../../../Reservation'

const EAT_DURATION_MS = 2500

export class HungerNeedPlanHandler implements NeedPlanHandler {
	public readonly type = NeedType.Hunger
	private readonly foodSourcePolicy: FoodSourcePolicy

	constructor(private managers: NeedPlannerDeps) {
		this.foodSourcePolicy = new FoodSourcePolicy(managers)
	}

	public build(settlerId: string) {
		const source = this.foodSourcePolicy.findFoodSource(settlerId)
		if (!source) {
			return { reason: NeedPlanningFailureReason.NoFoodSource }
		}

		const actions: SettlerAction[] = []
		let satisfyValue: number | undefined

		if (source.type === 'storage') {
			const building = this.managers.buildings.getBuildingInstance(source.buildingInstanceId)
			if (!building) {
				return { reason: NeedPlanningFailureReason.FoodBuildingMissing }
			}
			const buildingDef = this.managers.buildings.getBuildingDefinition(building.buildingId)
			if (typeof buildingDef?.amenityNeeds?.hunger === 'number') {
				satisfyValue = buildingDef.amenityNeeds.hunger
			}
			const reservation = this.managers.reservations.reserve({
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
				const amenity = this.managers.reservations.reserve({
					kind: ReservationKind.Amenity,
					buildingInstanceId: building.id,
					settlerId
				})
				if (!amenity || amenity.kind !== ReservationKind.Amenity) {
					this.managers.reservations.release(reservation.ref)
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
			const lootReservation = this.managers.reservations.reserve({
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
				actions,
				satisfyValue
			}
		}
	}
}
