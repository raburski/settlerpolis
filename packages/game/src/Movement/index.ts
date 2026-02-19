import { EventManager } from '../events'
import { Logger } from '../Logs'
import { BaseManager } from '../Managers'
import { SimulationEvents } from '../Simulation/events'
import type { SimulationTickData } from '../Simulation/types'
import type { MapManager } from '../Map'
import type { RoadManager } from '../Roads'
import type { MapId } from '../ids'
import type { Position } from '../types'
import type { MovementSnapshot } from '../state/types'
import { MovementEntity, MoveToPositionOptions } from './types'
import { MovementManagerState } from './MovementManagerState'
import { OccupancyTracker } from './OccupancyTracker'
import { MovementTaskStateMachine } from './MovementTaskStateMachine'
import { MovementEventPublisher } from './MovementEventPublisher'
import { MovementPathPlanner } from './MovementPathPlanner'
import { MovementReservationPolicy } from './MovementReservationPolicy'
import { MovementYieldPolicy } from './MovementYieldPolicy'
import { MovementReroutePolicy } from './MovementReroutePolicy'
import { MovementDeadlockCyclePolicy } from './MovementDeadlockCyclePolicy'
import { MovementStepController } from './MovementStepController'
import {
	BlockedPhaseHandler,
	MovingPhaseHandler,
	PendingCompletionPhaseHandler,
	ReadyPhaseHandler
} from './MovementPhaseHandlers'
import { MovementEngine } from './MovementEngine'
import { MovementCommandService } from './MovementCommandService'
import { MovementSnapshotService } from './MovementSnapshotService'
import { releaseTileReservation } from './MovementReservationUtils'

export interface MovementDeps {
	event: EventManager
	map: MapManager
	roads: RoadManager
}

export class MovementManager extends BaseManager<MovementDeps> {
	private readonly state = new MovementManagerState()
	private readonly occupancy: OccupancyTracker
	private readonly taskState = new MovementTaskStateMachine()
	private readonly movementEvents: MovementEventPublisher
	private readonly planner: MovementPathPlanner
	private readonly reservationPolicy: MovementReservationPolicy
	private readonly yieldPolicy: MovementYieldPolicy
	private readonly reroutePolicy: MovementReroutePolicy
	private readonly cyclePolicy: MovementDeadlockCyclePolicy
	private readonly stepController: MovementStepController
	private readonly readyHandler: ReadyPhaseHandler
	private readonly blockedHandler: BlockedPhaseHandler
	private readonly movingHandler: MovingPhaseHandler
	private readonly pendingHandler: PendingCompletionPhaseHandler
	private readonly engine: MovementEngine
	private readonly commands: MovementCommandService
	private readonly snapshots: MovementSnapshotService

	constructor(
		managers: MovementDeps,
		private logger: Logger
	) {
		super(managers)

		this.occupancy = new OccupancyTracker(this.managers.map)
		this.movementEvents = new MovementEventPublisher(this.managers.event)
		this.planner = new MovementPathPlanner(
			this.managers.map,
			(mapId) => this.managers.roads?.getRoadData(mapId)
		)
		this.reservationPolicy = new MovementReservationPolicy(this.state, this.occupancy, this.taskState)
		this.yieldPolicy = new MovementYieldPolicy(this.state, this.occupancy, this.movementEvents)
		this.reroutePolicy = new MovementReroutePolicy(this.state, this.taskState, this.occupancy, this.planner)
		this.cyclePolicy = new MovementDeadlockCyclePolicy(this.state, this.taskState, this.occupancy)
		this.stepController = new MovementStepController({
			state: this.state,
			taskState: this.taskState,
			occupancy: this.occupancy,
			getSpeedMultiplierForSegment: (mapId, fromPosition, toPosition) =>
				this.managers.roads?.getSpeedMultiplierForSegment(mapId, fromPosition, toPosition) ?? 1,
			events: this.movementEvents,
			reservationPolicy: this.reservationPolicy,
			yieldPolicy: this.yieldPolicy,
			reroutePolicy: this.reroutePolicy
		})

		const handlerDeps = {
			state: this.state,
			taskState: this.taskState,
			occupancy: this.occupancy,
			stepController: this.stepController,
			events: this.movementEvents,
			completePath: (entityId: string) => this.completePath(entityId)
		}
		this.readyHandler = new ReadyPhaseHandler(handlerDeps)
		this.blockedHandler = new BlockedPhaseHandler(handlerDeps)
		this.movingHandler = new MovingPhaseHandler(handlerDeps)
		this.pendingHandler = new PendingCompletionPhaseHandler((entityId: string) => this.completePath(entityId))

		this.engine = new MovementEngine({
			state: this.state,
			taskState: this.taskState,
			occupancy: this.occupancy,
			cyclePolicy: this.cyclePolicy,
			readyHandler: this.readyHandler,
			blockedHandler: this.blockedHandler,
			movingHandler: this.movingHandler,
			pendingHandler: this.pendingHandler,
			logger: this.logger
		})

		this.commands = new MovementCommandService({
			state: this.state,
			occupancy: this.occupancy,
			taskState: this.taskState,
			pathPlanner: this.planner,
			stepController: this.stepController,
			logger: this.logger
		})

		this.snapshots = new MovementSnapshotService({
			state: this.state,
			occupancy: this.occupancy,
			resetPolicies: () => this.resetPolicies(),
			moveToPosition: (entityId, targetPosition, options) =>
				this.commands.moveToPosition(entityId, targetPosition, options as MoveToPositionOptions | undefined)
		})

		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		this.managers.event.on(SimulationEvents.SS.Tick, this.handleSimulationSSTick)
	}

