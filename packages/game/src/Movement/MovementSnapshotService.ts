import type { MovementSnapshot } from '../state/types'
import { MovementManagerState } from './MovementManagerState'
import { OccupancyTracker } from './OccupancyTracker'

interface MovementSnapshotServiceDeps {
	state: MovementManagerState
	occupancy: OccupancyTracker
	resetPolicies: () => void
	moveToPosition: (entityId: string, targetPosition: { x: number, y: number }, options?: { targetType?: string, targetId?: string }) => boolean
}

export class MovementSnapshotService {
	constructor(private readonly deps: MovementSnapshotServiceDeps) {}

	public serialize(): MovementSnapshot {
		return this.deps.state.serialize()
	}

	public deserialize(snapshot: MovementSnapshot): void {
		this.clearRuntimeState()
		const activeMoves = this.deps.state.deserialize(snapshot)
		for (const entity of this.deps.state.entities.values()) {
			this.deps.occupancy.markEntityStatic(entity)
		}
		for (const move of activeMoves) {
			if (!this.deps.state.entities.has(move.entityId)) {
				continue
			}
			this.deps.moveToPosition(move.entityId, move.targetPosition, {
				targetType: move.targetType,
				targetId: move.targetId
			})
		}
	}

	public reset(): void {
		this.deps.state.reset()
		this.clearRuntimeState()
	}

	private clearRuntimeState(): void {
		this.deps.occupancy.clear()
		this.deps.resetPolicies()
	}
}
