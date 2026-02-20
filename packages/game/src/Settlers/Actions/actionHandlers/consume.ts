import { SettlerActionType } from '../types'
import type { ActionHandler } from './types'

export const ConsumeActionHandler: ActionHandler = {
	type: SettlerActionType.Consume,
	start: ({ action, nowMs, setInProgress }) => {
		if (action.type !== SettlerActionType.Consume) {
			return
		}
		setInProgress({
			type: SettlerActionType.Consume,
			endAtMs: nowMs + action.durationMs
		})
	},
	onComplete: ({ settlerId, managers }) => {
		managers.population.setSettlerCarryingItem(settlerId, undefined)
	}
}
