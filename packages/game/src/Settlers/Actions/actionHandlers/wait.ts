import { SettlerActionType } from '../types'
import type { ActionHandler } from './types'

export const WaitActionHandler: ActionHandler = {
	type: SettlerActionType.Wait,
	start: ({ action, nowMs, setInProgress }) => {
		if (action.type !== SettlerActionType.Wait) {
			return
		}
		setInProgress({
			type: SettlerActionType.Wait,
			endAtMs: nowMs + action.durationMs
		})
	}
}
