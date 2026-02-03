import { BaseManager } from '../../Managers'
import type { EventClient, EventManager } from '../../events'
import { PopulationEvents } from '../../Population/events'
import { BuildingsEvents } from '../../Buildings/events'
import { SimulationEvents } from '../../Simulation/events'
import type { SimulationTickData } from '../../Simulation/types'
import type { WorkProviderDeps } from './deps'
import { Logger } from '../../Logs'
import { Receiver } from '../../Receiver'
import { v4 as uuidv4 } from 'uuid'
import { calculateDistance } from '../../utils'
import { SettlerState, ProfessionType } from '../../Population/types'
import { NeedsEvents } from '../../Needs/events'
import type { ContextPauseRequestedEventData, ContextResumeRequestedEventData, PausedContext } from '../../Needs/types'
import type { RequestWorkerData, UnassignWorkerData } from '../../Population/types'
import { WorkerRequestFailureReason } from '../../Population/types'
import type { BuildingDefinition, BuildingInstance, SetProductionPausedData } from '../../Buildings/types'
import { ConstructionStage } from '../../Buildings/types'
import { ProviderRegistry } from './ProviderRegistry'
import { ActionSystem, type ActionQueueContextResolver } from './ActionSystem'
import { WorkProviderEvents } from './events'
import type { WorkAssignment, WorkAction, LogisticsRequest } from './types'
import { WorkProviderType, WorkAssignmentStatus } from './types'
import type { ActionQueueContext, WorkProviderSnapshot } from '../../state/types'
import { ActionQueueContextKind } from '../../state/types'
import { AssignmentStore } from './AssignmentStore'
import { ProviderFactory } from './ProviderFactory'
import { PolicyEngine } from './PolicyEngine'
import { ProductionTracker } from './ProductionTracker'
import { DispatchCoordinator } from './DispatchCoordinator'
import { LogisticsCoordinator } from './LogisticsCoordinator'
import { ConstructionCoordinator } from './ConstructionCoordinator'
import { RoadCoordinator } from './RoadCoordinator'
import { LogisticsProvider } from './providers/LogisticsProvider'
import { CriticalNeedsPolicy } from './policies/CriticalNeedsPolicy'
import { HomeRelocationPolicy } from './policies/HomeRelocationPolicy'

export class WorkProviderManager extends BaseManager<WorkProviderDeps> {
	private registry = new ProviderRegistry()
	private assignments = new AssignmentStore()
	private providers: ProviderFactory
	private logisticsProvider: LogisticsProvider
	private actionSystem: ActionSystem
	private policyEngine: PolicyEngine
	private productionTracker: ProductionTracker
	private dispatcher: DispatchCoordinator
	private logisticsCoordinator: LogisticsCoordinator
	private constructionCoordinator: ConstructionCoordinator
	private roadCoordinator: RoadCoordinator
	private simulationTimeMs = 0
	private constructionAssignCooldownMs = 2000
	private pauseRequests = new Map<string, { reason: string }>()
	private pausedContexts = new Map<string, PausedContext | null>()
	private pendingWorkerRequests: Array<{ buildingInstanceId: string, requestedAtMs: number }> = []

