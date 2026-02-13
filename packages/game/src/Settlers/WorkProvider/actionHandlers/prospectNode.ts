import { WorkActionType } from '../types'
import type { ActionHandler } from './types'

export const ProspectNodeActionHandler: ActionHandler = {
	type: WorkActionType.ProspectNode,
	start: ({ action, managers, complete }) => {
		if (action.type !== WorkActionType.ProspectNode) {
			complete()
			return
		}
		managers.resourceNodes.completeProspectingJob(action.nodeId)
		complete()
	}
}
