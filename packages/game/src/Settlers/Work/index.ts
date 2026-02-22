import { BaseManager } from '../../Managers'
import type { EventClient } from '../../events'
import { PopulationEvents } from '../../Population/events'
import { BuildingsEvents } from '../../Buildings/events'
import type { SimulationTickData } from '../../Simulation/types'
import type { WorkProviderDeps } from './deps'
import { Logger } from '../../Logs'
import { Receiver } from '../../Receiver'
import { v4 as uuidv4 } from 'uuid'
import { calculateDistance } from '../../utils'
import { SettlerState, ProfessionType, type Settler } from '../../Population/types'
import type { RequestWorkerData, UnassignWorkerData } from '../../Population/types'
import { WorkerRequestFailureReason } from '../../Population/types'
import type { ItemType } from '../../Items/types'
import type { BuildingDefinition, BuildingInstance, ProductionRecipe, SetProductionPausedData } from '../../Buildings/types'
import { ConstructionStage } from '../../Buildings/types'
import { ProviderRegistry } from './ProviderRegistry'
import { WorkProviderEvents, WorkDispatchReason } from './events'
import type { WorkStepCompletedEventData, WorkStepFailedEventData, WorkStepIssuedEventData } from './events'
import type { WorkAssignment, LogisticsRequest, WorkPausedContext, WorkStep, WorkProvider, WorkDispatchStepResult } from './types'
import { TransportTargetType, WorkProviderType, WorkAssignmentStatus, WorkStepType, WorkWaitReason } from './types'
import { StepHandlers } from './stepHandlers'
import type { SettlerAction } from '../Actions/types'
import type { WorkProviderSnapshot } from '../../state/types'
import { AssignmentStore } from './AssignmentStore'
import { ProviderFactory } from './ProviderFactory'
import { ProductionTracker } from './ProductionTracker'
import type { SettlerId } from '../../ids'
import { LogisticsCoordinator } from './coordinators/LogisticsCoordinator'
import { ConstructionCoordinator } from './coordinators/ConstructionCoordinator'
import { RoadCoordinator } from './coordinators/RoadCoordinator'
import { ProspectingCoordinator } from './coordinators/ProspectingCoordinator'
import { LogisticsProvider } from './providers/LogisticsProvider'
import type { SettlerWorkRuntimePort } from './runtime'
import {
	BehaviourIntentType,
	type BehaviourIntent,
	BehaviourIntentPriority,
	RequestDispatchReason,
	SetWaitStateReason
} from '../Behaviour/intentTypes'
import { isMovementActionFailureReason, SettlerActionFailureReason } from '../failureReasons'

const MOVEMENT_RECOVERY_COOLDOWN_MS = 8000
const MOVEMENT_FAILURE_MAX_RETRIES = 3
const isWorkWaitReason = (reason: string): reason is WorkWaitReason =>
	(Object.values(WorkWaitReason) as string[]).includes(reason)

export class SettlerWorkManager extends BaseManager<WorkProviderDeps> implements SettlerWorkRuntimePort {
	private registry = new ProviderRegistry()
	private assignments = new AssignmentStore()
	private providers: ProviderFactory
	private logisticsProvider: LogisticsProvider
	private actionsManager: WorkProviderDeps['actions']
	private productionTracker: ProductionTracker
	private logisticsCoordinator: LogisticsCoordinator
	private constructionCoordinator: ConstructionCoordinator
	private roadCoordinator: RoadCoordinator
	private prospectingCoordinator: ProspectingCoordinator
	private simulationTimeMs = 0
	private constructionAssignCooldownMs = 2000
	private pausedContexts = new Map<string, WorkPausedContext | null>()
	private pendingWorkerRequests: Array<{ buildingInstanceId: string, requestedAtMs: number }> = []
	private pendingIntents: BehaviourIntent[] = []
	private movementFailureCounts = new Map<SettlerId, number>()