	constructor(
		managers: WorkProviderDeps,
		private event: EventManager,
		private logger: Logger
	) {
		super(managers)

		this.logisticsProvider = new LogisticsProvider(
			this.managers,
			this.logger,
			() => this.simulationTimeMs
		)
		this.registry.register(this.logisticsProvider)

		this.actionSystem = new ActionSystem(
			this.managers,
			event,
			this.logger
		)

		this.providers = new ProviderFactory(this.managers, this.registry, this.logger, this.logisticsProvider)

		const policies = [
			new CriticalNeedsPolicy(),
			new HomeRelocationPolicy()
		]

		let dispatcherRef: DispatchCoordinator
		const dispatchNextStep = (settlerId: string) => dispatcherRef.dispatchNextStep(settlerId)

		this.policyEngine = new PolicyEngine(
			policies,
			this.managers,
			this.actionSystem,
			this.assignments,
			dispatchNextStep
		)

		this.productionTracker = new ProductionTracker(
			this.managers,
			this.event,
			this.assignments,
			dispatchNextStep
		)

		this.dispatcher = new DispatchCoordinator(
			this.managers,
			this.event,
			this.assignments,
			this.registry,
			this.actionSystem,
			this.logisticsProvider,
			this.policyEngine,
			this.productionTracker,
			() => this.simulationTimeMs,
			() => ({ pauseRequests: this.pauseRequests, pausedContexts: this.pausedContexts }),
			(settlerId) => this.applyPause(settlerId),
			(settlerId) => this.unassignWorker({ settlerId })
		)
		dispatcherRef = this.dispatcher

		this.logisticsCoordinator = new LogisticsCoordinator(
			this.managers,
			this.event,
			this.logisticsProvider,
			this.assignments,
			() => this.simulationTimeMs,
			dispatchNextStep
		)

		this.constructionCoordinator = new ConstructionCoordinator(
			this.managers,
			this.assignments,
			() => this.simulationTimeMs,
			(buildingInstanceId, mapId) => this.requestWorker({ buildingInstanceId }, this.getServerClient(mapId)),
			(settlerId) => this.unassignWorker({ settlerId }),
			this.constructionAssignCooldownMs
		)

		this.roadCoordinator = new RoadCoordinator(
			this.managers,
			this.assignments,
			this.providers,
			() => this.simulationTimeMs,
			dispatchNextStep
		)

		this.actionSystem.registerContextResolver(ActionQueueContextKind.Work, (settlerId, context) => {
			if (context.kind !== ActionQueueContextKind.Work) {
				return {}
			}
			return this.dispatcher.buildWorkQueueCallbacks(settlerId, context.step)
		})

		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		this.event.on<RequestWorkerData>(PopulationEvents.CS.RequestWorker, (data, client) => {
			this.requestWorker(data, client)
		})

		this.event.on<UnassignWorkerData>(PopulationEvents.CS.UnassignWorker, (data) => {
			this.unassignWorker(data)
		})

		this.event.on(PopulationEvents.SS.SettlerDied, (data: { settlerId: string }) => {
			this.handleSettlerDied(data)
		})

		this.event.on<SetProductionPausedData>(BuildingsEvents.CS.SetProductionPaused, (data) => {
			this.productionTracker.handleProductionPaused(data)
		})

		this.event.on(BuildingsEvents.SS.ConstructionCompleted, (data: { buildingInstanceId: string }) => {
			this.constructionCoordinator.unassignAllForBuilding(data.buildingInstanceId)
		})

		this.event.on(BuildingsEvents.SS.Removed, (data: { buildingInstanceId: string }) => {
			this.constructionCoordinator.unassignAllForBuilding(data.buildingInstanceId)
		})

		this.event.on(SimulationEvents.SS.Tick, (data: SimulationTickData) => {
			this.handleSimulationTick(data)
		})

		this.event.on(NeedsEvents.SS.ContextPauseRequested, (data: ContextPauseRequestedEventData) => {
			this.handleContextPauseRequested(data)
		})

		this.event.on(NeedsEvents.SS.ContextResumeRequested, (data: ContextResumeRequestedEventData) => {
			this.handleContextResumeRequested(data)
		})

		this.event.on(WorkProviderEvents.CS.SetLogisticsPriorities, (data: { itemPriorities: string[] }) => {
			const priorities = Array.isArray(data?.itemPriorities) ? data.itemPriorities : []
			this.logisticsProvider.setItemPriorities(priorities)
			this.logisticsCoordinator.broadcast()
		})
	}

	private handleSimulationTick(data: SimulationTickData): void {
		this.simulationTimeMs = data.nowMs
		this.actionSystem.setTime(this.simulationTimeMs)

		this.migrateWarehouseAssignments()
		this.processPendingWorkerRequests()
		this.logisticsCoordinator.tick()
		this.constructionCoordinator.assignConstructionWorkers()
		this.roadCoordinator.assignRoadWorkers()
		this.dispatcher.processPendingDispatches()
	}

	private migrateWarehouseAssignments(): void {
		for (const assignment of this.assignments.getAll()) {
			if (assignment.providerType !== WorkProviderType.Building || !assignment.buildingInstanceId) {
				continue
			}
			const building = this.managers.buildings.getBuildingInstance(assignment.buildingInstanceId)
			if (!building) {
				continue
			}
			const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
			if (!definition?.isWarehouse) {
				continue
			}
			const buildingProvider = this.providers.getBuilding(assignment.buildingInstanceId)
			buildingProvider?.unassign(assignment.settlerId)

			assignment.providerType = WorkProviderType.Logistics
			assignment.providerId = this.logisticsProvider.id
			this.logisticsProvider.assign(assignment.settlerId)
			this.managers.population.setSettlerAssignment(
				assignment.settlerId,
				assignment.assignmentId,
				assignment.providerId,
				assignment.buildingInstanceId
			)
			this.event.emit(Receiver.Group, PopulationEvents.SC.WorkerAssigned, {
				assignment,
				settlerId: assignment.settlerId,
				buildingInstanceId: assignment.buildingInstanceId
			}, building.mapId)
			this.dispatcher.dispatchNextStep(assignment.settlerId)
		}
	}

