import { SettlerState } from '../../../Population/types'
import { WorkStepType } from '../types'
import { SettlerActionType } from '../../Actions/types'
import type { StepHandler, StepHandlerResult } from './types'
import { MoveTargetType } from '../../../Movement/types'

export const BuildRoadHandler: StepHandler = {
	type: WorkStepType.BuildRoad,
	build: ({ step }): StepHandlerResult => {
		if (step.type !== WorkStepType.BuildRoad) {
			return { actions: [] }
		}

		return {
			actions: [
				{ type: SettlerActionType.Move, position: step.position, targetType: MoveTargetType.RoadTile, targetId: step.jobId, setState: SettlerState.MovingToBuilding },
				{ type: SettlerActionType.BuildRoad, jobId: step.jobId, durationMs: step.durationMs, setState: SettlerState.Working }
			]
		}
	}
}
