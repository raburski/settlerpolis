import { SettlerActionType } from '../types'
import { SettlerActionFailureReason } from '../../failureReasons'
import type { ActionHandler } from './types'

export const FollowPathActionHandler: ActionHandler = {
	type: SettlerActionType.FollowPath,
	start: ({ settlerId, action, managers, complete, fail }) => {
		if (action.type !== SettlerActionType.FollowPath) {
			return
		}
		if (!action.path || action.path.length === 0) {
			fail(SettlerActionFailureReason.MovementFailed)
			return
		}

		const targetPosition = action.path[action.path.length - 1]
		managers.population.setSettlerTarget(settlerId, action.targetId, targetPosition, action.targetType)

		const started = managers.movement.moveAlongPath(settlerId, action.path, {
			targetType: action.targetType,
			targetId: action.targetId,
			speedMultiplier: action.speedMultiplier,
			callbacks: {
				onPathComplete: () => {
					complete()
				},
				onCancelled: () => {
					fail(SettlerActionFailureReason.MovementCancelled)
				}
			}
		})

		if (!started) {
			fail(SettlerActionFailureReason.MovementFailed)
		}
	},
	onComplete: ({ settlerId, managers }) => {
		managers.population.setSettlerTarget(settlerId, undefined, undefined, undefined)
	}
}
