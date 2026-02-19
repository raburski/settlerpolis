import { Logger } from '../Logs'
import type { Position } from '../types'
import { calculateDistance } from '../utils'
import type { MoveToPositionOptions, MovementEntity, MovementTask } from './types'
import { MovementTaskPhase } from './types'
import { MovementManagerState } from './MovementManagerState'
import { MovementPathPlanner } from './MovementPathPlanner'
import { MovementTaskStateMachine } from './MovementTaskStateMachine'
import { OccupancyTracker } from './OccupancyTracker'
import { releaseTileReservation } from './MovementReservationUtils'
import { MovementStepController } from './MovementStepController'

interface MovementCommandServiceDeps {
	state: MovementManagerState
	occupancy: OccupancyTracker
	taskState: MovementTaskStateMachine
	pathPlanner: MovementPathPlanner
	stepController: MovementStepController
	logger: Logger
}

export class MovementCommandService {
	constructor(private readonly deps: MovementCommandServiceDeps) {}

	public registerEntity(entity: MovementEntity): void {
		this.deps.state.entities.set(entity.id, entity)
		this.deps.occupancy.markEntityStatic(entity)
	}

	public unregisterEntity(entityId: string): void {
		this.cancelMovement(entityId)
		this.deps.occupancy.clearEntityStatic(entityId)
		this.deps.state.entities.delete(entityId)
	}

	public moveToPosition(entityId: string, targetPosition: Position, options?: MoveToPositionOptions): boolean {
		const entity = this.deps.state.entities.get(entityId)
		if (!entity) {
			this.deps.logger.error(`Entity not found: ${entityId}`)
			return false
		}

		const timestamp = this.deps.state.simulationTimeMs
		this.deps.logger.log(`[MOVEMENT START] entityId=${entityId} | from=(${Math.round(entity.position.x)},${Math.round(entity.position.y)}) | to=(${Math.round(targetPosition.x)},${Math.round(targetPosition.y)}) | targetType=${options?.targetType || 'none'} | targetId=${options?.targetId || 'none'} | time=${timestamp}`)

		const hadExistingMovement = this.deps.state.tasks.has(entityId)
		if (hadExistingMovement) {
			this.deps.logger.warn(`[MOVEMENT CANCELLED] Cancelling existing movement for ${entityId} before starting new movement`)
		}
		this.cancelMovement(entityId)

		const path = this.deps.pathPlanner.findPrimaryPath(entity.mapId, entity.position, targetPosition)
		if (!path || path.length === 0) {
			const fallbackPath = this.deps.pathPlanner.findFallbackPath(entity.mapId, entity.position, targetPosition)
			if (!fallbackPath || fallbackPath.length === 0) {
				this.deps.logger.warn(`No path found from ${entity.position.x},${entity.position.y} to ${targetPosition.x},${targetPosition.y}`)
				return false
			}
			this.deps.logger.warn(`[MOVEMENT FALLBACK] Using nearest walkable tile for ${entityId}`)
			return this.startMovementWithPath(entityId, fallbackPath, options)
		}

		return this.startMovementWithPath(entityId, path, options)
	}

	public moveAlongPath(entityId: string, path: Position[], options?: MoveToPositionOptions): boolean {
		const entity = this.deps.state.entities.get(entityId)
		if (!entity) {
			this.deps.logger.error(`Entity not found: ${entityId}`)
			return false
		}

		if (!path || path.length === 0) {
			this.deps.logger.warn(`No path provided for ${entityId}`)
			return false
		}

		const timestamp = this.deps.state.simulationTimeMs
		const targetPosition = path[path.length - 1]
		this.deps.logger.log(`[MOVEMENT START] entityId=${entityId} | from=(${Math.round(entity.position.x)},${Math.round(entity.position.y)}) | to=(${Math.round(targetPosition.x)},${Math.round(targetPosition.y)}) | targetType=${options?.targetType || 'none'} | targetId=${options?.targetId || 'none'} | time=${timestamp}`)

		const hadExistingMovement = this.deps.state.tasks.has(entityId)
		if (hadExistingMovement) {
			this.deps.logger.warn(`[MOVEMENT CANCELLED] Cancelling existing movement for ${entityId} before starting new movement`)
		}
		this.cancelMovement(entityId)

		const startDistance = calculateDistance(entity.position, path[0])
		const normalizedPath = startDistance > 1 ? [{ ...entity.position }, ...path] : path
		return this.startMovementWithPath(entityId, normalizedPath, options)
	}

	public cancelMovement(entityId: string): void {
		const task = this.deps.state.tasks.get(entityId)
		if (task) {
			this.deps.logger.debug(`cancelMovement: entityId=${entityId}`)
			releaseTileReservation(task, this.deps.state, this.deps.occupancy)
			if (task.onCancelled) {
				task.onCancelled(task)
			}
			this.deps.state.tasks.delete(entityId)
			this.deps.logger.debug(`cancelMovement: Task removed for ${entityId}`)
		} else {
			this.deps.logger.debug(`cancelMovement: No task found for ${entityId}`)
		}

		const entity = this.deps.state.entities.get(entityId)
		if (entity) {
			this.deps.occupancy.markEntityStatic(entity)
		}
	}

	private startMovementWithPath(entityId: string, path: Position[], options: MoveToPositionOptions | undefined): boolean {
		const entity = this.deps.state.entities.get(entityId)
		if (!entity) {
			return false
		}

		this.deps.logger.debug(`Path calculated: ${path.length} steps for ${entityId}`)
		const simulationPathData = this.deps.pathPlanner.toSimulationPathData(entity.mapId, path)
		const simulationPath = simulationPathData.path
		if (simulationPath.length === 0) {
			return false
		}

		const callbacks = options?.callbacks
		const targetType = options?.targetType
		const targetId = options?.targetId
		const speedMultiplier = typeof options?.speedMultiplier === 'number' && options.speedMultiplier > 0
			? options.speedMultiplier
			: 1
		const totalDistance = this.deps.pathPlanner.calculatePathDistance(simulationPath)

		const task: MovementTask = {
			entityId,
			path: simulationPath,
			currentStep: 0,
			phase: MovementTaskPhase.Ready,
			targetType,
			targetId,
			speedMultiplier,
			totalDistance,
			traveledDistance: 0,
			rerouteAttempts: 0,
			renderTargetStepIndices: simulationPathData.renderTargetStepIndices,
			currentRenderTargetPointer: 0,
			frontendMoving: false,
			pausedForCongestion: false,
			onStepComplete: callbacks?.onStepComplete ? (_task, position) => callbacks.onStepComplete!(position) : undefined,
			onPathComplete: callbacks?.onPathComplete ? (_task) => callbacks.onPathComplete!(_task) : undefined,
			onCancelled: callbacks?.onCancelled ? (taskRef) => {
				void taskRef
				callbacks.onCancelled!()
			} : undefined,
			createdAt: this.deps.state.simulationTimeMs,
			lastProcessed: this.deps.state.simulationTimeMs
		}

		this.deps.state.tasks.set(entityId, task)
		this.deps.logger.log(`[MOVEMENT TASK CREATED] entityId=${entityId} | pathLength=${simulationPath.length} | createdAt=${task.createdAt}`)

		entity.position = { ...simulationPath[0] }
		this.deps.occupancy.markEntityStatic(entity)

		if (simulationPath.length === 1) {
			this.deps.taskState.transitionToPendingCompletion(task)
			return true
		}

		this.deps.stepController.tryBeginTileStep(task, entity)
		return true
	}
}
