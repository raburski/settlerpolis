import { SettlerState } from '../../../Population/types'
import { WorkActionType, WorkStepType } from '../types'
import type { StepHandler, StepHandlerResult } from './types'

export const WaitHandler: StepHandler = {
	type: WorkStepType.Wait,
	build: ({ step, simulationTimeMs }): StepHandlerResult => {
		if (step.type !== WorkStepType.Wait) {
			return { actions: [] }
		}
		const durationMs = step.retryAtMs ? Math.max(0, step.retryAtMs - simulationTimeMs) : 1500
		return { actions: [{ type: WorkActionType.Wait, durationMs, setState: SettlerState.WaitingForWork }] }
	}
}
