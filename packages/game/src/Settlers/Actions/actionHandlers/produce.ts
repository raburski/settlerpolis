import { WorkActionType } from '../../Work/types'
import type { ActionHandler } from './types'

export const ProduceActionHandler: ActionHandler = {
	type: WorkActionType.Produce,
	start: ({ action, managers, complete }) => {
		if (action.type !== WorkActionType.Produce) {
			return
		}
		const building = managers.buildings.getBuildingInstance(action.buildingInstanceId)
		if (building?.resourceNodeId) {
			managers.resourceNodes.consumeDeposit(building.resourceNodeId, 1)
		}
		complete()
	}
}
