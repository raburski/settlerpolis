import { WorkActionType } from '../../Work/types'
import { SettlerActionFailureReason } from '../../failureReasons'
import type { ActionHandler } from './types'

export const DeliverConstructionActionHandler: ActionHandler = {
	type: WorkActionType.DeliverConstruction,
	start: ({ settlerId, action, managers, complete, fail }) => {
		if (action.type !== WorkActionType.DeliverConstruction) {
			return
		}
		const ok = managers.buildings.addResourceToBuilding(action.buildingInstanceId, action.itemType, action.quantity)
		if (!ok) {
			fail(SettlerActionFailureReason.ConstructionDeliverFailed)
			return
		}
		managers.population.setSettlerCarryingItem(settlerId, undefined)
		complete()
	}
}
