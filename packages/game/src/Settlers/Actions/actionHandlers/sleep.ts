import { WorkActionType } from '../../Work/types'
import type { ActionHandler } from './types'

export const SleepActionHandler: ActionHandler = {
	type: WorkActionType.Sleep,
	start: ({ action, nowMs, setInProgress }) => {
		if (action.type !== WorkActionType.Sleep) {
			return
		}
		setInProgress({
			type: WorkActionType.Sleep,
			endAtMs: nowMs + action.durationMs
		})
	}
}
