import { SettlerState } from '../../../Population/types'
import { WorkActionType, WorkStepType } from '../types'
import type { StepHandler, StepHandlerResult } from './types'

export const BuildRoadHandler: StepHandler = {
	type: WorkStepType.BuildRoad,
	build: ({ step }): StepHandlerResult => {
		if (step.type !== WorkStepType.BuildRoad) {
			return { actions: [] }
		}

		return {
			actions: [
				{ type: WorkActionType.Move, position: step.position, targetType: 'road_tile', targetId: step.jobId, setState: SettlerState.MovingToBuilding },
				{ type: WorkActionType.BuildRoad, jobId: step.jobId, durationMs: step.durationMs, setState: SettlerState.Working }
			]
		}
	}
}
