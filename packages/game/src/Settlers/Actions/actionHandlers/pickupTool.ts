import { SettlerActionType } from '../types'
import { SettlerActionFailureReason } from '../../failureReasons'
import type { ActionHandler } from './types'

export const PickupToolActionHandler: ActionHandler = {
	type: SettlerActionType.PickupTool,
	start: ({ settlerId, action, managers, complete, fail }) => {
		if (action.type !== SettlerActionType.PickupTool) {
			return
		}
		const client = managers.population.getServerClient()
		const item = managers.loot.pickItem(action.itemId, client)
		if (!item) {
			fail(SettlerActionFailureReason.LootPickupFailed)
			return
		}
		managers.population.setSettlerEquippedItem(settlerId, item.itemType, 1)
		complete()
	}
}
