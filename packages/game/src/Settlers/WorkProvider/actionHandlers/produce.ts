import { WorkActionType } from '../types'
import type { ActionHandler } from './types'

export const ProduceActionHandler: ActionHandler = {
	type: WorkActionType.Produce,
	start: ({ action, complete }) => {
		if (action.type !== WorkActionType.Produce) {
			return
		}
		complete()
	}
}
