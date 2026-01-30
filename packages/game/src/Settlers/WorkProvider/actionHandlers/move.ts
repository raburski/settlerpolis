import { WorkActionType } from '../types'
import type { ActionHandler } from './types'

export const MoveActionHandler: ActionHandler = {
	type: WorkActionType.Move,
	start: ({ settlerId, action, managers, complete, fail }) => {
		if (action.type !== WorkActionType.Move) {
			return
		}
		managers.population.setSettlerTarget(settlerId, action.targetId, action.position, action.targetType)
		const started = managers.movement.moveToPosition(settlerId, action.position, {
			targetType: action.targetType,
			targetId: action.targetId,
			callbacks: {
				onPathComplete: () => {
					complete()
				},
				onCancelled: () => {
					fail('movement_cancelled')
				}
			}
		})
		if (!started) {
			fail('movement_failed')
		}
	}
	,
	onComplete: ({ settlerId, managers }) => {
		managers.population.setSettlerTarget(settlerId, undefined, undefined, undefined)
	}
}
