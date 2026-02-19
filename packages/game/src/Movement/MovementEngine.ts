import type { SimulationTickData } from '../Simulation/types'
import { Logger } from '../Logs'
import { MovementManagerState } from './MovementManagerState'
import { MovementTaskStateMachine } from './MovementTaskStateMachine'
import { MovementTaskPhase } from './types'
import { OccupancyTracker } from './OccupancyTracker'
import { releaseTileReservation } from './MovementReservationUtils'
import { MovementDeadlockCyclePolicy } from './MovementDeadlockCyclePolicy'
import {
	BlockedPhaseHandler,
	MovingPhaseHandler,
	PendingCompletionPhaseHandler,
	ReadyPhaseHandler
} from './MovementPhaseHandlers'

interface MovementEngineDeps {
	state: MovementManagerState
	taskState: MovementTaskStateMachine
	occupancy: OccupancyTracker
	cyclePolicy: MovementDeadlockCyclePolicy
	readyHandler: ReadyPhaseHandler
	blockedHandler: BlockedPhaseHandler
	movingHandler: MovingPhaseHandler
	pendingHandler: PendingCompletionPhaseHandler
	logger: Logger
}

export class MovementEngine {
	constructor(private readonly deps: MovementEngineDeps) {}

	public tick(data: SimulationTickData): void {
		if (this.deps.state.tasks.size === 0) {
			return
		}

		this.deps.cyclePolicy.detectAndMarkWaitCycles()

		for (const task of Array.from(this.deps.state.tasks.values())) {
			const entity = this.deps.state.entities.get(task.entityId)
			if (!entity) {
				this.deps.logger.warn(`MovementEngine.tick: No entity for ${task.entityId}`)
				releaseTileReservation(task, this.deps.state, this.deps.occupancy)
				this.deps.state.tasks.delete(task.entityId)
				continue
			}

			switch (task.phase) {
				case MovementTaskPhase.PendingCompletion:
					this.deps.pendingHandler.handle(task)
					break
				case MovementTaskPhase.MovingSegment:
					this.deps.movingHandler.handle(task, entity, data.deltaMs, data.nowMs)
					break
				case MovementTaskPhase.Blocked:
					this.deps.blockedHandler.handle(task, entity, data.nowMs)
					break
				case MovementTaskPhase.Ready:
				default:
					this.deps.readyHandler.handle(task, entity, data.nowMs)
					break
			}
		}
	}
}
