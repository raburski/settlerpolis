import { SettlerState } from '../../../Population/types'
import { WorkStepType } from '../types'
import { SettlerActionType } from '../../Actions/types'
import type { SettlerAction } from '../../Actions/types'
import type { StepHandler, StepHandlerResult } from './types'
import { MoveTargetType } from '../../../Movement/types'

export const PlantHandler: StepHandler = {
	type: WorkStepType.Plant,
	build: ({ step, managers }): StepHandlerResult => {
		if (step.type !== WorkStepType.Plant) {
			return { actions: [] }
		}

		const building = managers.buildings.getBuildingInstance(step.buildingInstanceId)
		const definition = building ? managers.buildings.getBuildingDefinition(building.buildingId) : undefined
		const postPlantReturnWaitMs = definition?.farm?.postPlantReturnWaitMs

		const actions: SettlerAction[] = [
			{ type: SettlerActionType.Move, position: step.position, targetType: MoveTargetType.Plot, targetId: `${step.position.x},${step.position.y}`, setState: SettlerState.MovingToResource },
			{ type: SettlerActionType.Wait, durationMs: step.plantTimeMs, setState: SettlerState.Working },
			{ type: SettlerActionType.Plant, buildingInstanceId: step.buildingInstanceId, nodeType: step.nodeType, position: step.position, growTimeMs: step.growTimeMs, spoilTimeMs: step.spoilTimeMs, despawnTimeMs: step.despawnTimeMs, setState: SettlerState.Working }
		]

		if (building && postPlantReturnWaitMs !== undefined) {
			actions.push(
				{ type: SettlerActionType.Move, position: building.position, targetType: MoveTargetType.Building, targetId: building.id, setState: SettlerState.MovingToBuilding },
				...(postPlantReturnWaitMs > 0
					? [{ type: SettlerActionType.Wait, durationMs: postPlantReturnWaitMs, setState: SettlerState.WaitingForWork } as SettlerAction]
					: [])
			)
		}

		return {
			actions
		}
	}
}
