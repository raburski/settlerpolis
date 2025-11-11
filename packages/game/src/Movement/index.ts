import { EventManager, Event, EventClient } from '../events'
import { MovementEntity, MovementTask, MovementCallbacks, MoveToPositionOptions } from './types'
import { MovementEvents } from './events'
import { Receiver } from '../Receiver'
import { MapManager } from '../Map'
import { Position } from '../types'
import { calculateDistance } from '../utils'
import { Logger } from '../Logs'

const MOVEMENT_STEP_LAG = 100 // milliseconds between steps

export class MovementManager {
	private entities: Map<string, MovementEntity> = new Map()
	private tasks: Map<string, MovementTask> = new Map()

	constructor(
		private event: EventManager,
		private mapManager: MapManager,
		private logger: Logger
	) {
		// No event handlers needed - entity managers call methods directly
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
		const path = this.mapManager.findPath(entity.mapName, entity.position, targetPosition)
		if (!path || path.length === 0) {
			this.logger.warn(`No path found from ${entity.position.x},${entity.position.y} to ${targetPosition.x},${targetPosition.y}`)
			return false
		}

		this.logger.debug(`Path calculated: ${path.length} steps for ${entityId}`)

		const callbacks = options?.callbacks
		const targetType = options?.targetType
		const targetId = options?.targetId

		// Create movement task
		const task: MovementTask = {
			entityId,
			path,
			currentStep: 0,
			targetType,
			targetId,
			onStepComplete: callbacks?.onStepComplete ? (task, position) => callbacks.onStepComplete!(position) : undefined,
			onPathComplete: callbacks?.onPathComplete ? (task) => callbacks.onPathComplete!(task) : undefined,
			onCancelled: callbacks?.onCancelled ? (task) => callbacks.onCancelled!() : undefined,
			createdAt: timestamp,
			lastProcessed: timestamp
		}

		this.tasks.set(entityId, task)
		this.logger.log(`[MOVEMENT TASK CREATED] entityId=${entityId} | pathLength=${path.length} | createdAt=${task.createdAt}`)

		// Process first step immediately (no delay, step 0)
		this.processMovementStep(entityId)

		return true
	}

	/**
	 * Cancel movement for entity
	 */
	public cancelMovement(entityId: string): void {
		const task = this.tasks.get(entityId)
		if (task) {
			this.logger.debug(`cancelMovement: entityId=${entityId}, clearing timeout=${!!task.timeoutId}`)
			// Clear timeout
			if (task.timeoutId) {
				clearTimeout(task.timeoutId)
			}

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

	/**
	 * Process movement step
	 */
	private processMovementStep(entityId: string): void {
		const task = this.tasks.get(entityId)
		const entity = this.entities.get(entityId)
		if (!task || !entity) {
			this.logger.warn(`processMovementStep: No task or entity for ${entityId}`)
			return
		}

		this.logger.debug(`processMovementStep: entityId=${entityId}, step=${task.currentStep}/${task.path.length - 1}`)

		// Move to current step position
		const currentStepPosition = task.path[task.currentStep]
		entity.position = { ...currentStepPosition }

		// 1. Check if path is completed and call completePath
		const nextStep = task.currentStep + 1
		if (nextStep >= task.path.length) {
			this.logger.debug(`Path completed for ${entityId} at step ${task.currentStep}`)
			this.completePath(entityId)
			return
		}

		// 3. Calculate delay until next step (before incrementing)
		// Check if there's a next step
		
		const nextPosition = task.path[nextStep]
		const currentPosition = entity.position

		// Emit position update to clients (targetPosition is the next step position for frontend to interpolate to)
		this.event.emit(Receiver.Group, MovementEvents.SC.MoveToPosition, {
			entityId: entity.id,
			targetPosition: nextPosition,
			mapName: entity.mapName
		}, entity.mapName)

		// Calculate distance to next step
		const distance = calculateDistance(currentPosition, nextPosition)

		// Calculate time until next movement based on distance and speed
		const timeToNextMove = (distance / entity.speed) * 1000 // Convert to milliseconds
		const delay = timeToNextMove + MOVEMENT_STEP_LAG

		this.logger.debug(`Scheduled next step for ${entityId}: delay=${delay.toFixed(2)}ms, nextStep=${nextStep}, taskExists=${this.tasks.has(entityId)}`)

		// Increment step number
		task.currentStep = nextStep
		task.lastProcessed = Date.now()

		// Schedule processMovementStep with delay
		const timeoutId = setTimeout(() => {
			const taskStillExists = this.tasks.has(entityId)
			this.logger.debug(`Timeout fired for ${entityId}, taskExists=${taskStillExists}`)
			if (!taskStillExists) {
				this.logger.warn(`Task was removed before timeout fired for ${entityId} - this should not happen!`)
				return
			}
			this.processMovementStep(entityId)
		}, delay)

		task.timeoutId = timeoutId
		this.logger.debug(`Timeout scheduled for ${entityId}, timeoutId=${timeoutId}`)
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

		// Clear timeout to prevent any scheduled steps from running
		if (task.timeoutId) {
			clearTimeout(task.timeoutId)
			task.timeoutId = undefined
		}

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

