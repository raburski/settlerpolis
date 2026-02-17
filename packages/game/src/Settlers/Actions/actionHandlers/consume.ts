import { WorkActionType } from '../../Work/types'
import type { ActionHandler } from './types'

export const ConsumeActionHandler: ActionHandler = {
	type: WorkActionType.Consume,
	start: ({ action, nowMs, setInProgress }) => {
		if (action.type !== WorkActionType.Consume) {
			return
		}
		setInProgress({
			type: WorkActionType.Consume,
			endAtMs: nowMs + action.durationMs
		})
	},
	onComplete: ({ settlerId, managers }) => {
		managers.population.setSettlerCarryingItem(settlerId, undefined)
	}
}
