import type { MovementTask } from './types'
import { MovementManagerState } from './MovementManagerState'
import { OccupancyTracker } from './OccupancyTracker'

export const releaseTileReservation = (
	task: MovementTask,
	state: MovementManagerState,
	occupancy: OccupancyTracker
): void => {
	if (task.segmentReservedTileIndex === undefined) {
		task.segmentHeading = undefined
		task.segmentReservedTileIndex = undefined
		return
	}

	const entity = state.entities.get(task.entityId)
	if (!entity) {
		task.segmentHeading = undefined
		task.segmentReservedTileIndex = undefined
		return
	}

	const heading = task.segmentHeading ?? 0
	occupancy.removeTileOccupancy(entity.mapId, task.segmentReservedTileIndex, heading)
	task.segmentHeading = undefined
	task.segmentReservedTileIndex = undefined
}
