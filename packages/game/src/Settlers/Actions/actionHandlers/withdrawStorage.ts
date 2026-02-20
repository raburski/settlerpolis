import { WorkActionType } from '../../Work/types'
import { SettlerActionFailureReason } from '../../failureReasons'
import type { ActionHandler } from './types'

export const WithdrawStorageActionHandler: ActionHandler = {
	type: WorkActionType.WithdrawStorage,
	start: ({ settlerId, action, managers, complete, fail }) => {
		if (action.type !== WorkActionType.WithdrawStorage) {
			return
		}
		const ok = managers.storage.removeFromStorage(action.buildingInstanceId, action.itemType, action.quantity, action.reservationId)
		if (!ok) {
			fail(SettlerActionFailureReason.StorageWithdrawFailed)
			return
		}
		managers.population.setSettlerCarryingItem(settlerId, action.itemType, action.quantity)
		complete()
	}
}
