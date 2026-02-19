import { calculateDistance } from '../utils'
import type { MovementEntity, MovementTask } from './types'
import { MovementEventPublisher } from './MovementEventPublisher'
import { MovementManagerState } from './MovementManagerState'
import { MovementTaskStateMachine } from './MovementTaskStateMachine'
import { OccupancyTracker } from './OccupancyTracker'
import { releaseTileReservation } from './MovementReservationUtils'
import { MovementStepController } from './MovementStepController'

interface PhaseHandlerDeps {
	state: MovementManagerState
	taskState: MovementTaskStateMachine
	occupancy: OccupancyTracker
	stepController: MovementStepController
	events: MovementEventPublisher
	completePath: (entityId: string) => void
}

export class ReadyPhaseHandler {
	constructor(private readonly deps: PhaseHandlerDeps) {}

	public handle(task: MovementTask, entity: MovementEntity, nowMs: number): void {
		if (task.currentStep >= task.path.length - 1 || task.path.length <= 1) {
			entity.position = { ...task.path[Math.max(0, task.currentStep)] }
			this.deps.completePath(task.entityId)
			return
		}

		this.deps.stepController.tryBeginTileStep(task, entity)
		if (!this.deps.taskState.isMovingSegment(task)) {
			task.lastProcessed = nowMs
		}
	}
}

export class BlockedPhaseHandler {
	constructor(private readonly deps: PhaseHandlerDeps) {}

	public handle(task: MovementTask, entity: MovementEntity, nowMs: number): void {
		this.deps.stepController.tryBeginTileStep(task, entity)
		if (!this.deps.taskState.isMovingSegment(task)) {
			task.lastProcessed = nowMs
		}
	}
}

export class MovingPhaseHandler {
	constructor(private readonly deps: PhaseHandlerDeps) {}

	public handle(task: MovementTask, entity: MovementEntity, deltaMs: number, nowMs: number): void {
		let remaining = (task.segmentRemainingMs ?? 0) - deltaMs

		while (remaining <= 0) {
			const nextStep = task.currentStep + 1
			if (nextStep >= task.path.length) {
				this.deps.completePath(task.entityId)
				return
			}

			releaseTileReservation(task, this.deps.state, this.deps.occupancy)

			const previousPosition = task.path[task.currentStep]
			entity.position = { ...task.path[nextStep] }
			task.currentStep = nextStep
			this.deps.occupancy.markEntityStatic(entity)

			if (previousPosition) {
				const segmentDistance = calculateDistance(previousPosition, entity.position)
				task.traveledDistance = (task.traveledDistance || 0) + segmentDistance
				this.deps.events.emitSegmentComplete(
					entity.id,
					{ ...entity.position },
					segmentDistance,
					task.totalDistance ?? segmentDistance
				)
			}

			if (task.currentStep >= task.path.length - 1) {
				this.deps.completePath(task.entityId)
				return
			}

			this.deps.stepController.tryBeginTileStep(task, entity)
			if (!this.deps.taskState.isMovingSegment(task)) {
				task.lastProcessed = nowMs
				return
			}
			remaining += task.segmentRemainingMs ?? 0
		}

		this.deps.taskState.transitionToMovingSegment(task, remaining)
		task.lastProcessed = nowMs
	}
}

export class PendingCompletionPhaseHandler {
	constructor(private readonly completePath: (entityId: string) => void) {}

	public handle(task: MovementTask): void {
		this.completePath(task.entityId)
	}
}
