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
import type { RoadManager } from '../Roads'
import type { MovementSnapshot, MovementTaskSnapshot } from '../state/types'

const MOVEMENT_STEP_LAG = 100 // milliseconds between steps

export interface MovementDeps {
	map: MapManager
	roads: RoadManager
}

export class MovementManager extends BaseManager<MovementDeps> {
	private entities: Map<string, MovementEntity> = new Map()
	private tasks: Map<string, MovementTask> = new Map()
	private simulationTimeMs = 0

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
			this.simulationTimeMs = data.nowMs
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

		const timestamp = this.simulationTimeMs
		this.logger.log(`[MOVEMENT START] entityId=${entityId} | from=(${Math.round(entity.position.x)},${Math.round(entity.position.y)}) | to=(${Math.round(targetPosition.x)},${Math.round(targetPosition.y)}) | targetType=${options?.targetType || 'none'} | targetId=${options?.targetId || 'none'} | time=${timestamp}`)

		// Cancel any existing movement
		const hadExistingMovement = this.tasks.has(entityId)
		if (hadExistingMovement) {
			this.logger.warn(`[MOVEMENT CANCELLED] Cancelling existing movement for ${entityId} before starting new movement`)
		}
		this.cancelMovement(entityId)

		// Calculate path
		const roadData = this.managers.roads.getRoadData(entity.mapId) || undefined
		const path = this.managers.map.findPath(entity.mapId, entity.position, targetPosition, {
			roadData,
			allowDiagonal: true
		})
		if (!path || path.length === 0) {
			const fallback = this.managers.map.findNearestWalkablePosition(entity.mapId, targetPosition, 2)
			if (fallback) {
				const fallbackPath = this.managers.map.findPath(entity.mapId, entity.position, fallback, {
					roadData,
					allowDiagonal: true
				})
				if (!fallbackPath || fallbackPath.length === 0) {
					this.logger.warn(`No path found from ${entity.position.x},${entity.position.y} to ${targetPosition.x},${targetPosition.y}`)
					return false
				}
				this.logger.warn(`[MOVEMENT FALLBACK] Using nearest walkable tile for ${entityId}`)
				return this.startMovementWithPath(entityId, fallbackPath, options, fallback)
			}
			this.logger.warn(`No path found from ${entity.position.x},${entity.position.y} to ${targetPosition.x},${targetPosition.y}`)
			return false
		}

		return this.startMovementWithPath(entityId, path, options, targetPosition)
	}

	public moveAlongPath(
		entityId: string,
		path: Position[],
		options?: MoveToPositionOptions
	): boolean {
		const entity = this.entities.get(entityId)
		if (!entity) {
			this.logger.error(`Entity not found: ${entityId}`)
			return false
		}

		if (!path || path.length === 0) {
			this.logger.warn(`No path provided for ${entityId}`)
			return false
		}

		const timestamp = this.simulationTimeMs
		const targetPosition = path[path.length - 1]
		this.logger.log(`[MOVEMENT START] entityId=${entityId} | from=(${Math.round(entity.position.x)},${Math.round(entity.position.y)}) | to=(${Math.round(targetPosition.x)},${Math.round(targetPosition.y)}) | targetType=${options?.targetType || 'none'} | targetId=${options?.targetId || 'none'} | time=${timestamp}`)

		const hadExistingMovement = this.tasks.has(entityId)
		if (hadExistingMovement) {
			this.logger.warn(`[MOVEMENT CANCELLED] Cancelling existing movement for ${entityId} before starting new movement`)
		}
		this.cancelMovement(entityId)

		const startDistance = calculateDistance(entity.position, path[0])
		const normalizedPath = startDistance > 1 ? [{ ...entity.position }, ...path] : path
		const finalTarget = normalizedPath[normalizedPath.length - 1]

		return this.startMovementWithPath(entityId, normalizedPath, options, finalTarget)
	}

	private startMovementWithPath(
		entityId: string,
		path: Position[],
		options: MoveToPositionOptions | undefined,
		targetPosition: Position
	): boolean {
		const entity = this.entities.get(entityId)
		if (!entity) {
			return false
		}

		this.logger.debug(`Path calculated: ${path.length} steps for ${entityId}`)

		const callbacks = options?.callbacks
		const targetType = options?.targetType
		const targetId = options?.targetId
		const speedMultiplier = typeof options?.speedMultiplier === 'number' && options.speedMultiplier > 0
			? options.speedMultiplier
			: 1
		const totalDistance = this.calculatePathDistance(path)

		const task: MovementTask = {
			entityId,
			path,
			currentStep: 0,
			targetType,
			targetId,
			speedMultiplier,
			totalDistance,
			traveledDistance: 0,
			onStepComplete: callbacks?.onStepComplete ? (task, position) => callbacks.onStepComplete!(position) : undefined,
			onPathComplete: callbacks?.onPathComplete ? (task) => callbacks.onPathComplete!(task) : undefined,
			onCancelled: callbacks?.onCancelled ? (task) => callbacks.onCancelled!() : undefined,
			createdAt: this.simulationTimeMs,
			lastProcessed: this.simulationTimeMs
		}

		this.tasks.set(entityId, task)
		this.logger.log(`[MOVEMENT TASK CREATED] entityId=${entityId} | pathLength=${path.length} | createdAt=${task.createdAt}`)

		entity.position = { ...path[0] }

		if (path.length === 1) {
			task.pendingCompletion = true
			return true
		}

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

		const segmentSpeed = entity.speed * (task.speedMultiplier || 1) * this.managers.roads.getSpeedMultiplierForSegment(
			entity.mapId,
			currentPosition,
			nextPosition
		)

		this.event.emit(Receiver.Group, MovementEvents.SC.MoveToPosition, {
			entityId: entity.id,
			targetPosition: nextPosition,
			mapId: entity.mapId,
			speed: segmentSpeed
		}, entity.mapId)

		const distance = calculateDistance(currentPosition, nextPosition)
		const timeToNextMove = (distance / segmentSpeed) * 1000
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

		const completionTime = this.simulationTimeMs
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

	serialize(): MovementSnapshot {
		const activeMoves: MovementTaskSnapshot[] = []
		for (const task of this.tasks.values()) {
			const lastStep = task.path.length > 0 ? task.path[task.path.length - 1] : this.entities.get(task.entityId)?.position
			if (!lastStep) {
				continue
			}
			activeMoves.push({
				entityId: task.entityId,
				targetPosition: { ...lastStep },
				targetType: task.targetType,
				targetId: task.targetId
			})
		}

		return {
			entities: Array.from(this.entities.values()).map(entity => ({
				...entity,
				position: { ...entity.position }
			})),
			activeMoves,
			simulationTimeMs: this.simulationTimeMs
		}
	}

	deserialize(state: MovementSnapshot): void {
		this.entities.clear()
		this.tasks.clear()
		for (const entity of state.entities) {
			this.entities.set(entity.id, {
				...entity,
				position: { ...entity.position }
			})
		}
		this.simulationTimeMs = state.simulationTimeMs
		const activeMoves = state.activeMoves ?? []
		for (const move of activeMoves) {
			if (!this.entities.has(move.entityId)) {
				continue
			}
			this.moveToPosition(move.entityId, move.targetPosition, {
				targetType: move.targetType,
				targetId: move.targetId
			})
		}
	}

	reset(): void {
		this.entities.clear()
		this.tasks.clear()
		this.simulationTimeMs = 0
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
			mapId: entity.mapId
		}, entity.mapId)
	}
}

// Export types and events for use by other modules
export * from './types'
export * from './events'
