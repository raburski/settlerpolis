import { SettlerActionType } from '../types'
import { SettlerActionFailureReason } from '../../failureReasons'
import type { ActionHandler } from './types'

export const DeliverConstructionActionHandler: ActionHandler = {
	type: SettlerActionType.DeliverConstruction,
	start: ({ settlerId, action, managers, complete, fail }) => {
		if (action.type !== SettlerActionType.DeliverConstruction) {
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