	private readonly handleSimulationSSTick = (data: SimulationTickData): void => {
		this.state.simulationTimeMs = data.nowMs
		this.engine.tick(data)
	}

	public registerEntity(entity: MovementEntity): void {
		this.commands.registerEntity(entity)
	}

	public unregisterEntity(entityId: string): void {
		this.commands.unregisterEntity(entityId)
	}

	public moveToPosition(entityId: string, targetPosition: Position, options?: MoveToPositionOptions): boolean {
		return this.commands.moveToPosition(entityId, targetPosition, options)
	}

	public moveAlongPath(entityId: string, path: Position[], options?: MoveToPositionOptions): boolean {
		return this.commands.moveAlongPath(entityId, path, options)
	}

	public cancelMovement(entityId: string): void {
		this.commands.cancelMovement(entityId)
	}

	public getEntityPosition(entityId: string): Position | null {
		const entity = this.state.entities.get(entityId)
		return entity ? entity.position : null
	}

	public isTileFreeForYield(mapId: MapId, tileX: number, tileY: number, ignoreEntityId?: string): boolean {
		return this.occupancy.isTileFreeForYield(mapId, tileX, tileY, ignoreEntityId)
	}

	public serialize(): MovementSnapshot {
		return this.snapshots.serialize()
	}

	public deserialize(snapshot: MovementSnapshot): void {
		this.snapshots.deserialize(snapshot)
	}

	public reset(): void {
		this.snapshots.reset()
	}

	public hasActiveMovement(entityId: string): boolean {
		return this.state.tasks.has(entityId)
	}

	public updateEntityPosition(entityId: string, position: Position): void {
		const entity = this.state.entities.get(entityId)
		if (!entity) {
			this.logger.error(`Entity not found: ${entityId}`)
			return
		}

		this.commands.cancelMovement(entityId)
		entity.position = { ...position }
		this.occupancy.markEntityStatic(entity)
		this.movementEvents.emitPositionUpdated(entity.id, entity.position, entity.mapId)
	}

	private completePath(entityId: string): void {
		const task = this.state.tasks.get(entityId)
		const entity = this.state.entities.get(entityId)
		if (!task || !entity) {
			this.logger.warn(`completePath: No task or entity for ${entityId}`)
			return
		}

		releaseTileReservation(task, this.state, this.occupancy)
		this.occupancy.markEntityStatic(entity)

		const completionTime = this.state.simulationTimeMs
		const movementDuration = completionTime - task.createdAt
		this.logger.log(`[MOVEMENT COMPLETE] entityId=${entityId} | finalPosition=(${Math.round(entity.position.x)},${Math.round(entity.position.y)}) | targetType=${task.targetType || 'none'} | targetId=${task.targetId || 'none'} | duration=${movementDuration}ms | time=${completionTime}`)

		const targetType = task.targetType
		const targetId = task.targetId
		const finalPosition = { ...entity.position }

		this.state.tasks.delete(entityId)
		this.logger.debug(`Task removed for ${entityId} before emitting events`)

		this.movementEvents.emitStepComplete(entity.id, finalPosition)
		if (task.onStepComplete) {
			task.onStepComplete(task, finalPosition)
		}

		this.logger.log(`[PATH COMPLETE EVENT] Emitting PathComplete event for ${entityId} | targetType=${targetType || 'none'} | targetId=${targetId || 'none'} | time=${completionTime}`)
		this.movementEvents.emitPathComplete(entityId, targetType, targetId)
		if (task.onPathComplete) {
			task.onPathComplete(task)
		}
	}

	private resetPolicies(): void {
		this.yieldPolicy.reset()
	}
}

export * from './types'
export * from './events'
export * from './MovementManagerState'
