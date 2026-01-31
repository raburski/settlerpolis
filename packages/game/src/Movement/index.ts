import { EventManager } from '../events'
import { MovementEntity, MovementTask, MovementCallbacks, MoveToPositionOptions } from './types'
import { MovementEvents } from './events'
import { Receiver } from '../Receiver'
import type { MapManager } from '../Map'
import { Position } from '../types'
import { calculateDistance } from '../utils'
import { Logger } from '../Logs'
import { BaseManager } from '../Managers'
import { SimulationEvents } from '../Simulation/events'
import type { SimulationTickData } from '../Simulation/types'

const MOVEMENT_STEP_LAG = 100 // milliseconds between steps

export interface MovementDeps {
	map: MapManager
}

export class MovementManager extends BaseManager<MovementDeps> {
	private entities: Map<string, MovementEntity> = new Map()
	private tasks: Map<string, MovementTask> = new Map()

	constructor(
		managers: MovementDeps,
		private event: EventManager,
		private logger: Logger
	) {
		super(managers)
		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		this.event.on(SimulationEvents.SS.Tick, (data: SimulationTickData) => {
			this.handleSimulationTick(data)
		})
	}

	/**
	 * Register entity for movement
	 */
	public registerEntity(entity: MovementEntity): void {
		this.entities.set(entity.id, entity)
	}

	/**
	 * Unregister entity (cleanup)
	 */
	public unregisterEntity(entityId: string): void {
		// Cancel any ongoing movement
		this.cancelMovement(entityId)
		// Remove entity
		this.entities.delete(entityId)
	}

	/**
	 * Order entity to move to position
	 * @param entityId Entity to move
	 * @param targetPosition Target position to move to
	 * @param options Optional options: callbacks, targetType, targetId
	 */
	public moveToPosition(
		entityId: string,
		targetPosition: Position,
		options?: MoveToPositionOptions
	): boolean {
		const entity = this.entities.get(entityId)
		if (!entity) {
			this.logger.error(`Entity not found: ${entityId}`)
			return false
		}

		const timestamp = Date.now()
		this.logger.log(`[MOVEMENT START] entityId=${entityId} | from=(${Math.round(entity.position.x)},${Math.round(entity.position.y)}) | to=(${Math.round(targetPosition.x)},${Math.round(targetPosition.y)}) | targetType=${options?.targetType || 'none'} | targetId=${options?.targetId || 'none'} | time=${timestamp}`)

		// Cancel any existing movement
		const hadExistingMovement = this.tasks.has(entityId)
		if (hadExistingMovement) {
			this.logger.warn(`[MOVEMENT CANCELLED] Cancelling existing movement for ${entityId} before starting new movement`)
		}
		this.cancelMovement(entityId)

		// Calculate path
		const path = this.managers.map.findPath(entity.mapName, entity.position, targetPosition)
		if (!path || path.length === 0) {
			this.logger.warn(`No path found from ${entity.position.x},${entity.position.y} to ${targetPosition.x},${targetPosition.y}`)
			return false
		}

		this.logger.debug(`Path calculated: ${path.length} steps for ${entityId}`)

		const callbacks = options?.callbacks
		const targetType = options?.targetType
		const targetId = options?.targetId

		const totalDistance = this.calculatePathDistance(path)

		// Create movement task
		const task: MovementTask = {
			entityId,
			path,
			currentStep: 0,
			targetType,
			targetId,
			totalDistance,
			traveledDistance: 0,
			onStepComplete: callbacks?.onStepComplete ? (task, position) => callbacks.onStepComplete!(position) : undefined,
			onPathComplete: callbacks?.onPathComplete ? (task) => callbacks.onPathComplete!(task) : undefined,
			onCancelled: callbacks?.onCancelled ? (task) => callbacks.onCancelled!() : undefined,
			createdAt: timestamp,
			lastProcessed: timestamp
		}

		this.tasks.set(entityId, task)
		this.logger.log(`[MOVEMENT TASK CREATED] entityId=${entityId} | pathLength=${path.length} | createdAt=${task.createdAt}`)

		// Snap to the first path node so server state matches the path start.
		entity.position = { ...path[0] }

		// If already at target (path length 1), defer completion to the next tick
		// to avoid synchronous completion racing state-machine transitions.
		if (path.length === 1) {
			task.pendingCompletion = true
			return true
		}

		// Initialize movement segment immediately so clients start interpolating
		task.segmentRemainingMs = this.beginSegment(task, entity)

		return true
	}

	/**
	 * Cancel movement for entity
	 */
	public cancelMovement(entityId: string): void {
		const task = this.tasks.get(entityId)
		if (task) {
			this.logger.debug(`cancelMovement: entityId=${entityId}`)
			// Call cancelled callback
			if (task.onCancelled) {
				task.onCancelled(task)
			}

			// Remove task
			this.tasks.delete(entityId)
			this.logger.debug(`cancelMovement: Task removed for ${entityId}`)
		} else {
			this.logger.debug(`cancelMovement: No task found for ${entityId}`)
		}
	}

	private handleSimulationTick(data: SimulationTickData): void {
		if (this.tasks.size === 0) {
			return
		}

		for (const task of Array.from(this.tasks.values())) {
			const entity = this.entities.get(task.entityId)
			if (!entity) {
				this.logger.warn(`handleSimulationTick: No entity for ${task.entityId}`)
				this.tasks.delete(task.entityId)
				continue
			}
			this.processTaskTick(task, entity, data.deltaMs, data.nowMs)
		}
	}