	constructor(
		managers: WorkProviderDeps,
		private logger: Logger
	) {
		super(managers)
		this.actionsManager = this.managers.actions

		this.logisticsProvider = new LogisticsProvider(
			this.managers,
			this.logger,
			() => this.simulationTimeMs
		)
		this.registry.register(this.logisticsProvider)

		this.providers = new ProviderFactory(this.managers, this.registry, this.logger, this.logisticsProvider)

		const dispatchNextStep = (settlerId: string) => this.emitDispatchRequested(settlerId, WorkDispatchReason.WorkFlow)

		this.productionTracker = new ProductionTracker(
			this.managers,
			this.managers.event,
			this.assignments,
			dispatchNextStep
		)

		this.logisticsCoordinator = new LogisticsCoordinator(
			this.managers,
			this.managers.event,
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
			dispatchNextStep,
			(mapId, playerId, options) => this.getAssignmentCandidates(mapId, playerId, options)
		)

		this.prospectingCoordinator = new ProspectingCoordinator(
			this.managers,
			this.assignments,
			this.providers,
			() => this.simulationTimeMs,
			dispatchNextStep,
			(mapId, playerId, options) => this.getAssignmentCandidates(mapId, playerId, options)
		)

		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		this.managers.event.on<RequestWorkerData>(PopulationEvents.CS.RequestWorker, this.handlePopulationCSRequestWorker)
		this.managers.event.on<UnassignWorkerData>(PopulationEvents.CS.UnassignWorker, this.handlePopulationCSUnassignWorker)
		this.managers.event.on(PopulationEvents.SS.SettlerDied, this.handlePopulationSSSettlerDied)
		this.managers.event.on<SetProductionPausedData>(BuildingsEvents.CS.SetProductionPaused, this.handleBuildingsCSSetProductionPaused)
		this.managers.event.on(BuildingsEvents.CS.Place, this.handleBuildingsCSPlace)
		this.managers.event.on(BuildingsEvents.CS.Cancel, this.handleBuildingsCSCancel)
		this.managers.event.on(BuildingsEvents.CS.SetStorageRequests, this.handleBuildingsCSSetStorageRequests)
		this.managers.event.on(BuildingsEvents.SS.ConstructionCompleted, this.handleBuildingsSSConstructionCompleted)
		this.managers.event.on(BuildingsEvents.SS.Removed, this.handleBuildingsSSRemoved)
		this.managers.event.on(WorkProviderEvents.CS.SetLogisticsPriorities, this.handleWorkProviderCSSetLogisticsPriorities)
		this.managers.event.on(WorkProviderEvents.SS.StepCompleted, this.handleWorkProviderSSStepCompleted)
		this.managers.event.on(WorkProviderEvents.SS.StepFailed, this.handleWorkProviderSSStepFailed)
	}

	/* EVENT HANDLERS */
	private readonly handlePopulationCSRequestWorker = (data: RequestWorkerData, client: EventClient): void => {
		this.requestWorker(data, client)
	}

	private readonly handlePopulationCSUnassignWorker = (data: UnassignWorkerData): void => {
		this.unassignWorker(data)
	}

	private readonly handlePopulationSSSettlerDied = (data: { settlerId: string }): void => {
		this.handleSettlerDied(data)
	}

	private readonly handleBuildingsCSSetProductionPaused = (data: SetProductionPausedData): void => {
		this.productionTracker.handleProductionPaused(data)
	}

	private readonly handleBuildingsCSPlace = (_data: unknown, client: EventClient): void => {
		this.logisticsCoordinator.markMapDirty(client.currentGroup)
	}

	private readonly handleBuildingsCSCancel = (data: { buildingInstanceId: string }): void => {
		this.logisticsCoordinator.markBuildingDirty(data.buildingInstanceId)
	}

	private readonly handleBuildingsCSSetStorageRequests = (data: { buildingInstanceId: string }): void => {
		this.logisticsCoordinator.markBuildingDirty(data.buildingInstanceId, {
			consumption: false,
			construction: false,
			warehouse: true
		})
	}

	private readonly handleBuildingsSSConstructionCompleted = (data: { buildingInstanceId: string, mapId?: string }): void => {
		this.constructionCoordinator.unassignAllForBuilding(data.buildingInstanceId)
		this.logisticsCoordinator.markBuildingDirty(data.buildingInstanceId)
		this.logisticsCoordinator.markMapDirty(data.mapId)
	}

