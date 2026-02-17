import { WorkActionType } from '../../Work/types'
import type { ActionHandler } from './types'

export const HarvestNodeActionHandler: ActionHandler = {
	type: WorkActionType.HarvestNode,
	start: ({ settlerId, action, managers, complete, fail }) => {
		if (action.type !== WorkActionType.HarvestNode) {
			return
		}
		const item = managers.resourceNodes.harvestNode(action.nodeId, settlerId)
		if (!item) {
			fail('harvest_failed')
			return
		}
		managers.population.setSettlerCarryingItem(settlerId, item.itemType, action.quantity)
		complete()
	}
}
