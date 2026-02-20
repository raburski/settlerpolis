import { SettlerActionType } from '../types'
import type { ActionHandler } from './types'

export const ProduceActionHandler: ActionHandler = {
	type: SettlerActionType.Produce,
	start: ({ action, managers, complete }) => {
		if (action.type !== SettlerActionType.Produce) {
			return
		}
		const building = managers.buildings.getBuildingInstance(action.buildingInstanceId)
		if (building?.resourceNodeId) {
			managers.resourceNodes.consumeDeposit(building.resourceNodeId, 1)
		}
		complete()
	}
}
