import { SettlerState } from '../../../Population/types'
import { WorkActionType, WorkStepType } from '../types'
import type { StepHandler, StepHandlerResult } from './types'
import { MoveTargetType } from '../../../Movement/types'

export const ProspectHandler: StepHandler = {
	type: WorkStepType.Prospect,
	build: ({ step, managers }): StepHandlerResult => {
		if (step.type !== WorkStepType.Prospect) {
			return { actions: [] }
		}

		const node = managers.resourceNodes.getNode(step.resourceNodeId)
		if (!node) {
			return { actions: [] }
		}

		return {
			actions: [
				{ type: WorkActionType.Move, position: node.position, targetType: MoveTargetType.Resource, targetId: node.id, setState: SettlerState.MovingToResource },
				{ type: WorkActionType.Wait, durationMs: step.durationMs, setState: SettlerState.Prospecting },
				{ type: WorkActionType.ProspectNode, nodeId: node.id, setState: SettlerState.Working }
			]
		}
	}
}
