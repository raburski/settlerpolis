import { SettlerActionType } from '../types'
import type { ActionHandler } from './types'

export const ChangeProfessionActionHandler: ActionHandler = {
	type: SettlerActionType.ChangeProfession,
	start: ({ settlerId, action, managers, complete }) => {
		if (action.type !== SettlerActionType.ChangeProfession) {
			return
		}
		managers.population.setSettlerProfession(settlerId, action.profession)
		complete()
	}
}
