import { SettlerActionType } from '../types'
import type { ActionHandler } from './types'

export const SleepActionHandler: ActionHandler = {
	type: SettlerActionType.Sleep,
	start: ({ action, nowMs, setInProgress }) => {
		if (action.type !== SettlerActionType.Sleep) {
			return
		}
		setInProgress({
			type: SettlerActionType.Sleep,
			endAtMs: nowMs + action.durationMs
		})
	}
}
