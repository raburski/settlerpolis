import type { MovementTask, MovementTaskBlockedState } from './types'
import { MovementTaskPhase } from './types'

export class MovementTaskStateMachine {
	public isPendingCompletion(task: MovementTask): boolean {
		return task.phase === MovementTaskPhase.PendingCompletion
	}

	public isMovingSegment(task: MovementTask): boolean {
		return task.phase === MovementTaskPhase.MovingSegment
	}

	public isBlocked(task: MovementTask): task is MovementTask & { blockedState: MovementTaskBlockedState } {
		return task.phase === MovementTaskPhase.Blocked && !!task.blockedState
	}

	public transitionToReady(task: MovementTask): void {
		task.phase = MovementTaskPhase.Ready
		task.segmentRemainingMs = undefined
		task.blockedState = undefined
	}

	public transitionToBlocked(task: MovementTask, blockedState: MovementTaskBlockedState): void {
		task.phase = MovementTaskPhase.Blocked
		task.blockedState = blockedState
		task.segmentRemainingMs = undefined
	}

	public transitionToMovingSegment(task: MovementTask, remainingMs: number): void {
		task.phase = MovementTaskPhase.MovingSegment
		task.segmentRemainingMs = remainingMs
		task.blockedState = undefined
	}

	public transitionToPendingCompletion(task: MovementTask): void {
		task.phase = MovementTaskPhase.PendingCompletion
		task.segmentRemainingMs = undefined
		task.blockedState = undefined
	}
}
