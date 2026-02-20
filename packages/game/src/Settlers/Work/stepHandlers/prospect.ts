import { SettlerState } from '../../../Population/types'
import { WorkStepType } from '../types'
import { SettlerActionType } from '../../Actions/types'
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
				{ type: SettlerActionType.Move, position: node.position, targetType: MoveTargetType.Resource, targetId: node.id, setState: SettlerState.MovingToResource },
				{ type: SettlerActionType.Wait, durationMs: step.durationMs, setState: SettlerState.Prospecting },
				{ type: SettlerActionType.ProspectNode, nodeId: node.id, setState: SettlerState.Working }
			]
		}
	}
}
