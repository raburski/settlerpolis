import type { MovementEntity, MovementTask } from './types'
import {
	MAX_REROUTE_ATTEMPTS,
	REROUTE_COOLDOWN_MS,
	REROUTE_WAIT_THRESHOLD_MS
} from './MovementConfig'
import { MovementManagerState } from './MovementManagerState'
import { MovementTaskStateMachine } from './MovementTaskStateMachine'
import { OccupancyTracker } from './OccupancyTracker'
import { MovementPathPlanner } from './MovementPathPlanner'

export class MovementReroutePolicy {
	constructor(
		private readonly state: MovementManagerState,
		private readonly taskState: MovementTaskStateMachine,
		private readonly occupancy: OccupancyTracker,
		private readonly planner: MovementPathPlanner
	) {}

	public maybeReroute(task: MovementTask, entity: MovementEntity, blockedTileIndex: number): boolean {
		const nowMs = this.state.simulationTimeMs
		const forced = typeof task.forceRerouteUntilMs === 'number' && task.forceRerouteUntilMs >= nowMs
		const waitingSince = task.blockedState?.startedAtMs ?? nowMs
		if (!forced && nowMs - waitingSince < REROUTE_WAIT_THRESHOLD_MS) {
			return false
		}
		if (!forced && typeof task.lastRerouteAtMs === 'number' && nowMs - task.lastRerouteAtMs < REROUTE_COOLDOWN_MS) {
			return false
		}
		const rerouteAttempts = task.rerouteAttempts ?? 0
		if (rerouteAttempts >= MAX_REROUTE_ATTEMPTS) {
			return false
		}

		const finalTarget = task.path[task.path.length - 1]
		const currentPosition = task.path[task.currentStep] ?? entity.position
		if (!finalTarget || !currentPosition) {
			return false
		}

		const detour = this.planner.findReroutePath(entity.mapId, currentPosition, finalTarget, blockedTileIndex, this.occupancy)
		if (!detour || detour.length < 2) {
			return false
		}

		const simulationPathData = this.planner.toSimulationPathData(entity.mapId, detour)
		if (simulationPathData.path.length < 2) {
			return false
		}

		task.path = simulationPathData.path
		task.currentStep = 0
		this.taskState.transitionToReady(task)
		task.totalDistance = (task.traveledDistance || 0) + this.planner.calculatePathDistance(simulationPathData.path)
		task.rerouteAttempts = rerouteAttempts + 1
		task.lastRerouteAtMs = nowMs
		task.forceRerouteUntilMs = undefined
		task.renderTargetStepIndices = simulationPathData.renderTargetStepIndices
		task.currentRenderTargetPointer = 0
		task.activeRenderTargetStep = undefined
		task.frontendMoving = false
		task.pausedForCongestion = false

		entity.position = { ...simulationPathData.path[0] }
		this.occupancy.markEntityStatic(entity)
		return true
	}
}
