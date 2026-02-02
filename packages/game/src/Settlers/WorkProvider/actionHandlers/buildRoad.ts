import { WorkActionType } from '../types'
import type { ActionHandler } from './types'

export const BuildRoadActionHandler: ActionHandler = {
	type: WorkActionType.BuildRoad,
	start: ({ action, nowMs, setInProgress }) => {
		if (action.type !== WorkActionType.BuildRoad) {
			return
		}
		setInProgress({
			type: WorkActionType.BuildRoad,
			endAtMs: nowMs + action.durationMs,
			jobId: action.jobId
		})
	},
	onComplete: ({ action, managers }) => {
		if (action.type !== WorkActionType.BuildRoad) {
			return
		}
		managers.roads.completeJob(action.jobId)
	},
	onFail: ({ action, managers }) => {
		if (action.type !== WorkActionType.BuildRoad) {
			return
		}
		managers.roads.releaseJob(action.jobId)
	}
}
