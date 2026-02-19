import { calculateDistance } from '../utils'
import type { MovementEntity, MovementTask, MovementTaskBlockedState } from './types'
import { TILE_STEP_LAG_MS, YIELD_REQUEST_GRACE_MS } from './MovementConfig'
import { MovementEventPublisher } from './MovementEventPublisher'
import { MovementManagerState } from './MovementManagerState'
import { MovementTaskStateMachine } from './MovementTaskStateMachine'
import { OccupancyTracker } from './OccupancyTracker'
import { MovementReservationPolicy } from './MovementReservationPolicy'
import { MovementYieldPolicy } from './MovementYieldPolicy'
import { MovementReroutePolicy } from './MovementReroutePolicy'

interface MovementStepControllerDeps {
	state: MovementManagerState
	taskState: MovementTaskStateMachine
	occupancy: OccupancyTracker
	getSpeedMultiplierForSegment: (
		mapId: string,
		fromPosition: { x: number, y: number },
		toPosition: { x: number, y: number }
	) => number
	events: MovementEventPublisher
	reservationPolicy: MovementReservationPolicy
	yieldPolicy: MovementYieldPolicy
	reroutePolicy: MovementReroutePolicy
}

export class MovementStepController {
	constructor(private readonly deps: MovementStepControllerDeps) {}

	public tryBeginTileStep(task: MovementTask, entity: MovementEntity): number | null {
		const nextStep = task.currentStep + 1
		const nextPosition = task.path[nextStep]
		const currentPosition = task.path[task.currentStep] ?? entity.position
		if (!nextPosition) {
			return null
		}

		const roadSpeedMultiplier = this.deps.getSpeedMultiplierForSegment(
			entity.mapId,
			currentPosition,
			nextPosition
		)
		const segmentSpeed = entity.speed * (task.speedMultiplier || 1) * roadSpeedMultiplier
		if (!Number.isFinite(segmentSpeed) || segmentSpeed <= 0) {
			this.deps.taskState.transitionToReady(task)
			return null
		}

		const reservation = this.deps.reservationPolicy.tryReserveNextTile(entity, currentPosition, nextPosition)
		if (!reservation.ok) {
			const nowMs = this.deps.state.simulationTimeMs
			const existing = task.blockedState
			const startedAtMs = existing && existing.tileIndex === reservation.blockedTileIndex
				? existing.startedAtMs
				: nowMs
			const blockedByEntityId = this.deps.occupancy.findEntityOnTile(entity.mapId, reservation.blockedTileIndex, task.entityId) ?? undefined
			let yieldGraceUntilMs = existing?.yieldGraceUntilMs

			this.deps.occupancy.markEntityStatic(entity)
			const yieldRequested = this.deps.yieldPolicy.requestYieldIfPossible(task.entityId, entity.mapId, reservation.blockedTileIndex)
			if (yieldRequested) {
				yieldGraceUntilMs = nowMs + YIELD_REQUEST_GRACE_MS
			}

			const blockedState: MovementTaskBlockedState = {
				tileIndex: reservation.blockedTileIndex,
				startedAtMs,
				blockedByEntityId,
				yieldGraceUntilMs
			}
			this.deps.taskState.transitionToBlocked(task, blockedState)

			const withinYieldGrace = typeof yieldGraceUntilMs === 'number' && nowMs < yieldGraceUntilMs
			if (!withinYieldGrace && task.frontendMoving && !task.pausedForCongestion) {
				this.deps.events.emitPaused(entity.id, { ...entity.position }, entity.mapId)
				task.frontendMoving = false
				task.pausedForCongestion = true
			}
			if (this.deps.reroutePolicy.maybeReroute(task, entity, reservation.blockedTileIndex)) {
				return this.tryBeginTileStep(task, entity)
			}
			return null
		}

		task.segmentHeading = reservation.heading
		task.segmentReservedTileIndex = reservation.tileIndex
		this.deps.occupancy.clearEntityStatic(task.entityId)

		const frontendTargetStep = this.resolveFrontendTargetStep(task, nextStep)
		if (!task.frontendMoving || task.activeRenderTargetStep !== frontendTargetStep) {
			task.activeRenderTargetStep = frontendTargetStep
			task.frontendMoving = true
			task.pausedForCongestion = false
			this.deps.events.emitMoveToPosition(entity.id, task.path[frontendTargetStep], entity.mapId, segmentSpeed)
		}

		const distance = calculateDistance(currentPosition, nextPosition)
		const timeToNextMove = (distance / segmentSpeed) * 1000
		const stepDuration = timeToNextMove + TILE_STEP_LAG_MS
		this.deps.taskState.transitionToMovingSegment(task, stepDuration)
		return stepDuration
	}

	private resolveFrontendTargetStep(task: MovementTask, nextStep: number): number {
		const renderTargets = task.renderTargetStepIndices ?? []
		let pointer = task.currentRenderTargetPointer ?? 0
		while (pointer < renderTargets.length && renderTargets[pointer] < nextStep) {
			pointer += 1
		}
		task.currentRenderTargetPointer = pointer
		if (pointer >= renderTargets.length) {
			return task.path.length - 1
		}
		return renderTargets[pointer]
	}
}