	private processTaskTick(task: MovementTask, entity: MovementEntity, deltaMs: number, nowMs: number): void {
		if (task.pendingCompletion) {
			this.completePath(task.entityId)
			return
		}

		if (task.segmentRemainingMs === undefined) {
			if (task.path.length <= 1) {
				entity.position = { ...task.path[0] }
				this.completePath(task.entityId)
				return
			}
			task.segmentRemainingMs = this.beginSegment(task, entity)
		}

		let remaining = (task.segmentRemainingMs ?? 0) - deltaMs

		while (remaining <= 0) {
			const nextStep = task.currentStep + 1
			if (nextStep >= task.path.length) {
				this.completePath(task.entityId)
				return
			}

			const previousPosition = task.path[task.currentStep]
			entity.position = { ...task.path[nextStep] }
			task.currentStep = nextStep

			if (previousPosition) {
				const segmentDistance = calculateDistance(previousPosition, entity.position)
				task.traveledDistance = (task.traveledDistance || 0) + segmentDistance
				this.event.emit(Receiver.All, MovementEvents.SS.SegmentComplete, {
					entityId: entity.id,
					position: { ...entity.position },
					segmentDistance,
					totalDistance: task.totalDistance ?? segmentDistance
				})
			}

			if (task.currentStep >= task.path.length - 1) {
				this.completePath(task.entityId)
				return
			}

			remaining += this.beginSegment(task, entity)
		}

		task.segmentRemainingMs = remaining
		task.lastProcessed = nowMs
	}

	private beginSegment(task: MovementTask, entity: MovementEntity): number {
		const nextStep = task.currentStep + 1
		const nextPosition = task.path[nextStep]
		const currentPosition = task.path[task.currentStep] ?? entity.position

		this.event.emit(Receiver.Group, MovementEvents.SC.MoveToPosition, {
			entityId: entity.id,
			targetPosition: nextPosition,
			mapName: entity.mapName
		}, entity.mapName)

		const distance = calculateDistance(currentPosition, nextPosition)
		const timeToNextMove = (distance / entity.speed) * 1000
		return timeToNextMove + MOVEMENT_STEP_LAG
	}

	/**
	 * Complete path - entity has finished moving along the path
	 * If there's a target, we've arrived at it (path always ends at the target or nearest walkable tile)
	 */
	private completePath(entityId: string): void {
		const task = this.tasks.get(entityId)
		const entity = this.entities.get(entityId)
		if (!task || !entity) {
			this.logger.warn(`completePath: No task or entity for ${entityId}`)
			return
		}

		const completionTime = Date.now()
		const movementDuration = completionTime - task.createdAt
		this.logger.log(`[MOVEMENT COMPLETE] entityId=${entityId} | finalPosition=(${Math.round(entity.position.x)},${Math.round(entity.position.y)}) | targetType=${task.targetType || 'none'} | targetId=${task.targetId || 'none'} | duration=${movementDuration}ms | time=${completionTime}`)

		// Store task info before removal (needed for events)
		const targetType = task.targetType
		const targetId = task.targetId
		const finalPosition = { ...entity.position }

		// Remove task BEFORE emitting events to prevent race conditions
		// If a new movement starts during event handling, it won't conflict with this task
		this.tasks.delete(entityId)
		this.logger.debug(`Task removed for ${entityId} before emitting events`)

		// Emit step complete event for entity managers to sync final position
		this.event.emit(Receiver.All, MovementEvents.SS.StepComplete, {
			entityId: entity.id,
			position: finalPosition
		})

		// Call step complete callback (entity has completed the path)
		if (task.onStepComplete) {
			task.onStepComplete(task, finalPosition)
		}

		// Emit path complete event with optional target info
		// If target exists, managers can handle it as an arrival
		this.logger.log(`[PATH COMPLETE EVENT] Emitting PathComplete event for ${entityId} | targetType=${targetType || 'none'} | targetId=${targetId || 'none'} | time=${completionTime}`)
		this.event.emit(Receiver.All, MovementEvents.SS.PathComplete, {
			entityId,
			targetType,
			targetId
		})

		// Call path complete callback (pass task so caller can check for target info)
		if (task.onPathComplete) {
			task.onPathComplete(task)
		}
	}

	private calculatePathDistance(path: Position[]): number {
		if (path.length <= 1) {
			return 0
		}
		let total = 0
		for (let i = 1; i < path.length; i++) {
			total += calculateDistance(path[i - 1], path[i])
		}
		return total
	}

	/**
	 * Get entity position (for entity managers)
	 */
	public getEntityPosition(entityId: string): Position | null {
		const entity = this.entities.get(entityId)
		return entity ? entity.position : null
	}

	/**
	 * Check if entity has an active movement task
	 */
	public hasActiveMovement(entityId: string): boolean {
		return this.tasks.has(entityId)
	}

	/**
	 * Update entity position (for teleport/sync)
	 */
	public updateEntityPosition(entityId: string, position: Position): void {
		const entity = this.entities.get(entityId)
		if (!entity) {
			this.logger.error(`Entity not found: ${entityId}`)
			return
		}

		// Cancel any ongoing movement
		this.cancelMovement(entityId)

		// Update position
		entity.position = { ...position }

		// Emit position update to clients (teleport/sync, no interpolation)
		this.event.emit(Receiver.Group, MovementEvents.SC.PositionUpdated, {
			entityId: entity.id,
			position: entity.position,
			mapName: entity.mapName
		}, entity.mapName)
	}
}

// Export types and events for use by other modules
export * from './types'
export * from './events'
