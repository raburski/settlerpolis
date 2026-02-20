import { SettlerActionType } from '../types'
import { SettlerActionFailureReason } from '../../failureReasons'
import type { ActionHandler } from './types'

export const PlantActionHandler: ActionHandler = {
	type: SettlerActionType.Plant,
	start: ({ action, managers, complete, fail }) => {
		if (action.type !== SettlerActionType.Plant) {
			return
		}

		const building = managers.buildings.getBuildingInstance(action.buildingInstanceId)
		if (!building) {
			fail(SettlerActionFailureReason.BuildingNotFound)
			return
		}

		const planted = managers.resourceNodes.plantNode({
			nodeType: action.nodeType,
			mapId: building.mapId,
			position: action.position,
			growTimeMs: action.growTimeMs,
			spoilTimeMs: action.spoilTimeMs,
			despawnTimeMs: action.despawnTimeMs,
			tileBased: false
		})

		if (!planted) {
			fail(SettlerActionFailureReason.PlantFailed)
			return
		}

		complete()
	}
}
