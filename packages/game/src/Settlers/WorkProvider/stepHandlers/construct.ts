import { SettlerState } from '../../../Population/types'
import { WorkActionType, WorkStepType } from '../types'
import type { StepHandler, StepHandlerResult } from './types'
import { MoveTargetType } from '../../../Movement/types'
import { getRandomPositionInBuildingFootprint, isWithinBuildingFootprint } from '../../../Buildings/utils'

const CONSTRUCTION_WANDER_ATTEMPTS = 4

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
		const definition = managers.buildings.getBuildingDefinition(building.buildingId)
		const map = managers.map.getMap(building.mapId)
		let workPosition = building.position
		if (definition) {
			for (let attempt = 0; attempt < CONSTRUCTION_WANDER_ATTEMPTS; attempt += 1) {
				const candidate = getRandomPositionInBuildingFootprint(building, definition, map)
				workPosition = candidate
				if (!map) {
					break
				}
				const fallback = managers.map.findNearestWalkablePosition(building.mapId, candidate, 2)
				if (fallback && isWithinBuildingFootprint(fallback, building, definition, map.tiledMap?.tilewidth)) {
					workPosition = fallback
					break
				}
			}
		}

		return {
			actions: [
				{ type: WorkActionType.Move, position: workPosition, targetType: MoveTargetType.Building, targetId: building.id, setState: SettlerState.MovingToBuilding },
				{ type: WorkActionType.Construct, buildingInstanceId: building.id, durationMs: step.durationMs, setState: SettlerState.Working }
			]
		}
	}
}