	private handleContextPauseRequested(data: ContextPauseRequestedEventData): void {
		if (this.pauseRequests.has(data.settlerId) || this.pausedContexts.has(data.settlerId)) {
			return
		}

		this.pauseRequests.set(data.settlerId, { reason: data.reason })

		if (!this.actionSystem.isBusy(data.settlerId)) {
			this.applyPause(data.settlerId)
		}
	}

	private handleContextResumeRequested(data: ContextResumeRequestedEventData): void {
		this.pauseRequests.delete(data.settlerId)
		this.pausedContexts.delete(data.settlerId)

		const assignment = this.assignments.get(data.settlerId)
		if (assignment) {
			assignment.status = WorkAssignmentStatus.Assigned
			const provider = this.registry.get(assignment.providerId)
			provider?.resume(data.settlerId)
		}

		this.event.emit(Receiver.All, NeedsEvents.SS.ContextResumed, { settlerId: data.settlerId })

		if (assignment) {
			this.dispatcher.dispatchNextStep(data.settlerId)
		}
	}

	private handleSettlerDied(data: { settlerId: string }): void {
		this.unassignWorker({ settlerId: data.settlerId })
	}

	private applyPause(settlerId: string): void {
		if (this.pausedContexts.has(settlerId)) {
			return
		}

		const assignment = this.assignments.get(settlerId)
		let context: PausedContext | null = null

		if (assignment) {
			assignment.status = WorkAssignmentStatus.Paused
			const provider = this.registry.get(assignment.providerId)
			provider?.pause(settlerId, this.pauseRequests.get(settlerId)?.reason)
			context = {
				assignmentId: assignment.assignmentId,
				providerId: assignment.providerId,
				providerType: assignment.providerType
			}
		}

		this.pausedContexts.set(settlerId, context)
		this.event.emit(Receiver.All, NeedsEvents.SS.ContextPaused, { settlerId, context })
	}

	private requestWorker(data: RequestWorkerData, client: EventClient): void {
		const building = this.managers.buildings.getBuildingInstance(data.buildingInstanceId)
		if (!building) {
			return
		}

		const buildingDef = this.managers.buildings.getBuildingDefinition(building.buildingId)
		if (!buildingDef) {
			return
		}

		const isConstruction = building.stage === ConstructionStage.Constructing
		const workerSlots = buildingDef.workerSlots || 0
		if (!isConstruction && workerSlots > 0) {
			const assigned = this.assignments.getByBuilding(building.id)?.size || 0
			const pending = this.getPendingWorkerCount(building.id)
			if (assigned + pending >= workerSlots) {
				if (pending === 0) {
					client.emit(Receiver.Sender, PopulationEvents.SC.WorkerRequestFailed, {
						buildingInstanceId: building.id,
						reason: WorkerRequestFailureReason.BuildingDoesNotNeedWorkers
					})
				}
				return
			}
		}

		const failure = this.tryAssignWorkerToBuilding(building, buildingDef)
		if (!failure) {
			return
		}

		if (!isConstruction && this.shouldQueueWorkerRequest(failure, isConstruction)) {
			this.enqueueWorkerRequest(building.id)
			return
		}

		client.emit(Receiver.Sender, PopulationEvents.SC.WorkerRequestFailed, {
			buildingInstanceId: building.id,
			reason: failure
		})
	}

