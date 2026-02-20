import { SettlerState } from '../../../Population/types'
import { WorkStepType } from '../types'
import { SettlerActionType } from '../../Actions/types'
import type { StepHandler, StepHandlerResult } from './types'

export const StepAwayHandler: StepHandler = {
	type: WorkStepType.StepAway,
	build: ({ step }): StepHandlerResult => {
		if (step.type !== WorkStepType.StepAway) {
			return { actions: [] }
		}
		return {
			actions: [{
				type: SettlerActionType.Move,
				position: step.targetPosition,
				targetType: step.targetType,
				targetId: step.targetId,
				setState: SettlerState.Moving
			}]
		}
	}
}
