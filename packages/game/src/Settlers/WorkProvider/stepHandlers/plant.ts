import { SettlerState } from '../../../Population/types'
import { WorkActionType, WorkStepType } from '../types'
import type { StepHandler, StepHandlerResult } from './types'

export const PlantHandler: StepHandler = {
	type: WorkStepType.Plant,
	build: ({ step }): StepHandlerResult => {
		if (step.type !== WorkStepType.Plant) {
			return { actions: [] }
		}

		return {
			actions: [
				{ type: WorkActionType.Move, position: step.position, targetType: 'plot', targetId: `${step.position.x},${step.position.y}`, setState: SettlerState.MovingToResource },
				{ type: WorkActionType.Wait, durationMs: step.plantTimeMs, setState: SettlerState.Working },
				{ type: WorkActionType.Plant, buildingInstanceId: step.buildingInstanceId, nodeType: step.nodeType, position: step.position, growTimeMs: step.growTimeMs, setState: SettlerState.Working }
			]
		}
	}
}