	private tryAssignWorkerToBuilding(building: BuildingInstance, buildingDef: BuildingDefinition): WorkerRequestFailureReason | null {
		let requiredProfession = buildingDef.requiredProfession ?? undefined
		const isConstruction = building.stage === ConstructionStage.Constructing
		const isWarehouseAssignment = !isConstruction && Boolean(buildingDef.isWarehouse)
		if (isConstruction) {
			requiredProfession = ProfessionType.Builder
		}

		const candidate = this.findBestSettler(building.mapId, building.playerId, building.position, requiredProfession, {
			allowFallbackToCarrier: !isConstruction
		})
		if (!candidate) {
			return isConstruction
				? WorkerRequestFailureReason.NoBuilderAvailable
				: requiredProfession
					? WorkerRequestFailureReason.NoSuitableProfession
					: WorkerRequestFailureReason.NoAvailableWorker
		}

		const providerId = isWarehouseAssignment
			? this.logisticsProvider.id
			: (isConstruction ? `construction:${building.id}` : building.id)
		const providerType = isWarehouseAssignment
			? WorkProviderType.Logistics
			: (isConstruction ? WorkProviderType.Construction : WorkProviderType.Building)

		const assignment: WorkAssignment = {
			assignmentId: uuidv4(),
			settlerId: candidate.id,
			providerId,
			providerType,
			buildingInstanceId: building.id,
			requiredProfession: requiredProfession,
			assignedAt: this.simulationTimeMs,
			status: WorkAssignmentStatus.Assigned
		}

		this.assignments.set(assignment)
		this.managers.buildings.setAssignedWorker(building.id, candidate.id, true)

		const provider = providerType === WorkProviderType.Logistics
			? this.logisticsProvider
			: (isConstruction
				? this.providers.getConstruction(building.id)
				: this.providers.getBuilding(building.id))
		provider?.assign(candidate.id)

		this.managers.population.setSettlerAssignment(candidate.id, assignment.assignmentId, assignment.providerId, building.id)
		this.managers.population.setSettlerState(candidate.id, SettlerState.Assigned)

		this.event.emit(Receiver.All, WorkProviderEvents.SS.AssignmentCreated, { assignment })
		this.event.emit(Receiver.Group, PopulationEvents.SC.WorkerAssigned, {
			assignment,
			settlerId: candidate.id,
			buildingInstanceId: building.id
		}, building.mapId)

		this.dispatcher.dispatchNextStep(candidate.id)
		return null
	}

	private shouldQueueWorkerRequest(reason: WorkerRequestFailureReason, isConstruction: boolean): boolean {
		if (isConstruction) {
			return false
		}
		return reason === WorkerRequestFailureReason.NoAvailableWorker
			|| reason === WorkerRequestFailureReason.NoSuitableProfession
	}

	private getPendingWorkerCount(buildingInstanceId: string): number {
		return this.pendingWorkerRequests.filter(request => request.buildingInstanceId === buildingInstanceId).length
	}

	private getPendingWorkerCounts(): Map<string, number> {
		const counts = new Map<string, number>()
		for (const request of this.pendingWorkerRequests) {
			counts.set(request.buildingInstanceId, (counts.get(request.buildingInstanceId) || 0) + 1)
		}
		return counts
	}

	private enqueueWorkerRequest(buildingInstanceId: string): void {
		this.pendingWorkerRequests.push({
			buildingInstanceId,
			requestedAtMs: this.simulationTimeMs
		})
		this.emitWorkerQueueUpdated(buildingInstanceId)
	}

	private processPendingWorkerRequests(): void {
		if (this.pendingWorkerRequests.length === 0) {
			return
		}
		const previousCounts = this.getPendingWorkerCounts()
		const nextQueue: Array<{ buildingInstanceId: string, requestedAtMs: number }> = []
		const reservedCounts = new Map<string, number>()

		for (const request of this.pendingWorkerRequests) {
			const building = this.managers.buildings.getBuildingInstance(request.buildingInstanceId)
			if (!building) {
				continue
			}
			const buildingDef = this.managers.buildings.getBuildingDefinition(building.buildingId)
			if (!buildingDef) {
				continue
			}
			const isConstruction = building.stage === ConstructionStage.Constructing
			if (isConstruction) {
				continue
			}
			const workerSlots = buildingDef.workerSlots || 0
			if (workerSlots <= 0) {
				continue
			}
			const assigned = this.assignments.getByBuilding(building.id)?.size || 0
			const reserved = reservedCounts.get(building.id) || 0
			if (assigned + reserved >= workerSlots) {
				continue
			}

			const failure = this.tryAssignWorkerToBuilding(building, buildingDef)
			if (!failure) {
				continue
			}
			if (!this.shouldQueueWorkerRequest(failure, isConstruction)) {
				continue
			}
			nextQueue.push(request)
			reservedCounts.set(building.id, reserved + 1)
		}

		this.pendingWorkerRequests = nextQueue
		const nextCounts = this.getPendingWorkerCounts()
		const buildingIds = new Set<string>([...previousCounts.keys(), ...nextCounts.keys()])
		for (const buildingId of buildingIds) {
			const previous = previousCounts.get(buildingId) || 0
			const next = nextCounts.get(buildingId) || 0
			if (previous !== next) {
				this.emitWorkerQueueUpdated(buildingId)
			}
		}
	}