	private readonly handleBuildingsSSRemoved = (data: { buildingInstanceId: string, mapId?: string }): void => {
		this.constructionCoordinator.unassignAllForBuilding(data.buildingInstanceId)
		this.logisticsCoordinator.markBuildingDirty(data.buildingInstanceId)
		this.logisticsCoordinator.markMapDirty(data.mapId)
	}

	private readonly handleWorkProviderCSSetLogisticsPriorities = (data: { itemPriorities: string[] }): void => {
		const priorities = Array.isArray(data?.itemPriorities) ? data.itemPriorities : []
		this.logisticsProvider.setItemPriorities(priorities)
		this.logisticsCoordinator.broadcast()
	}

	private readonly handleWorkProviderSSStepCompleted = (data: WorkStepCompletedEventData): void => {
		this.logisticsCoordinator.handleStepEvent(data.step)
	}

	private readonly handleWorkProviderSSStepFailed = (data: WorkStepFailedEventData): void => {
		this.logisticsCoordinator.handleStepEvent(data.step)
	}

	public onWorkQueueCompleted(settlerId: SettlerId, step?: WorkStep): void {
		if (!step) {
			this.managers.population.setSettlerState(
				settlerId,
				this.assignments.has(settlerId) ? SettlerState.Assigned : SettlerState.Idle
			)
			this.emitDispatchRequested(settlerId, WorkDispatchReason.WorkFlow)
			return
		}
		const assignment = this.assignments.get(settlerId)
		if (!assignment) {
			return
		}
		this.handleStepCompleted(settlerId, assignment, step)
	}

	public onWorkQueueFailed(settlerId: SettlerId, step: WorkStep | undefined, reason: SettlerActionFailureReason): void {
		if (!step) {
			this.managers.population.setSettlerState(
				settlerId,
				this.assignments.has(settlerId) ? SettlerState.Assigned : SettlerState.Idle
			)
			this.emitDispatchRequested(settlerId, WorkDispatchReason.WorkFlow)
			return
		}
		const assignment = this.assignments.get(settlerId)
		if (!assignment) {
			return
		}
		this.handleStepFailed(settlerId, step, reason)
	}

	public refreshWorldDemand(data: SimulationTickData): void {
		this.simulationTimeMs = data.nowMs

		this.migrateWarehouseAssignments()
		this.processPendingWorkerRequests()
		this.logisticsCoordinator.tick()
		this.constructionCoordinator.assignConstructionWorkers()
		this.roadCoordinator.assignRoadWorkers()
		this.prospectingCoordinator.assignProspectingWorkers()
	}

	/* METHODS */
	private migrateWarehouseAssignments(): void {
		const assignments = Array.from(this.assignments.getAll())
		for (const assignment of assignments) {
			if (!assignment.buildingInstanceId) {
				continue
			}
			const building = this.managers.buildings.getBuildingInstance(assignment.buildingInstanceId)
			if (!building) {
				continue
			}
			if (building.stage === ConstructionStage.Constructing) {
				continue
			}
			const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
			if (!definition?.isWarehouse) {
				continue
			}
			this.unassignWorker({ settlerId: assignment.settlerId })
		}
	}

	private handleSettlerDied(data: { settlerId: string }): void {
		this.unassignWorker({ settlerId: data.settlerId })
	}

	private handleStepCompleted(settlerId: SettlerId, assignment: WorkAssignment, step: WorkStep): void {
		this.managers.event.emit(Receiver.All, WorkProviderEvents.SS.StepCompleted, { settlerId, step })
		this.managers.population.setSettlerLastStep(settlerId, step.type, undefined)
		this.managers.population.setSettlerState(settlerId, SettlerState.Assigned)
		this.clearConstructionWorker(settlerId, step)
		this.clearMovementFailureState(settlerId)

		if (step.type === WorkStepType.Transport && step.target.type === TransportTargetType.Construction) {
			this.releaseConstructionInFlight(step.target.buildingInstanceId, step.itemType, step.quantity)
		}
		if (step.type === WorkStepType.Produce && assignment.buildingInstanceId) {
			this.handleProductionCompleted(assignment.buildingInstanceId, step.recipe)
		}
		if (assignment.providerType === WorkProviderType.Logistics && !this.hasPendingLogisticsRequests()) {
			if (!this.isWarehouseLogisticsAssignment(assignment)) {
				this.unassignSettler(settlerId)
				return
			}
		}

		this.emitDispatchRequested(settlerId, WorkDispatchReason.WorkFlow)
	}

