import { SettlerActionType } from '../types'
import type { ActionHandler } from './types'

export const ConstructActionHandler: ActionHandler = {
	type: SettlerActionType.Construct,
	start: ({ settlerId, action, managers, nowMs, setInProgress }) => {
		if (action.type !== SettlerActionType.Construct) {
			return
		}
		managers.buildings.setConstructionWorkerActive(action.buildingInstanceId, settlerId, true)
		setInProgress({
			type: SettlerActionType.Construct,
			endAtMs: nowMs + action.durationMs,
			buildingInstanceId: action.buildingInstanceId
		})
	}
	,
	onComplete: ({ settlerId, action, managers }) => {
		if (action.type !== SettlerActionType.Construct) {
			return
		}
		managers.buildings.setConstructionWorkerActive(action.buildingInstanceId, settlerId, false)
	},
	onFail: ({ settlerId, action, managers }) => {
		if (action.type !== SettlerActionType.Construct) {
			return
		}
		managers.buildings.setConstructionWorkerActive(action.buildingInstanceId, settlerId, false)
	}
}
