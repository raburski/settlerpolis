import { SettlerActionType } from '../types'
import type { ActionHandler } from './types'

export const BuildRoadActionHandler: ActionHandler = {
	type: SettlerActionType.BuildRoad,
	start: ({ action, nowMs, setInProgress }) => {
		if (action.type !== SettlerActionType.BuildRoad) {
			return
		}
		setInProgress({
			type: SettlerActionType.BuildRoad,
			endAtMs: nowMs + action.durationMs,
			jobId: action.jobId
		})
	},
	onComplete: ({ action, managers }) => {
		if (action.type !== SettlerActionType.BuildRoad) {
			return
		}
		managers.roads.completeJob(action.jobId)
	},
	onFail: ({ action, managers }) => {
		if (action.type !== SettlerActionType.BuildRoad) {
			return
		}
		managers.roads.releaseJob(action.jobId)
	}
}
