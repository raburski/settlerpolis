import { WorkActionType } from '../../Work/types'
import { SettlerActionFailureReason } from '../../failureReasons'
import type { ActionHandler } from './types'

export const DeliverStorageActionHandler: ActionHandler = {
	type: WorkActionType.DeliverStorage,
	start: ({ settlerId, action, managers, complete, fail }) => {
		if (action.type !== WorkActionType.DeliverStorage) {
			return
		}
		const ok = managers.storage.addToStorage(action.buildingInstanceId, action.itemType, action.quantity, action.reservationId)
		if (!ok) {
			fail(SettlerActionFailureReason.StorageDeliverFailed)
			return
		}
		const settler = managers.population.getSettler(settlerId)
		const currentType = settler?.stateContext.carryingItemType
		const currentQuantity = settler?.stateContext.carryingQuantity
		if (currentType && currentType === action.itemType && typeof currentQuantity === 'number') {
			const remaining = Math.max(0, currentQuantity - action.quantity)
			if (remaining > 0) {
				managers.population.setSettlerCarryingItem(settlerId, currentType, remaining)
			} else {
				managers.population.setSettlerCarryingItem(settlerId, undefined)
			}
		} else {
			managers.population.setSettlerCarryingItem(settlerId, undefined)
		}
		complete()
	}
}
