import type { Position } from '../types'
import type { MovementEntity } from './types'
import { MovementManagerState } from './MovementManagerState'
import { OccupancyTracker } from './OccupancyTracker'
import { MovementTaskStateMachine } from './MovementTaskStateMachine'

const DIRECTION_TO_CODE: Record<string, number> = {
	'0,-1': 0,
	'1,-1': 1,
	'1,0': 2,
	'1,1': 3,
	'0,1': 4,
	'-1,1': 5,
	'-1,0': 6,
	'-1,-1': 7
}

export interface SegmentAttemptSuccess {
	ok: true
	heading: number
	tileIndex?: number
}

export interface SegmentAttemptBlocked {
	ok: false
	blockedTileIndex: number
}

export type SegmentAttemptResult = SegmentAttemptSuccess | SegmentAttemptBlocked

export class MovementReservationPolicy {
	constructor(
		private readonly state: MovementManagerState,
		private readonly occupancy: OccupancyTracker,
		private readonly taskState: MovementTaskStateMachine
	) {}

	public tryReserveNextTile(entity: MovementEntity, from: Position, to: Position): SegmentAttemptResult {
		const tileIndex = this.occupancy.getTileIndexForPosition(entity.mapId, to)
		if (tileIndex < 0) {
			return { ok: true, heading: 0 }
		}

		const heading = this.getSegmentHeading(entity.mapId, from, to)
		if (!this.occupancy.canEnterTile(entity.mapId, tileIndex, heading)) {
			if (this.canBreakHeadOnDeadlock(entity, tileIndex, from, heading)) {
				this.occupancy.addTileOccupancy(entity.mapId, tileIndex, heading)
				return {
					ok: true,
					heading,
					tileIndex
				}
			}
			return {
				ok: false,
				blockedTileIndex: tileIndex
			}
		}

		this.occupancy.addTileOccupancy(entity.mapId, tileIndex, heading)
		return {
			ok: true,
			heading,
			tileIndex
		}
	}

	private canBreakHeadOnDeadlock(
		entity: MovementEntity,
		blockedTileIndex: number,
		from: Position,
		heading: number
	): boolean {
		if (!this.occupancy.isSingleStaticOccupancy(entity.mapId, blockedTileIndex)) {
			return false
		}

		const requesterTileIndex = this.occupancy.getTileIndexForPosition(entity.mapId, from)
		if (requesterTileIndex < 0) {
			return false
		}

		const blockerEntityId = this.occupancy.findEntityOnTile(entity.mapId, blockedTileIndex, entity.id)
		if (!blockerEntityId) {
			return false
		}

		const blockerTask = this.state.tasks.get(blockerEntityId)
		const blockerEntity = this.state.entities.get(blockerEntityId)
		if (!blockerTask || !blockerEntity) {
			return false
		}

		if (!this.taskState.isBlocked(blockerTask) || blockerTask.blockedState.tileIndex !== requesterTileIndex) {
			return false
		}

		const blockerCurrent = blockerTask.path[blockerTask.currentStep] ?? blockerEntity.position
		const blockerNext = blockerTask.path[blockerTask.currentStep + 1]
		if (!blockerNext) {
			return false
		}

		const blockerNextTileIndex = this.occupancy.getTileIndexForPosition(entity.mapId, blockerNext)
		if (blockerNextTileIndex !== requesterTileIndex) {
			return false
		}

		const blockerHeading = this.getSegmentHeading(entity.mapId, blockerCurrent, blockerNext)
		return this.areOppositeDirections(blockerHeading, heading)
	}

	private getSegmentHeading(mapId: string, from: Position, to: Position): number {
		const fromTile = this.occupancy.getTileCoordsForPosition(mapId, from)
		const toTile = this.occupancy.getTileCoordsForPosition(mapId, to)
		if (!fromTile || !toTile) {
			return 0
		}
		const dx = Math.sign(toTile.x - fromTile.x)
		const dy = Math.sign(toTile.y - fromTile.y)
		const key = `${dx},${dy}`
		return DIRECTION_TO_CODE[key] ?? 0
	}

	private areOppositeDirections(a: number, b: number): boolean {
		if (a < 0 || b < 0) {
			return false
		}
		return ((a + 4) % 8) === b
	}
}
