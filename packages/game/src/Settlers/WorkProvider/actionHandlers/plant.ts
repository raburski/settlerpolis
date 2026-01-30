import { WorkActionType } from '../types'
import type { ActionHandler } from './types'

export const PlantActionHandler: ActionHandler = {
	type: WorkActionType.Plant,
	start: ({ action, managers, complete, fail }) => {
		if (action.type !== WorkActionType.Plant) {
			return
		}

		const building = managers.buildings.getBuildingInstance(action.buildingInstanceId)
		if (!building) {
			fail('building_not_found')
			return
		}

		const planted = managers.resourceNodes.plantNode({
			nodeType: action.nodeType,
			mapName: building.mapName,
			position: action.position,
			growTimeMs: action.growTimeMs,
			tileBased: false
		})

		if (!planted) {
			fail('plant_failed')
			return
		}

		complete()
	}
}