	private handleStepFailed(settlerId: SettlerId, step: WorkStep, reason: SettlerActionFailureReason): void {
		this.managers.event.emit(Receiver.All, WorkProviderEvents.SS.StepFailed, { settlerId, step, reason })
		this.clearConstructionWorker(settlerId, step)

		let retryDelayMs = 1000
		let waitReason: WorkWaitReason = isWorkWaitReason(reason) ? reason : WorkWaitReason.NoWork
		let shouldDispatch = true

		if (isMovementActionFailureReason(reason)) {
			const currentFailures = this.incrementMovementFailureCount(settlerId)
			retryDelayMs = MOVEMENT_RECOVERY_COOLDOWN_MS
			waitReason = reason === SettlerActionFailureReason.MovementFailed
				? WorkWaitReason.MovementFailed
				: WorkWaitReason.MovementCancelled

			if (currentFailures >= MOVEMENT_FAILURE_MAX_RETRIES) {
				if (step.type === WorkStepType.BuildRoad) {
					this.managers.roads.releaseJob(step.jobId)
				}
				this.unassignSettler(settlerId)
				this.clearMovementFailureState(settlerId)
				shouldDispatch = false
			}
		}

		if (shouldDispatch) {
			this.pendingIntents.push({
				type: BehaviourIntentType.SetWaitState,
				priority: BehaviourIntentPriority.Normal,
				settlerId,
				reason: isMovementActionFailureReason(reason)
					? SetWaitStateReason.RecoveringMovement
					: SetWaitStateReason.WaitingForDispatch,
				waitReason,
				state: SettlerState.WaitingForWork
			})
		}

		if (step.type === WorkStepType.Transport && step.target.type === TransportTargetType.Construction) {
			this.releaseConstructionInFlight(step.target.buildingInstanceId, step.itemType, step.quantity)
		}

		if (shouldDispatch) {
			this.pendingIntents.push({
				type: BehaviourIntentType.RequestDispatch,
				priority: BehaviourIntentPriority.Normal,
				settlerId,
				reason: RequestDispatchReason.Recovery,
				atMs: this.simulationTimeMs + retryDelayMs
			})
		}
	}

	private clearConstructionWorker(settlerId: SettlerId, step: WorkStep): void {
		if (step.type !== WorkStepType.Construct) {
			return
		}
		this.managers.buildings.setConstructionWorkerActive(step.buildingInstanceId, settlerId, false)
	}

	private isWarehouseLogisticsAssignment(assignment: WorkAssignment): boolean {
		if (assignment.providerType !== WorkProviderType.Logistics || !assignment.buildingInstanceId) {
			return false
		}
		const building = this.managers.buildings.getBuildingInstance(assignment.buildingInstanceId)
		if (!building) {
			return false
		}
		const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
		return Boolean(definition?.isWarehouse)
	}

	private incrementMovementFailureCount(settlerId: SettlerId): number {
		const next = (this.movementFailureCounts.get(settlerId) || 0) + 1
		this.movementFailureCounts.set(settlerId, next)
		return next
	}

	private clearMovementFailureState(settlerId: SettlerId): void {
		this.movementFailureCounts.delete(settlerId)
	}

