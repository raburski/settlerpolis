import { SettlerActionType } from '../types'
import type { ActionHandler } from './types'

export const ProspectNodeActionHandler: ActionHandler = {
	type: SettlerActionType.ProspectNode,
	start: ({ action, managers, complete }) => {
		if (action.type !== SettlerActionType.ProspectNode) {
			complete()
			return
		}
		managers.resourceNodes.completeProspectingJob(action.nodeId)
		complete()
	}
}
