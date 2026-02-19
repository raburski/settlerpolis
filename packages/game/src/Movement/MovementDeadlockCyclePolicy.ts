import { CYCLE_FORCED_REROUTE_WINDOW_MS } from './MovementConfig'
import { MovementManagerState } from './MovementManagerState'
import { MovementTaskStateMachine } from './MovementTaskStateMachine'
import { OccupancyTracker } from './OccupancyTracker'

export class MovementDeadlockCyclePolicy {
	constructor(
		private readonly state: MovementManagerState,
		private readonly taskState: MovementTaskStateMachine,
		private readonly occupancy: OccupancyTracker
	) {}

	public detectAndMarkWaitCycles(): void {
		if (this.state.tasks.size < 3) {
			return
		}
		const waitFor = new Map<string, string>()
		for (const task of this.state.tasks.values()) {
			if (!this.taskState.isBlocked(task)) {
				continue
			}
			const entity = this.state.entities.get(task.entityId)
			if (!entity) {
				continue
			}
			const blockerId = this.occupancy.findEntityOnTile(entity.mapId, task.blockedState.tileIndex, task.entityId)
			if (!blockerId) {
				continue
			}
			waitFor.set(task.entityId, blockerId)
		}
		if (waitFor.size < 3) {
			return
		}

		const globallyVisited = new Set<string>()
		for (const start of waitFor.keys()) {
			if (globallyVisited.has(start)) {
				continue
			}
			let current = start
			const order: string[] = []
			const indexById = new Map<string, number>()
			let traversing = true
			while (traversing) {
				const next = waitFor.get(current)
				if (!next) {
					traversing = false
					continue
				}
				if (indexById.has(current)) {
					const cycleStart = indexById.get(current)!
					const cycle = order.slice(cycleStart)
					if (cycle.length >= 3) {
						this.markCycleVictimForReroute(cycle)
					}
					traversing = false
					continue
				}
				if (globallyVisited.has(current)) {
					traversing = false
					continue
				}
				indexById.set(current, order.length)
				order.push(current)
				globallyVisited.add(current)
				current = next
			}
		}
	}

	private markCycleVictimForReroute(cycle: string[]): void {
		const nowMs = this.state.simulationTimeMs
		let victimId = cycle[0]
		let longestWait = -1
		for (const entityId of cycle) {
			const task = this.state.tasks.get(entityId)
			if (!task) {
				continue
			}
			const waited = task.blockedState ? nowMs - task.blockedState.startedAtMs : 0
			if (waited > longestWait) {
				longestWait = waited
				victimId = entityId
			}
		}
		const victimTask = this.state.tasks.get(victimId)
		if (!victimTask) {
			return
		}
		victimTask.forceRerouteUntilMs = nowMs + CYCLE_FORCED_REROUTE_WINDOW_MS
	}
}
