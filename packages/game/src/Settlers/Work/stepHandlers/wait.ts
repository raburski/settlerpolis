import { SettlerState } from '../../../Population/types'
import { WorkProviderType, WorkStepType, WorkWaitReason } from '../types'
import { SettlerActionType } from '../../Actions/types'
import type { StepHandler, StepHandlerResult } from './types'
import { MoveTargetType } from '../../../Movement/types'

export const WaitHandler: StepHandler = {
	type: WorkStepType.Wait,
	build: ({ step, simulationTimeMs, assignment, managers }): StepHandlerResult => {
		if (step.type !== WorkStepType.Wait) {
			return { actions: [] }
		}

		if (step.reason === WorkWaitReason.MissingInputs &&
			assignment.providerType === WorkProviderType.Building &&
			assignment.buildingInstanceId) {
			const building = managers.buildings.getBuildingInstance(assignment.buildingInstanceId)
			if (building) {
				const durationMs = step.retryAtMs ? Math.max(0, step.retryAtMs - simulationTimeMs) : 1500
				return {
					actions: [
						{ type: SettlerActionType.Move, position: building.position, targetType: MoveTargetType.Building, targetId: building.id, setState: SettlerState.MovingToBuilding },
						{ type: SettlerActionType.Wait, durationMs, setState: SettlerState.WaitingForWork }
					]
				}
			}
		}

		if (step.reason === WorkWaitReason.NoWork &&
			assignment.providerType === WorkProviderType.Building &&
			assignment.buildingInstanceId) {
			const building = managers.buildings.getBuildingInstance(assignment.buildingInstanceId)
			if (building && building.buildingId === 'guildhall') {
				const durationMs = step.retryAtMs ? Math.max(0, step.retryAtMs - simulationTimeMs) : 1500
				return {
					actions: [
						{ type: SettlerActionType.Move, position: building.position, targetType: MoveTargetType.Building, targetId: building.id, setState: SettlerState.MovingToBuilding },
						{ type: SettlerActionType.Wait, durationMs, setState: SettlerState.WaitingForWork }
					]
				}
			}
		}

		const durationMs = step.retryAtMs ? Math.max(0, step.retryAtMs - simulationTimeMs) : 1500
		return { actions: [{ type: SettlerActionType.Wait, durationMs, setState: SettlerState.WaitingForWork }] }
	}
}
