import { WorkActionType } from '../types'
import type { ActionHandler } from './types'

export const FollowPathActionHandler: ActionHandler = {
	type: WorkActionType.FollowPath,
	start: ({ settlerId, action, managers, complete, fail }) => {
		if (action.type !== WorkActionType.FollowPath) {
			return
		}
		if (!action.path || action.path.length === 0) {
			fail('movement_failed')
			return
		}

		const targetPosition = action.path[action.path.length - 1]
		managers.population.setSettlerTarget(settlerId, action.targetId, targetPosition, action.targetType)

		const started = managers.movement.moveAlongPath(settlerId, action.path, {
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
	},
	onComplete: ({ settlerId, managers }) => {
		managers.population.setSettlerTarget(settlerId, undefined, undefined, undefined)
	}
}