	private emitWorkerQueueUpdated(buildingInstanceId: string): void {
		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return
		}
		this.event.emit(Receiver.Group, BuildingsEvents.SC.WorkerQueueUpdated, {
			buildingInstanceId,
			queuedCount: this.getPendingWorkerCount(buildingInstanceId)
		}, building.mapId)
	}

	private unassignWorker(data: UnassignWorkerData): void {
		const assignment = this.assignments.get(data.settlerId)
		if (!assignment) {
			return
		}

		this.actionSystem.abort(data.settlerId)
		this.dispatcher.clearSettlerState(data.settlerId)

		this.assignments.remove(data.settlerId)
		if (assignment.buildingInstanceId) {
			this.managers.buildings.setAssignedWorker(assignment.buildingInstanceId, data.settlerId, false)
			const provider = assignment.providerType === WorkProviderType.Logistics
				? this.logisticsProvider
				: (assignment.providerType === WorkProviderType.Construction
					? this.providers.getConstruction(assignment.buildingInstanceId)
					: this.providers.getBuilding(assignment.buildingInstanceId))
			provider?.unassign(data.settlerId)
		} else {
			const provider = this.registry.get(assignment.providerId)
			provider?.unassign(data.settlerId)
		}

		this.managers.population.setSettlerAssignment(data.settlerId, undefined, undefined, undefined)
		this.managers.population.setSettlerState(data.settlerId, SettlerState.Idle)
		this.managers.population.setSettlerWaitReason(data.settlerId, undefined)

		this.event.emit(Receiver.All, WorkProviderEvents.SS.AssignmentRemoved, { assignmentId: assignment.assignmentId })
		if (assignment.buildingInstanceId) {
			const building = this.managers.buildings.getBuildingInstance(assignment.buildingInstanceId)
			if (building) {
				this.event.emit(Receiver.Group, PopulationEvents.SC.WorkerUnassigned, {
					settlerId: data.settlerId,
					assignmentId: assignment.assignmentId,
					buildingInstanceId: assignment.buildingInstanceId
				}, building.mapId)
			}
		}
	}

	private getServerClient(mapId?: string): EventClient {
		return {
			id: 'server',
			currentGroup: mapId || 'GLOBAL',
			setGroup: () => {},
			emit: (to, event, data, groupName) => {
				this.event.emit(to, event, data, groupName)
			}
		}
	}

	public enqueueActions(settlerId: string, actions: WorkAction[], onComplete?: () => void, onFail?: (reason: string) => void, context?: ActionQueueContext): void {
		if (this.actionSystem.isBusy(settlerId)) {
			this.logger.warn(`[WorkProvider] Cannot enqueue actions for ${settlerId}: action system busy`)
			onFail?.('action_system_busy')
			return
		}
		this.actionSystem.enqueue(settlerId, actions, onComplete, onFail, context)
	}

	public registerActionContextResolver(kind: ActionQueueContext['kind'], resolver: ActionQueueContextResolver): void {
		this.actionSystem.registerContextResolver(kind, resolver)
	}

	public isSettlerBusy(settlerId: string): boolean {
		return this.actionSystem.isBusy(settlerId)
	}

	private findBestSettler(
		mapId: string,
		playerId: string,
		position: { x: number, y: number },
		requiredProfession?: ProfessionType | null,
		options: { allowFallbackToCarrier?: boolean } = {}
	) {
		const idleSettlers = this.managers.population.getAvailableSettlers(mapId, playerId)
		if (idleSettlers.length === 0) {
			return null
		}

		if (requiredProfession) {
			const matching = idleSettlers.filter(s => s.profession === requiredProfession)
			if (matching.length > 0) {
				return this.findClosestSettler(matching, position)
			}
			if (options.allowFallbackToCarrier !== false) {
				const carriers = idleSettlers.filter(s => s.profession === ProfessionType.Carrier)
				if (carriers.length > 0) {
					return this.findClosestSettler(carriers, position)
				}
			}
			return null
		}

		return this.findClosestSettler(idleSettlers, position)
	}

	private findClosestSettler(settlers: Array<{ position: { x: number, y: number } }>, position: { x: number, y: number }) {
		let closest = settlers[0]
		let closestDistance = calculateDistance(position, closest.position)
		for (let i = 1; i < settlers.length; i++) {
			const distance = calculateDistance(position, settlers[i].position)
			if (distance < closestDistance) {
				closest = settlers[i]
				closestDistance = distance
			}
		}
		return closest as any
	}

	// External hooks for LogisticsProvider
	public enqueueLogisticsRequest(request: LogisticsRequest): void {
		this.logisticsProvider.enqueue(request)
	}

	serialize(): WorkProviderSnapshot {
		const dispatchSnapshot = this.dispatcher.serialize()
		return {
			assignments: this.assignments.serializeAssignments(),
			assignmentsByBuilding: this.assignments.serializeAssignmentsByBuilding(),
			productionStateByBuilding: this.productionTracker.serialize(),
			lastConstructionAssignAt: this.constructionCoordinator.serializeLastAssignAt(),
			pauseRequests: Array.from(this.pauseRequests.entries()).map(([settlerId, payload]) => ([
				settlerId,
				{ ...payload }
			])),
			pausedContexts: Array.from(this.pausedContexts.entries()),
			movementRecoveryUntil: dispatchSnapshot.movementRecoveryUntil,
			movementRecoveryReason: dispatchSnapshot.movementRecoveryReason,
			movementFailureCounts: dispatchSnapshot.movementFailureCounts,
			pendingDispatchAtMs: dispatchSnapshot.pendingDispatchAtMs,
			actionSystem: this.actionSystem.serialize(),
			logistics: this.logisticsProvider.serialize(),
			pendingWorkerRequests: this.pendingWorkerRequests.map(request => ({ ...request }))
		}
	}

	deserialize(state: WorkProviderSnapshot): void {
		this.assignments.clear()
		this.productionTracker.deserialize(state.productionStateByBuilding)
		this.constructionCoordinator.deserializeLastAssignAt(state.lastConstructionAssignAt)
		this.pauseRequests = new Map(state.pauseRequests)
		this.pausedContexts = new Map(state.pausedContexts)
		this.dispatcher.deserialize({
			movementRecoveryUntil: state.movementRecoveryUntil,
			movementRecoveryReason: state.movementRecoveryReason,
			movementFailureCounts: state.movementFailureCounts,
			pendingDispatchAtMs: state.pendingDispatchAtMs
		})
		this.simulationTimeMs = this.managers.simulation.getSimulationTimeMs()
		this.actionSystem.setTime(this.simulationTimeMs)
		this.actionSystem.deserialize(state.actionSystem)

		this.assignments.deserialize(state.assignments, state.assignmentsByBuilding)
		this.pendingWorkerRequests = (state.pendingWorkerRequests || []).map(request => ({ ...request }))

		for (const assignment of this.assignments.getAll()) {
			if (assignment.providerType === WorkProviderType.Logistics) {
				this.logisticsProvider.assign(assignment.settlerId)
				continue
			}

			if (assignment.providerType === WorkProviderType.Construction && assignment.buildingInstanceId) {
				this.providers.getConstruction(assignment.buildingInstanceId)?.assign(assignment.settlerId)
				continue
			}

			if (assignment.providerType === WorkProviderType.Road) {
				const [_, mapId, playerId] = assignment.providerId.split(':')
				if (mapId && playerId) {
					this.providers.getRoad(mapId, playerId).assign(assignment.settlerId)
				}
				continue
			}

			if (assignment.buildingInstanceId) {
				this.providers.getBuilding(assignment.buildingInstanceId)?.assign(assignment.settlerId)
			}
		}

		this.logisticsProvider.deserialize(state.logistics)

		for (const assignment of this.assignments.getAll()) {
			if (this.actionSystem.isBusy(assignment.settlerId)) {
				continue
			}
			if (this.pauseRequests.has(assignment.settlerId) || this.pausedContexts.has(assignment.settlerId)) {
				continue
			}
			this.dispatcher.dispatchNextStep(assignment.settlerId)
		}
	}

	reset(): void {
		this.assignments.clear()
		this.providers.clear()
		this.productionTracker.reset()
		this.constructionCoordinator.reset()
		this.pauseRequests.clear()
		this.pausedContexts.clear()
		this.pendingWorkerRequests = []
		this.dispatcher.reset()
		this.simulationTimeMs = 0
		this.logisticsProvider.reset()
		this.actionSystem.reset()
	}
}

export { WorkProviderEvents }
export * from './types'
export * from './deps'
export * from './policies'
