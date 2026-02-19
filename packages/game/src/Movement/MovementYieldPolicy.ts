import type { MapId } from '../ids'
import { YIELD_REQUEST_COOLDOWN_MS } from './MovementConfig'
import { MovementEventPublisher } from './MovementEventPublisher'
import { MovementManagerState } from './MovementManagerState'
import { OccupancyTracker } from './OccupancyTracker'

export class MovementYieldPolicy {
	private readonly cooldownUntil = new Map<string, number>()

	constructor(
		private readonly state: MovementManagerState,
		private readonly occupancy: OccupancyTracker,
		private readonly movementEvents: MovementEventPublisher
	) {}

	public reset(): void {
		this.cooldownUntil.clear()
	}

	public requestYieldIfPossible(requesterEntityId: string, mapId: MapId, tileIndex: number): boolean {
		const blockerEntityId = this.occupancy.findIdleBlockingEntity(
			mapId,
			tileIndex,
			requesterEntityId,
			(entityId: string) => this.state.tasks.has(entityId)
		)
		if (!blockerEntityId) {
			return false
		}

		const nextAllowedAt = this.cooldownUntil.get(blockerEntityId) ?? 0
		if (this.state.simulationTimeMs < nextAllowedAt) {
			return false
		}
		this.cooldownUntil.set(blockerEntityId, this.state.simulationTimeMs + YIELD_REQUEST_COOLDOWN_MS)

		const tile = this.occupancy.getTileCoordsFromIndex(mapId, tileIndex)
		if (!tile) {
			return false
		}
		this.movementEvents.emitYieldRequested(requesterEntityId, blockerEntityId, mapId, tile)
		return true
	}
}
