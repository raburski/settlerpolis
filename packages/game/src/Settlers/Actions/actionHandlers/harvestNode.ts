import { SettlerActionType } from '../types'
import { SettlerActionFailureReason } from '../../failureReasons'
import type { ActionHandler } from './types'

export const HarvestNodeActionHandler: ActionHandler = {
	type: SettlerActionType.HarvestNode,
	start: ({ settlerId, action, managers, complete, fail }) => {
		if (action.type !== SettlerActionType.HarvestNode) {
			return
		}
		const item = managers.resourceNodes.harvestNode(action.nodeId, settlerId)
		if (!item) {
			fail(SettlerActionFailureReason.HarvestFailed)
			return
		}
		managers.population.setSettlerCarryingItem(settlerId, item.itemType, action.quantity)
		complete()
	}
}
