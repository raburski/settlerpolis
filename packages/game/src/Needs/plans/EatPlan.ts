import { v4 as uuidv4 } from 'uuid'
import type { BuildingManager } from '../../Buildings'
import type { ReservationSystem } from '../../Reservation'
import { SettlerState } from '../../Population/types'
import type { WorkAction } from '../../Settlers/WorkProvider/types'
import { WorkActionType } from '../../Settlers/WorkProvider/types'
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

	if (source.type === 'storage') {
		const building = deps.buildings.getBuildingInstance(source.buildingInstanceId)
		if (!building) {
			return { reason: 'food_building_missing' }
		}
		const reservationId = deps.reservations.reserveStorageOutgoing(building.id, source.itemType, 1, settlerId)
		if (!reservationId) {
			return { reason: 'food_unavailable' }
		}
		releaseFns.push(() => deps.reservations.releaseStorageReservation(reservationId))

		actions.push(
			{ type: WorkActionType.Move, position: building.position, targetType: 'building', targetId: building.id, setState: SettlerState.MovingToBuilding },
			{ type: WorkActionType.WithdrawStorage, buildingInstanceId: building.id, itemType: source.itemType, quantity: 1, reservationId, setState: SettlerState.CarryingItem }
		)
	}

	if (source.type === 'ground') {
		const reserved = deps.reservations.reserveLootItem(source.itemId, settlerId)
		if (!reserved) {
			return { reason: 'food_reserved' }
		}
		releaseFns.push(() => deps.reservations.releaseLootReservation(source.itemId, settlerId))
		actions.push(
			{ type: WorkActionType.Move, position: source.position, targetType: 'item', targetId: source.itemId, setState: SettlerState.MovingToItem },
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
			releaseReservations: () => releaseFns.forEach(fn => fn())
		}
	}
}
