import { WorkActionType } from '../types'
import type { ActionHandler } from './types'

export const DeliverStorageActionHandler: ActionHandler = {
	type: WorkActionType.DeliverStorage,
	start: ({ settlerId, action, managers, complete, fail }) => {
		if (action.type !== WorkActionType.DeliverStorage) {
			return
		}
		const ok = managers.storage.addToStorage(action.buildingInstanceId, action.itemType, action.quantity)
		if (!ok) {
			fail('storage_deliver_failed')
			return
		}
		managers.population.setSettlerCarryingItem(settlerId, undefined)
		complete()
	}
}
