import { WorkActionType } from '../../Work/types'
import type { ActionHandler } from './types'

export const ConstructActionHandler: ActionHandler = {
	type: WorkActionType.Construct,
	start: ({ settlerId, action, managers, nowMs, setInProgress }) => {
		if (action.type !== WorkActionType.Construct) {
			return
		}
		managers.buildings.setConstructionWorkerActive(action.buildingInstanceId, settlerId, true)
		setInProgress({
			type: WorkActionType.Construct,
			endAtMs: nowMs + action.durationMs,
			buildingInstanceId: action.buildingInstanceId
		})
	}
	,
	onComplete: ({ settlerId, action, managers }) => {
		if (action.type !== WorkActionType.Construct) {
			return
		}
		managers.buildings.setConstructionWorkerActive(action.buildingInstanceId, settlerId, false)
	},
	onFail: ({ settlerId, action, managers }) => {
		if (action.type !== WorkActionType.Construct) {
			return
		}
		managers.buildings.setConstructionWorkerActive(action.buildingInstanceId, settlerId, false)
	}
}
