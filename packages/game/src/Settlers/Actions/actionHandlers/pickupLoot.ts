import { WorkActionType } from '../../Work/types'
import { SettlerActionFailureReason } from '../../failureReasons'
import type { ActionHandler } from './types'

export const PickupLootActionHandler: ActionHandler = {
	type: WorkActionType.PickupLoot,
	start: ({ settlerId, action, managers, complete, fail }) => {
		if (action.type !== WorkActionType.PickupLoot) {
			return
		}
		const client = managers.population.getServerClient()
		const item = managers.loot.pickItem(action.itemId, client)
		if (!item) {
			fail(SettlerActionFailureReason.LootPickupFailed)
			return
		}
		managers.population.setSettlerCarryingItem(settlerId, item.itemType, 1)
		complete()
	}
}
