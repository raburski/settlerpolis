import { SettlerState } from '../../../Population/types'
import { WorkActionType, WorkStepType } from '../types'
import type { StepHandler, StepHandlerResult } from './types'

export const StepAwayHandler: StepHandler = {
	type: WorkStepType.StepAway,
	build: ({ step }): StepHandlerResult => {
		if (step.type !== WorkStepType.StepAway) {
			return { actions: [] }
		}
		return {
			actions: [{
				type: WorkActionType.Move,
				position: step.targetPosition,
				targetType: step.targetType,
				targetId: step.targetId,
				setState: SettlerState.Moving
			}]
		}
	}
}
