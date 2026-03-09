import { SettlerActionType } from '../types'
import type { ActionHandler } from './types'

export const SleepActionHandler: ActionHandler = {
	type: SettlerActionType.Sleep,
	start: ({ settlerId, action, managers, nowMs, setInProgress }) => {
		if (action.type !== SettlerActionType.Sleep) {
			return
		}
		if (action.insideBuildingId) {
			managers.population.setSettlerInsideBuilding(settlerId, action.insideBuildingId)
			managers.population.setSettlerTarget(settlerId, undefined, undefined, undefined)
		}
		setInProgress({
			type: SettlerActionType.Sleep,
			endAtMs: nowMs + action.durationMs
		})
	},
	onComplete: ({ settlerId, action, managers }) => {
		if (action.type !== SettlerActionType.Sleep) {
			return
		}
		if (action.insideBuildingId) {
			managers.population.setSettlerInsideBuilding(settlerId, undefined)
		}
	},
	onFail: ({ settlerId, action, managers }) => {
		if (action.type !== SettlerActionType.Sleep) {
			return
		}
		if (action.insideBuildingId) {
			managers.population.setSettlerInsideBuilding(settlerId, undefined)
		}
	}
}
