import { WorkActionType } from '../../Work/types'
import type { ActionHandler } from './types'

export const WaitActionHandler: ActionHandler = {
	type: WorkActionType.Wait,
	start: ({ action, nowMs, setInProgress }) => {
		if (action.type !== WorkActionType.Wait) {
			return
		}
		setInProgress({
			type: WorkActionType.Wait,
			endAtMs: nowMs + action.durationMs
		})
	}
}
