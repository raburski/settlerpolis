import { SettlerState } from '../../../Population/types'
import { WorkActionType, WorkStepType } from '../types'
import type { StepHandler, StepHandlerResult } from './types'

export const ConstructHandler: StepHandler = {
	type: WorkStepType.Construct,
	build: ({ step, managers }): StepHandlerResult => {
		if (step.type !== WorkStepType.Construct) {
			return { actions: [] }
		}

		const building = managers.buildings.getBuildingInstance(step.buildingInstanceId)
		if (!building) {
			return { actions: [] }
		}

		return {
			actions: [
				{ type: WorkActionType.Move, position: building.position, targetType: 'building', targetId: building.id, setState: SettlerState.MovingToBuilding },
				{ type: WorkActionType.Construct, buildingInstanceId: building.id, durationMs: step.durationMs, setState: SettlerState.Working }
			]
		}
	}
}
