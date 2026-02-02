import { SettlerState } from '../../../Population/types'
import { WorkActionType, WorkStepType, type WorkAction } from '../types'
import type { StepHandler, StepHandlerResult } from './types'

export const PlantHandler: StepHandler = {
	type: WorkStepType.Plant,
	build: ({ step, managers }): StepHandlerResult => {
		if (step.type !== WorkStepType.Plant) {
			return { actions: [] }
		}

		const building = managers.buildings.getBuildingInstance(step.buildingInstanceId)
		const definition = building ? managers.buildings.getBuildingDefinition(building.buildingId) : undefined
		const postPlantReturnWaitMs = definition?.farm?.postPlantReturnWaitMs ?? 0

		const actions: WorkAction[] = [
			{ type: WorkActionType.Move, position: step.position, targetType: 'plot', targetId: `${step.position.x},${step.position.y}`, setState: SettlerState.MovingToResource },
			{ type: WorkActionType.Wait, durationMs: step.plantTimeMs, setState: SettlerState.Working },
			{ type: WorkActionType.Plant, buildingInstanceId: step.buildingInstanceId, nodeType: step.nodeType, position: step.position, growTimeMs: step.growTimeMs, spoilTimeMs: step.spoilTimeMs, despawnTimeMs: step.despawnTimeMs, setState: SettlerState.Working }
		]

		if (building && postPlantReturnWaitMs > 0) {
			actions.push(
				{ type: WorkActionType.Move, position: building.position, targetType: 'building', targetId: building.id, setState: SettlerState.MovingToBuilding },
				{ type: WorkActionType.Wait, durationMs: postPlantReturnWaitMs, setState: SettlerState.WaitingForWork }
			)
		}

		return {
			actions
		}
	}
}
