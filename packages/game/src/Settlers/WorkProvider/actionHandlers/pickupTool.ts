import { WorkActionType } from '../types'
import type { ActionHandler } from './types'

export const PickupToolActionHandler: ActionHandler = {
	type: WorkActionType.PickupTool,
	start: ({ settlerId, action, managers, complete, fail }) => {
		if (action.type !== WorkActionType.PickupTool) {
			return
		}
		const client = managers.population.getServerClient()
		const item = managers.loot.pickItem(action.itemId, client)
		if (!item) {
			fail('loot_pickup_failed')
			return
		}
		managers.population.setSettlerEquippedItem(settlerId, item.itemType, 1)
		complete()
	}
}
