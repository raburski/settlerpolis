import { WorkActionType } from '../../Work/types'
import type { ActionHandler } from './types'

export const ChangeProfessionActionHandler: ActionHandler = {
	type: WorkActionType.ChangeProfession,
	start: ({ settlerId, action, managers, complete }) => {
		if (action.type !== WorkActionType.ChangeProfession) {
			return
		}
		managers.population.setSettlerProfession(settlerId, action.profession)
		complete()
	}
}