	private applyPause(settlerId: string, reason: string): WorkPausedContext | null {
		if (this.pausedContexts.has(settlerId)) {
			return this.pausedContexts.get(settlerId) ?? null
		}

		const assignment = this.assignments.get(settlerId)
		let context: WorkPausedContext | null = null

		if (assignment) {
			assignment.status = WorkAssignmentStatus.Paused
			const provider = this.registry.get(assignment.providerId)
			provider?.pause(settlerId, reason)
			context = {
				assignmentId: assignment.assignmentId,
				providerId: assignment.providerId,
				providerType: assignment.providerType
			}
		}

		this.pausedContexts.set(settlerId, context)
		return context
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
		if (isWarehouseAssignment) {
			return WorkerRequestFailureReason.BuildingDoesNotNeedWorkers
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

		this.managers.event.emit(Receiver.All, WorkProviderEvents.SS.AssignmentCreated, { assignment })
		this.managers.event.emit(Receiver.Group, PopulationEvents.SC.WorkerAssigned, {
			assignment,
			settlerId: candidate.id,
			buildingInstanceId: building.id
		}, building.mapId)

		this.emitDispatchRequested(candidate.id, WorkDispatchReason.WorkerAssigned)
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
		this.managers.event.emit(Receiver.Group, BuildingsEvents.SC.WorkerQueueUpdated, {
			buildingInstanceId,
			queuedCount: this.getPendingWorkerCount(buildingInstanceId)
		}, building.mapId)
	}

	private unassignWorker(data: UnassignWorkerData): void {
		const assignment = this.assignments.get(data.settlerId)
		if (!assignment) {
			return
		}
		this.clearMovementFailureState(data.settlerId)

		const exitActions = this.buildExitActions(assignment, data.settlerId) ?? []
		const exitFallback = exitActions.length > 0 ? exitActions : null
		const finalizeExit = () => {
			this.managers.population.setSettlerState(data.settlerId, SettlerState.Idle)
		}
		const replaced = this.actionsManager.replaceQueueAfterCurrent(
			data.settlerId,
			exitActions,
			finalizeExit,
			() => finalizeExit()
		)

		if (!replaced) {
			this.actionsManager.abort(data.settlerId)
		}
		this.assignments.remove(data.settlerId)
		this.releaseAssignmentResources(assignment, data.settlerId)
		this.unassignFromProvider(assignment, data.settlerId)

		this.managers.population.setSettlerAssignment(data.settlerId, undefined, undefined, undefined)
		this.managers.population.setSettlerWaitReason(data.settlerId, undefined)
		if (!replaced) {
			this.enqueueExitOrIdle(data.settlerId, exitFallback)
		}

		this.managers.event.emit(Receiver.All, WorkProviderEvents.SS.AssignmentRemoved, {
			assignmentId: assignment.assignmentId,
			settlerId: data.settlerId
		})
		this.emitWorkerUnassigned(assignment, data.settlerId)
	}

	private releaseAssignmentResources(assignment: WorkAssignment, settlerId: string): void {
		if (!assignment.buildingInstanceId) {
			return
		}
		this.managers.buildings.setAssignedWorker(assignment.buildingInstanceId, settlerId, false)
	}

	private unassignFromProvider(assignment: WorkAssignment, settlerId: string): void {
		const provider = this.resolveProviderForAssignment(assignment)
		provider?.unassign(settlerId)
	}

	private resolveProviderForAssignment(assignment: WorkAssignment): WorkProvider | undefined {
		if (assignment.providerType === WorkProviderType.Logistics) {
			return this.logisticsProvider
		}
		if (assignment.providerType === WorkProviderType.Construction && assignment.buildingInstanceId) {
			return this.providers.getConstruction(assignment.buildingInstanceId) ?? undefined
		}
		if (assignment.providerType === WorkProviderType.Building && assignment.buildingInstanceId) {
			return this.providers.getBuilding(assignment.buildingInstanceId) ?? undefined
		}
		return this.registry.get(assignment.providerId)
	}

	private enqueueExitOrIdle(settlerId: string, exitActions: SettlerAction[] | null): void {
		if (!exitActions || exitActions.length === 0) {
			this.managers.population.setSettlerState(settlerId, SettlerState.Idle)
			return
		}
		const finalizeExit = () => {
			this.managers.population.setSettlerState(settlerId, SettlerState.Idle)
		}
		this.actionsManager.enqueue(settlerId, exitActions, finalizeExit, () => finalizeExit())
	}

	private buildExitActions(assignment: WorkAssignment, settlerId: string): SettlerAction[] | null {
		const provider = this.resolveProviderForAssignment(assignment)
		const step: WorkStep | null = provider?.requestUnassignStep?.(settlerId) ?? null
		if (!step) {
			return null
		}
		return this.buildActionsForStep(settlerId, assignment, step)
	}

	private emitWorkerUnassigned(assignment: WorkAssignment, settlerId: string): void {
		if (!assignment.buildingInstanceId) {
			return
		}
		const building = this.managers.buildings.getBuildingInstance(assignment.buildingInstanceId)
		if (!building) {
			return
		}
		this.managers.event.emit(Receiver.Group, PopulationEvents.SC.WorkerUnassigned, {
			settlerId,
			assignmentId: assignment.assignmentId,
			buildingInstanceId: assignment.buildingInstanceId
		}, building.mapId)
	}

	private getServerClient(mapId?: string): EventClient {
		return {
			id: 'server',
			currentGroup: mapId || 'GLOBAL',
			setGroup: () => {},
			emit: (to, event, data, groupName) => {
				this.managers.event.emit(to, event, data, groupName)
			}
		}
	}

	private emitDispatchRequested(settlerId: string, reason: WorkDispatchReason): void {
		this.pendingIntents.push({
			type: BehaviourIntentType.RequestDispatch,
			priority: this.mapDispatchPriority(reason),
			settlerId,
			reason: this.mapDispatchReason(reason)
		})
	}

	public consumePendingIntents(): BehaviourIntent[] {
		const intents = this.pendingIntents
		this.pendingIntents = []
		return intents
	}

	public getAssignment(settlerId: string): WorkAssignment | undefined {
		return this.assignments.get(settlerId)
	}

	public requestDispatchStep(settlerId: SettlerId): WorkDispatchStepResult {
		const assignment = this.assignments.get(settlerId)
		if (!assignment) {
			return { status: 'no_assignment' }
		}
		const provider = this.registry.get(assignment.providerId)
		if (!provider) {
			return {
				status: 'provider_missing',
				assignment
			}
		}
		return {
			status: 'step',
			assignment,
			step: provider.requestNextStep(settlerId)
		}
	}

	public getNowMs(): number {
		return this.simulationTimeMs
	}

	public buildActionsForStep(
		settlerId: SettlerId,
		assignment: WorkAssignment,
		step: WorkStep
	): SettlerAction[] {
		const handler = StepHandlers[step.type]
		if (!handler) {
			return []
		}
		return handler.build({
			settlerId,
			assignment,
			step,
			managers: this.managers,
			reservationSystem: this.managers.reservations,
			simulationTimeMs: this.simulationTimeMs
		}).actions
	}

	public isSettlerPaused(settlerId: string): boolean {
		return this.pausedContexts.has(settlerId)
	}

	public pauseAssignment(settlerId: string, reason = 'NEED'): WorkPausedContext | null {
		return this.applyPause(settlerId, reason)
	}

	public resumeAssignment(settlerId: string): void {
		this.pausedContexts.delete(settlerId)
		const assignment = this.assignments.get(settlerId)
		if (!assignment) {
			return
		}
		assignment.status = WorkAssignmentStatus.Assigned
		const provider = this.registry.get(assignment.providerId)
		provider?.resume(settlerId)
	}

	public unassignSettler(settlerId: string): void {
		this.unassignWorker({ settlerId })
	}

	public onStepIssued(settlerId: SettlerId, assignment: WorkAssignment, step: WorkStep): void {
		this.productionTracker.updateForStep(assignment, step)
		const payload: WorkStepIssuedEventData = { settlerId, step }
		this.managers.event.emit(Receiver.All, WorkProviderEvents.SS.StepIssued, payload)
	}

	public handleProductionCompleted(buildingInstanceId: string, recipe: ProductionRecipe): void {
		this.productionTracker.handleProductionCompleted(buildingInstanceId, recipe)
	}

	public releaseConstructionInFlight(buildingInstanceId: string, itemType: ItemType, quantity: number): void {
		this.logisticsProvider.releaseConstructionInFlight(buildingInstanceId, itemType, quantity)
	}

	public hasPendingLogisticsRequests(): boolean {
		return this.logisticsProvider.hasPendingRequests()
	}

	private findBestSettler(
		mapId: string,
		playerId: string,
		position: { x: number, y: number },
		requiredProfession?: ProfessionType | null,
		options: { allowFallbackToCarrier?: boolean } = {}
	) {
		const candidates = this.getAssignmentCandidates(mapId, playerId, {
			profession: requiredProfession,
			allowFallbackToCarrier: options.allowFallbackToCarrier
		})
		if (candidates.length === 0) {
			return null
		}

		return this.findClosestSettler(candidates, position)
	}

	public getAssignmentCandidates(
		mapId: string,
		playerId: string,
		options: { profession?: ProfessionType | null, allowFallbackToCarrier?: boolean } = {}
	): Settler[] {
		const base = this.managers.population.getAvailableSettlers(mapId, playerId)
			.filter(settler => !settler.stateContext.assignmentId)
			.filter(settler => !this.assignments.has(settler.id))

		if (!options.profession) {
			return base
		}

		const matching = base.filter(settler => settler.profession === options.profession)
		if (matching.length > 0) {
			return matching
		}

		if (options.allowFallbackToCarrier === false) {
			return []
		}
		return base.filter(settler => settler.profession === ProfessionType.Carrier)
	}

	private findClosestSettler(settlers: Settler[], position: { x: number, y: number }) {
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
		return {
			assignments: this.assignments.serializeAssignments(),
			assignmentsByBuilding: this.assignments.serializeAssignmentsByBuilding(),
			productionStateByBuilding: this.productionTracker.serialize(),
			lastConstructionAssignAt: this.constructionCoordinator.serializeLastAssignAt(),
			pausedContexts: Array.from(this.pausedContexts.entries()),
			logistics: this.logisticsProvider.serialize(),
			pendingWorkerRequests: this.pendingWorkerRequests.map(request => ({ ...request }))
		}
	}

	public requestImmediateDispatch(settlerId: string): void {
		this.emitDispatchRequested(settlerId, WorkDispatchReason.ImmediateRequest)
	}

	private mapDispatchReason(reason: WorkDispatchReason): RequestDispatchReason {
		switch (reason) {
			case WorkDispatchReason.WorkerAssigned:
				return RequestDispatchReason.ProviderAssigned
			case WorkDispatchReason.ImmediateRequest:
				return RequestDispatchReason.Immediate
			case WorkDispatchReason.ResumeAfterDeserialize:
				return RequestDispatchReason.ResumeAfterDeserialize
			case WorkDispatchReason.WorkFlow:
			default:
				return RequestDispatchReason.QueueCompleted
		}
	}

	private mapDispatchPriority(reason: WorkDispatchReason): BehaviourIntentPriority {
		switch (reason) {
			case WorkDispatchReason.ImmediateRequest:
				return BehaviourIntentPriority.High
			case WorkDispatchReason.WorkerAssigned:
				return BehaviourIntentPriority.Normal
			case WorkDispatchReason.ResumeAfterDeserialize:
				return BehaviourIntentPriority.Low
			case WorkDispatchReason.WorkFlow:
			default:
				return BehaviourIntentPriority.Normal
		}
	}

	deserialize(state: WorkProviderSnapshot): void {
		this.assignments.clear()
		this.movementFailureCounts.clear()
		this.productionTracker.deserialize(state.productionStateByBuilding)
		this.constructionCoordinator.deserializeLastAssignAt(state.lastConstructionAssignAt)
		this.pausedContexts = new Map(state.pausedContexts)
		this.simulationTimeMs = this.managers.simulation.getSimulationTimeMs()

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

			if (assignment.providerType === WorkProviderType.Prospecting) {
				const [_, mapId, playerId] = assignment.providerId.split(':')
				if (mapId && playerId) {
					this.providers.getProspecting(mapId, playerId).assign(assignment.settlerId)
				}
				continue
			}

			if (assignment.buildingInstanceId) {
				this.providers.getBuilding(assignment.buildingInstanceId)?.assign(assignment.settlerId)
			}
		}

		this.logisticsProvider.deserialize(state.logistics)
	}

	public resumeAfterDeserialize(): void {
		for (const assignment of this.assignments.getAll()) {
			if (this.actionsManager.isBusy(assignment.settlerId)) {
				continue
			}
			if (this.pausedContexts.has(assignment.settlerId)) {
				continue
			}
			this.emitDispatchRequested(assignment.settlerId, WorkDispatchReason.ResumeAfterDeserialize)
		}
	}

	reset(): void {
		this.assignments.clear()
		this.providers.clear()
		this.productionTracker.reset()
		this.constructionCoordinator.reset()
		this.pausedContexts.clear()
		this.pendingWorkerRequests = []
		this.pendingIntents = []
		this.movementFailureCounts.clear()
		this.simulationTimeMs = 0
		this.logisticsProvider.reset()
	}
}

export { WorkProviderEvents }
export * from './types'
export * from './deps'
export * from './runtime'
