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
import type { ProductionRecipe, SetProductionPausedData } from '../../Buildings/types'
import { ConstructionStage, ProductionStatus } from '../../Buildings/types'
import { getBuildingWorkKinds } from '../../Buildings/work'
import { ProviderRegistry } from './ProviderRegistry'
import { ActionSystem, type ActionQueueContextResolver } from './ActionSystem'
import { WorkProviderEvents } from './events'
import type { WorkAssignment, WorkStep, WorkAction, LogisticsRequest } from './types'
import { TransportTargetType, WorkProviderType, WorkStepType, WorkWaitReason, WorkAssignmentStatus } from './types'
import { StepHandlers } from './stepHandlers'
import { BuildingProvider } from './providers/BuildingProvider'
import { LogisticsProvider } from './providers/LogisticsProvider'
import { ConstructionProvider } from './providers/ConstructionProvider'
import { RoadProvider } from './providers/RoadProvider'
import { WorkPolicyPhase, WorkPolicyResultType } from './policies/constants'
import type { WorkPolicy, WorkPolicyContext, WorkPolicyResult } from './policies/types'
import { CriticalNeedsPolicy } from './policies/CriticalNeedsPolicy'
import { HomeRelocationPolicy } from './policies/HomeRelocationPolicy'
import type { ActionQueueContext, WorkProviderSnapshot } from '../../state/types'
import { ActionQueueContextKind } from '../../state/types'

const MOVEMENT_RECOVERY_COOLDOWN_MS = 8000
const MOVEMENT_FAILURE_MAX_RETRIES = 3

export class WorkProviderManager extends BaseManager<WorkProviderDeps> {
	private registry = new ProviderRegistry()
	private assignments = new Map<string, WorkAssignment>() // settlerId -> assignment
	private assignmentsByBuilding = new Map<string, Set<string>>()
	private buildingProviders = new Map<string, BuildingProvider>()
	private constructionProviders = new Map<string, ConstructionProvider>()
	private roadProviders = new Map<string, RoadProvider>()
	private logisticsProvider: LogisticsProvider
	private actionSystem: ActionSystem
	private policies: WorkPolicy[] = []
	private simulationTimeMs = 0
	private productionStateByBuilding = new Map<string, { status: ProductionStatus, progress: number }>()
	private constructionAssignCooldownMs = 2000
	private lastConstructionAssignAt = new Map<string, number>()
	private pauseRequests = new Map<string, { reason: string }>()
	private pausedContexts = new Map<string, PausedContext | null>()
	private movementRecoveryUntil = new Map<string, number>()
	private movementRecoveryReason = new Map<string, WorkWaitReason>()
	private movementFailureCounts = new Map<string, number>()
	private pendingDispatchAtMs = new Map<string, number>()

	constructor(
		managers: WorkProviderDeps,
		private event: EventManager,
		private logger: Logger
	) {
		super(managers)


		this.actionSystem = new ActionSystem(
			this.managers,
			event,
			this.logger
		)
		this.actionSystem.registerContextResolver(ActionQueueContextKind.Work, (settlerId, context) => {
			if (context.kind !== ActionQueueContextKind.Work) {
				return {}
			}
			return this.buildWorkQueueCallbacks(settlerId, context.step)
		})

		this.logisticsProvider = new LogisticsProvider(
			this.managers,
			this.logger,
			() => this.simulationTimeMs
		)
		this.registry.register(this.logisticsProvider)

		this.policies = [
			new CriticalNeedsPolicy(),
			new HomeRelocationPolicy()
		]

		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		this.event.on<RequestWorkerData>(PopulationEvents.CS.RequestWorker, (data, client) => {
			this.requestWorker(data, client)
		})

		this.event.on<UnassignWorkerData>(PopulationEvents.CS.UnassignWorker, (data, client) => {
			this.unassignWorker(data)
		})

		this.event.on<SetProductionPausedData>(BuildingsEvents.CS.SetProductionPaused, (data, client) => {
			this.setProductionPaused(data)
		})

		this.event.on(BuildingsEvents.SS.ConstructionCompleted, (data: { buildingInstanceId: string }) => {
			this.unassignAllForBuilding(data.buildingInstanceId)
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
	}

	private handleSimulationTick(data: SimulationTickData): void {
		this.simulationTimeMs = data.nowMs
		this.actionSystem.setTime(this.simulationTimeMs)

		this.logisticsProvider.refreshConstructionRequests()
		this.refreshConsumptionRequests()
		this.emitLogisticsRequests()
		this.assignConstructionWorkers()
		this.assignRoadWorkers()

		// Assign idle carriers to logistics if there is pending demand
		this.assignIdleCarriersToLogistics()

		this.processPendingDispatches()
	}

	private processPendingDispatches(): void {
		if (this.pendingDispatchAtMs.size === 0) {
			return
		}

		for (const [settlerId, dispatchAt] of this.pendingDispatchAtMs.entries()) {
			if (this.simulationTimeMs < dispatchAt) {
				continue
			}
			if (this.actionSystem.isBusy(settlerId)) {
				continue
			}
			this.pendingDispatchAtMs.delete(settlerId)
			this.dispatchNextStep(settlerId)
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
			this.dispatchNextStep(data.settlerId)
		}
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

	private refreshConsumptionRequests(): void {
		const buildings = this.managers.buildings.getAllBuildings()
		for (const building of buildings) {
			if (building.stage !== ConstructionStage.Completed) {
				continue
			}

			const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
			if (!definition?.consumes || definition.consumes.length === 0) {
				continue
			}

			for (const request of definition.consumes) {
				const capacity = this.managers.storage.getStorageCapacity(building.id, request.itemType)
				if (capacity <= 0) {
					continue
				}
				const desired = Math.min(request.desiredQuantity, capacity)
				const current = this.managers.storage.getCurrentQuantity(building.id, request.itemType)
				const needed = desired - current
				this.logisticsProvider.requestInput(building.id, request.itemType, needed, 40)
			}
		}
	}

	private emitLogisticsRequests(): void {
		const requests = this.logisticsProvider.getRequests()
		const byMap = new Map<string, LogisticsRequest[]>()

		for (const request of requests) {
			const building = this.managers.buildings.getBuildingInstance(request.buildingInstanceId)
			if (!building) {
				continue
			}
			if (!byMap.has(building.mapId)) {
				byMap.set(building.mapId, [])
			}
			byMap.get(building.mapId)!.push(request)
		}

		for (const [mapId, mapRequests] of byMap.entries()) {
			this.event.emit(Receiver.Group, WorkProviderEvents.SC.LogisticsUpdated, { requests: mapRequests }, mapId)
		}
		// If there are no requests, still clear UI for current maps (best effort)
		if (requests.length === 0) {
			this.event.emit(Receiver.All, WorkProviderEvents.SC.LogisticsUpdated, { requests: [] })
		}
	}

	private getBuildingProvider(buildingInstanceId: string): BuildingProvider | null {
		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return null
		}

		let provider = this.buildingProviders.get(buildingInstanceId)
		if (!provider) {
			provider = new BuildingProvider(
				buildingInstanceId,
				this.managers,
				this.logisticsProvider,
				this.logger
			)
			this.buildingProviders.set(buildingInstanceId, provider)
			this.registry.register(provider)
		}

		return provider
	}

	private getConstructionProvider(buildingInstanceId: string): ConstructionProvider | null {
		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return null
		}

		let provider = this.constructionProviders.get(buildingInstanceId)
		if (!provider) {
			provider = new ConstructionProvider(
				buildingInstanceId,
				this.managers,
				this.logger
			)
			this.constructionProviders.set(buildingInstanceId, provider)
			this.registry.register(provider)
		}

		return provider
	}

	private getRoadProvider(mapId: string, playerId: string): RoadProvider {
		const key = `${mapId}:${playerId}`
		let provider = this.roadProviders.get(key)
		if (!provider) {
			provider = new RoadProvider(mapId, playerId, this.managers, this.logger)
			this.roadProviders.set(key, provider)
			this.registry.register(provider)
		}
		return provider
	}

	private requestWorker(data: RequestWorkerData, client: any): void {
		const building = this.managers.buildings.getBuildingInstance(data.buildingInstanceId)
		if (!building) {
			return
		}

		const buildingDef = this.managers.buildings.getBuildingDefinition(building.buildingId)
		if (!buildingDef) {
			return
		}

		const workerSlots = buildingDef.workerSlots || 0
		if (building.stage !== ConstructionStage.Constructing && workerSlots > 0) {
			const assigned = this.assignmentsByBuilding.get(building.id)?.size || 0
			if (assigned >= workerSlots) {
				client.emit(Receiver.Sender, PopulationEvents.SC.WorkerRequestFailed, {
					buildingInstanceId: building.id,
					reason: WorkerRequestFailureReason.BuildingDoesNotNeedWorkers
				})
				return
			}
		}

		let requiredProfession = buildingDef.requiredProfession ?? undefined
		const isConstruction = building.stage === ConstructionStage.Constructing
		if (isConstruction) {
			requiredProfession = ProfessionType.Builder
		}
		const candidate = this.findBestSettler(building.mapId, building.playerId, building.position, requiredProfession, {
			allowFallbackToCarrier: !isConstruction
		})
		if (!candidate) {
			const reason = isConstruction
				? WorkerRequestFailureReason.NoBuilderAvailable
				: requiredProfession
					? WorkerRequestFailureReason.NoSuitableProfession
					: WorkerRequestFailureReason.NoAvailableWorker
			client.emit(Receiver.Sender, PopulationEvents.SC.WorkerRequestFailed, {
				buildingInstanceId: building.id,
				reason
			})
			return
		}

			const assignment: WorkAssignment = {
				assignmentId: uuidv4(),
				settlerId: candidate.id,
				providerId: isConstruction ? `construction:${building.id}` : building.id,
				providerType: isConstruction ? WorkProviderType.Construction : WorkProviderType.Building,
				buildingInstanceId: building.id,
				requiredProfession: requiredProfession,
				assignedAt: this.simulationTimeMs,
				status: WorkAssignmentStatus.Assigned
			}

		this.assignments.set(candidate.id, assignment)
		if (!this.assignmentsByBuilding.has(building.id)) {
			this.assignmentsByBuilding.set(building.id, new Set())
		}
		this.assignmentsByBuilding.get(building.id)!.add(candidate.id)
		this.managers.buildings.setAssignedWorker(building.id, candidate.id, true)

		const provider = isConstruction
			? this.getConstructionProvider(building.id)
			: this.getBuildingProvider(building.id)
		provider?.assign(candidate.id)

		this.managers.population.setSettlerAssignment(candidate.id, assignment.assignmentId, assignment.providerId, building.id)
		this.managers.population.setSettlerState(candidate.id, SettlerState.Assigned)

		this.event.emit(Receiver.All, WorkProviderEvents.SS.AssignmentCreated, { assignment })
		this.event.emit(Receiver.Group, PopulationEvents.SC.WorkerAssigned, {
			assignment,
			settlerId: candidate.id,
			buildingInstanceId: building.id
		}, building.mapId)

		this.dispatchNextStep(candidate.id)
	}

	private setProductionPaused(data: SetProductionPausedData): void {
		const building = this.managers.buildings.getBuildingInstance(data.buildingInstanceId)
		if (!building) {
			return
		}

		const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
		if (!definition || getBuildingWorkKinds(definition).length === 0) {
			return
		}

		this.managers.buildings.setProductionPaused(building.id, data.paused)

		if (data.paused) {
			this.emitProductionStatus(building.id, ProductionStatus.Paused)
			return
		}

		const assigned = this.assignmentsByBuilding.get(building.id)
		if (!assigned || assigned.size === 0) {
			this.emitProductionStatus(building.id, ProductionStatus.NoWorker)
			return
		}

		this.emitProductionStatus(building.id, ProductionStatus.Idle)
		for (const settlerId of assigned) {
			this.dispatchNextStep(settlerId)
		}
	}

	private unassignWorker(data: UnassignWorkerData): void {
		const assignment = this.assignments.get(data.settlerId)
		if (!assignment) {
			return
		}

		this.actionSystem.abort(data.settlerId)
		this.movementFailureCounts.delete(data.settlerId)
		this.movementRecoveryUntil.delete(data.settlerId)
		this.movementRecoveryReason.delete(data.settlerId)
		this.pendingDispatchAtMs.delete(data.settlerId)

		this.assignments.delete(data.settlerId)
		if (assignment.buildingInstanceId) {
			this.assignmentsByBuilding.get(assignment.buildingInstanceId)?.delete(data.settlerId)
			this.managers.buildings.setAssignedWorker(assignment.buildingInstanceId, data.settlerId, false)
			const provider = assignment.providerType === WorkProviderType.Construction
				? this.getConstructionProvider(assignment.buildingInstanceId)
				: this.getBuildingProvider(assignment.buildingInstanceId)
			provider?.unassign(data.settlerId)
		} else {
			const provider = this.registry.get(assignment.providerId)
			provider?.unassign(data.settlerId)
		}

		this.managers.population.setSettlerAssignment(data.settlerId, undefined, undefined, undefined)
		this.managers.population.setSettlerState(data.settlerId, SettlerState.Idle)
		this.managers.population.setSettlerWaitReason(data.settlerId, undefined)
		this.movementFailureCounts.delete(data.settlerId)
		this.movementRecoveryUntil.delete(data.settlerId)
		this.movementRecoveryReason.delete(data.settlerId)
		this.pendingDispatchAtMs.delete(data.settlerId)

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

	private unassignAllForBuilding(buildingInstanceId: string): void {
		const settlerIds = this.assignmentsByBuilding.get(buildingInstanceId)
		if (!settlerIds || settlerIds.size === 0) {
			return
		}

		for (const settlerId of Array.from(settlerIds)) {
			this.unassignWorker({ settlerId })
		}
		this.assignConstructionWorkers(true)
	}

	private assignIdleCarriersToLogistics(): void {
		if (!this.logisticsProvider.hasPendingRequests()) {
			return
		}

		const carriers = this.managers.population.getAvailableCarriers(this.logisticsProvider.getMapName(), this.logisticsProvider.getPlayerId())
		for (const carrier of carriers) {
			if (this.assignments.has(carrier.id)) {
				continue
			}
			const assignment: WorkAssignment = {
				assignmentId: uuidv4(),
				settlerId: carrier.id,
				providerId: this.logisticsProvider.id,
				providerType: WorkProviderType.Logistics,
				assignedAt: this.simulationTimeMs,
				status: WorkAssignmentStatus.Assigned
			}
			this.assignments.set(carrier.id, assignment)
			this.logisticsProvider.assign(carrier.id)
			this.managers.population.setSettlerAssignment(carrier.id, assignment.assignmentId, assignment.providerId, undefined)
			this.managers.population.setSettlerState(carrier.id, SettlerState.Assigned)
			this.dispatchNextStep(carrier.id)
		}
	}

	private assignRoadWorkers(): void {
		const groups = this.managers.roads.getPendingJobGroups()
		for (const group of groups) {
			const provider = this.getRoadProvider(group.mapId, group.playerId)
			const available = this.managers.population.getAvailableSettlers(group.mapId, group.playerId)
				.filter(settler => settler.profession === ProfessionType.Builder)
				.filter(settler => !this.assignments.has(settler.id))

			let assigned = 0
			for (const settler of available) {
				if (assigned >= group.count) {
					break
				}
				const assignment: WorkAssignment = {
					assignmentId: uuidv4(),
					settlerId: settler.id,
					providerId: provider.id,
					providerType: WorkProviderType.Road,
					assignedAt: this.simulationTimeMs,
					status: WorkAssignmentStatus.Assigned
				}
				this.assignments.set(settler.id, assignment)
				provider.assign(settler.id)
				this.managers.population.setSettlerAssignment(settler.id, assignment.assignmentId, assignment.providerId, undefined)
				this.managers.population.setSettlerState(settler.id, SettlerState.Assigned)
				this.dispatchNextStep(settler.id)
				assigned += 1
			}
		}
	}

	private assignConstructionWorkers(force = false): void {
		const buildings = this.managers.buildings.getAllBuildings()
		for (const building of buildings) {
			if (building.stage !== ConstructionStage.Constructing) {
				continue
			}
			const now = this.simulationTimeMs
			const lastAttempt = this.lastConstructionAssignAt.get(building.id) || 0
			if (!force && now - lastAttempt < this.constructionAssignCooldownMs) {
				continue
			}
			const constructionAssignments = Array.from(this.assignments.values()).filter(
				assignment => assignment.buildingInstanceId === building.id && assignment.providerType === WorkProviderType.Construction
			)
			const hasBuilderAssigned = constructionAssignments.some(assignment => {
				const settler = this.managers.population.getSettler(assignment.settlerId)
				return settler?.profession === ProfessionType.Builder
			})
			if (hasBuilderAssigned) {
				continue
			}
			for (const assignment of constructionAssignments) {
				this.unassignWorker({ settlerId: assignment.settlerId })
			}
			this.lastConstructionAssignAt.set(building.id, now)
			this.requestWorker({ buildingInstanceId: building.id }, this.getServerClient(building.mapId))
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

	private dispatchNextStep(settlerId: string): void {
		if (this.actionSystem.isBusy(settlerId)) {
			return
		}

		if (this.pauseRequests.has(settlerId) || this.pausedContexts.has(settlerId)) {
			if (!this.pausedContexts.has(settlerId)) {
				this.applyPause(settlerId)
			}
			return
		}

		const assignment = this.assignments.get(settlerId)
		if (!assignment) {
			this.managers.population.setSettlerWaitReason(settlerId, WorkWaitReason.NoWork)
			this.managers.population.setSettlerLastStep(settlerId, undefined, WorkWaitReason.NoWork)
			return
		}

		const recoveryUntil = this.movementRecoveryUntil.get(settlerId)
		if (recoveryUntil) {
			if (this.simulationTimeMs < recoveryUntil) {
				const reason = this.movementRecoveryReason.get(settlerId) ?? WorkWaitReason.MovementFailed
				this.managers.population.setSettlerWaitReason(settlerId, reason)
				this.managers.population.setSettlerLastStep(settlerId, undefined, reason)
				this.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
				return
			}
			this.movementRecoveryUntil.delete(settlerId)
			this.movementRecoveryReason.delete(settlerId)
		}

		const policyContext: WorkPolicyContext = {
			settlerId,
			assignment,
			managers: this.managers,
			simulationTimeMs: this.simulationTimeMs
		}

		const prePolicyResult = this.runPolicies(WorkPolicyPhase.BeforeStep, policyContext)
		if (this.applyPolicyResult(settlerId, prePolicyResult)) {
			return
		}

		const provider = this.registry.get(assignment.providerId)
		if (!provider) {
			this.managers.population.setSettlerWaitReason(settlerId, WorkWaitReason.ProviderMissing)
			this.managers.population.setSettlerLastStep(settlerId, undefined, WorkWaitReason.ProviderMissing)
			return
		}

		const step = provider.requestNextStep(settlerId)
		if (!step) {
			const noStepPolicyResult = this.runPolicies(WorkPolicyPhase.NoStep, policyContext)
			if (this.applyPolicyResult(settlerId, noStepPolicyResult)) {
				return
			}
			this.managers.population.setSettlerWaitReason(settlerId, WorkWaitReason.NoWork)
			this.managers.population.setSettlerLastStep(settlerId, undefined, WorkWaitReason.NoWork)
			this.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
			return
		}

		if (step.type === WorkStepType.Wait) {
			const waitPolicyResult = this.runPolicies(WorkPolicyPhase.WaitStep, policyContext, step)
			if (this.applyPolicyResult(settlerId, waitPolicyResult)) {
				return
			}
			this.managers.population.setSettlerWaitReason(settlerId, step.reason)
			this.managers.population.setSettlerLastStep(settlerId, step.type, step.reason)
			if (assignment.providerType === WorkProviderType.Logistics &&
				(step.reason === WorkWaitReason.NoRequests || step.reason === WorkWaitReason.NoViableRequest)) {
				this.unassignWorker({ settlerId })
				return
			}
			if (assignment.providerType === WorkProviderType.Road &&
				(step.reason === WorkWaitReason.NoWork || step.reason === WorkWaitReason.WrongProfession)) {
				this.unassignWorker({ settlerId })
				return
			}
			if (assignment.providerType === WorkProviderType.Construction && step.reason === WorkWaitReason.WrongProfession) {
				this.unassignWorker({ settlerId })
				return
			}
		} else {
			this.managers.population.setSettlerWaitReason(settlerId, undefined)
			this.managers.population.setSettlerLastStep(settlerId, step.type, undefined)
		}

		this.updateProductionStateForStep(assignment, step)

		this.event.emit(Receiver.All, WorkProviderEvents.SS.StepIssued, { settlerId, step })
		const { actions, releaseReservations } = this.buildActionsForStep(settlerId, assignment, step)

		if (!actions || actions.length === 0) {
			if (step.type === WorkStepType.Wait) {
				this.managers.population.setSettlerWaitReason(settlerId, step.reason)
			} else {
				this.managers.population.setSettlerWaitReason(settlerId, WorkWaitReason.NoWork)
			}
			this.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
			releaseReservations?.()
			return
		}

		const callbacks = this.buildWorkQueueCallbacks(settlerId, step, releaseReservations)
		const context: ActionQueueContext = {
			kind: ActionQueueContextKind.Work,
			step,
			reservationOwnerId: assignment.assignmentId
		}
		this.actionSystem.enqueue(settlerId, actions, callbacks.onComplete, callbacks.onFail, context)
	}

	private buildWorkQueueCallbacks(
		settlerId: string,
		step?: WorkStep,
		releaseReservations?: () => void
	): { onComplete: () => void, onFail: (reason: string) => void } {
		return {
			onComplete: () => {
				if (!step) {
					releaseReservations?.()
					this.dispatchNextStep(settlerId)
					return
				}
				const assignment = this.assignments.get(settlerId)
				if (!assignment) {
					releaseReservations?.()
					return
				}
				this.handleStepCompleted(settlerId, assignment, step, releaseReservations)
			},
			onFail: (reason: string) => {
				if (!step) {
					releaseReservations?.()
					this.dispatchNextStep(settlerId)
					return
				}
				const assignment = this.assignments.get(settlerId)
				if (!assignment) {
					releaseReservations?.()
					return
				}
				this.handleStepFailed(settlerId, assignment, step, reason, releaseReservations)
			}
		}
	}

	private handleStepCompleted(
		settlerId: string,
		assignment: WorkAssignment,
		step: WorkStep,
		releaseReservations?: () => void
	): void {
		releaseReservations?.()
		this.event.emit(Receiver.All, WorkProviderEvents.SS.StepCompleted, { settlerId, step })
		this.managers.population.setSettlerLastStep(settlerId, step.type, undefined)
		this.managers.population.setSettlerState(settlerId, SettlerState.Idle)
		this.movementFailureCounts.delete(settlerId)
		if (step.type === WorkStepType.Transport && step.target.type === TransportTargetType.Construction) {
			this.logisticsProvider.releaseConstructionInFlight(step.target.buildingInstanceId, step.itemType, step.quantity)
		}
		if (step.type === WorkStepType.Produce && assignment.buildingInstanceId) {
			this.emitProductionCompleted(assignment.buildingInstanceId, step.recipe)
		}
		if (assignment.providerType === WorkProviderType.Logistics && !this.logisticsProvider.hasPendingRequests()) {
			this.unassignWorker({ settlerId })
			return
		}
		this.dispatchNextStep(settlerId)
	}

	private handleStepFailed(
		settlerId: string,
		assignment: WorkAssignment,
		step: WorkStep,
		reason: string,
		releaseReservations?: () => void
	): void {
		releaseReservations?.()
		this.event.emit(Receiver.All, WorkProviderEvents.SS.StepFailed, { settlerId, step, reason })
		let retryDelayMs = 1000
		const isWaitReason = (Object.values(WorkWaitReason) as string[]).includes(reason)
		let waitReason: WorkWaitReason = isWaitReason ? (reason as WorkWaitReason) : WorkWaitReason.NoWork
		let shouldDispatch = true
		if (reason === 'movement_failed' || reason === 'movement_cancelled') {
			const currentFailures = (this.movementFailureCounts.get(settlerId) || 0) + 1
			this.movementFailureCounts.set(settlerId, currentFailures)
			retryDelayMs = MOVEMENT_RECOVERY_COOLDOWN_MS
			waitReason = reason === 'movement_failed'
				? WorkWaitReason.MovementFailed
				: WorkWaitReason.MovementCancelled
			this.movementRecoveryUntil.set(settlerId, this.simulationTimeMs + retryDelayMs)
			this.movementRecoveryReason.set(settlerId, waitReason)
			if (currentFailures >= MOVEMENT_FAILURE_MAX_RETRIES) {
				if (step.type === WorkStepType.BuildRoad) {
					this.managers.roads.releaseJob(step.jobId)
				}
				this.unassignWorker({ settlerId })
				this.movementFailureCounts.delete(settlerId)
				this.movementRecoveryUntil.delete(settlerId)
				this.movementRecoveryReason.delete(settlerId)
				shouldDispatch = false
			}
		}
		if (shouldDispatch) {
			this.managers.population.setSettlerWaitReason(settlerId, waitReason)
			this.managers.population.setSettlerLastStep(settlerId, step.type, waitReason)
			this.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
		}
		if (step.type === WorkStepType.Transport && step.target.type === TransportTargetType.Construction) {
			this.logisticsProvider.releaseConstructionInFlight(step.target.buildingInstanceId, step.itemType, step.quantity)
		}
		if (shouldDispatch) {
			this.pendingDispatchAtMs.set(settlerId, this.simulationTimeMs + retryDelayMs)
		}
	}

	private runPolicies(phase: WorkPolicyPhase, ctx: WorkPolicyContext, step?: WorkStep): WorkPolicyResult | null {
		for (const policy of this.policies) {
			let result: WorkPolicyResult | null = null
			if (phase === WorkPolicyPhase.BeforeStep && policy.onBeforeStep) {
				result = policy.onBeforeStep(ctx)
			} else if (phase === WorkPolicyPhase.NoStep && policy.onNoStep) {
				result = policy.onNoStep(ctx)
			} else if (phase === WorkPolicyPhase.WaitStep && policy.onWaitStep && step) {
				result = policy.onWaitStep(ctx, step)
			}
			if (result) {
				return result
			}
		}
		return null
	}

	private applyPolicyResult(settlerId: string, result: WorkPolicyResult | null): boolean {
		if (!result) {
			return false
		}

		if (result.type === WorkPolicyResultType.Block) {
			this.managers.population.setSettlerWaitReason(settlerId, result.reason)
			this.managers.population.setSettlerLastStep(settlerId, undefined, result.reason)
			this.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
			return true
		}

		if (result.type === WorkPolicyResultType.Enqueue) {
			if (this.actionSystem.isBusy(settlerId)) {
				return true
			}
			this.managers.population.setSettlerWaitReason(settlerId, undefined)
			const reservationOwnerId = this.assignments.get(settlerId)?.assignmentId
			this.actionSystem.enqueue(settlerId, result.actions, () => {
				result.onComplete?.()
				this.dispatchNextStep(settlerId)
			}, (reason) => {
				result.onFail?.(reason)
				this.dispatchNextStep(settlerId)
			}, { kind: ActionQueueContextKind.Work, reservationOwnerId })
			return true
		}

		return false
	}

	private buildActionsForStep(settlerId: string, assignment: WorkAssignment, step: WorkStep): { actions: WorkAction[], releaseReservations?: () => void } {
		const handler = StepHandlers[step.type]
		if (!handler) {
			return { actions: [] }
		}
		return handler.build({
			settlerId,
			assignment,
			step,
			managers: this.managers,
			reservationSystem: this.managers.reservations,
			simulationTimeMs: this.simulationTimeMs
		})
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

	private updateProductionStateForStep(assignment: WorkAssignment, step: WorkStep): void {
		if (!assignment.buildingInstanceId) {
			return
		}
		const building = this.managers.buildings.getBuildingInstance(assignment.buildingInstanceId)
		if (!building) {
			return
		}
		const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
		if (!definition?.productionRecipe) {
			return
		}

		if (step.type === WorkStepType.Produce) {
			this.emitProductionStarted(building.id, step.recipe)
			return
		}

		if (step.type === WorkStepType.AcquireTool) {
			this.emitProductionStatus(building.id, ProductionStatus.NoWorker)
			return
		}

		if (step.type === WorkStepType.Wait && step.reason === WorkWaitReason.Paused) {
			this.emitProductionStatus(building.id, ProductionStatus.Paused)
			return
		}

		if (step.type === WorkStepType.Wait && step.reason === WorkWaitReason.MissingInputs) {
			this.emitProductionStatus(building.id, ProductionStatus.NoInput)
			return
		}

		if (step.type === WorkStepType.Wait) {
			this.emitProductionStatus(building.id, ProductionStatus.Idle)
		}
	}

	private emitProductionStarted(buildingInstanceId: string, recipe: ProductionRecipe): void {
		this.emitProductionStatus(buildingInstanceId, ProductionStatus.InProduction, 0)
		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return
		}
		this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionStarted, {
			buildingInstanceId,
			recipe
		}, building.mapId)
		this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionProgress, {
			buildingInstanceId,
			progress: 0
		}, building.mapId)
	}

	private emitProductionCompleted(buildingInstanceId: string, recipe: ProductionRecipe): void {
		this.emitProductionStatus(buildingInstanceId, ProductionStatus.Idle, 100)
		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return
		}
		this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionCompleted, {
			buildingInstanceId,
			recipe
		}, building.mapId)
		this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionProgress, {
			buildingInstanceId,
			progress: 100
		}, building.mapId)
	}

	private emitProductionStatus(buildingInstanceId: string, status: ProductionStatus, progress?: number): void {
		const current = this.productionStateByBuilding.get(buildingInstanceId)
		const nextProgress = typeof progress === 'number' ? progress : (current?.progress ?? 0)
		if (current && current.status === status && current.progress === nextProgress) {
			return
		}
		this.productionStateByBuilding.set(buildingInstanceId, { status, progress: nextProgress })
		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return
		}
		this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionStatusChanged, {
			buildingInstanceId,
			status
		}, building.mapId)
		if (typeof progress === 'number') {
			this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionProgress, {
				buildingInstanceId,
				progress
			}, building.mapId)
		}
	}

	// External hooks for LogisticsProvider
	public enqueueLogisticsRequest(request: LogisticsRequest): void {
		this.logisticsProvider.enqueue(request)
	}

	serialize(): WorkProviderSnapshot {
		return {
			assignments: Array.from(this.assignments.values()).map(assignment => ({ ...assignment })),
			assignmentsByBuilding: Array.from(this.assignmentsByBuilding.entries()).map(([buildingId, settlerIds]) => ([
				buildingId,
				Array.from(settlerIds.values())
			])),
			productionStateByBuilding: Array.from(this.productionStateByBuilding.entries()),
			lastConstructionAssignAt: Array.from(this.lastConstructionAssignAt.entries()),
			pauseRequests: Array.from(this.pauseRequests.entries()).map(([settlerId, payload]) => ([
				settlerId,
				{ ...payload }
			])),
			pausedContexts: Array.from(this.pausedContexts.entries()),
			movementRecoveryUntil: Array.from(this.movementRecoveryUntil.entries()),
			movementRecoveryReason: Array.from(this.movementRecoveryReason.entries()),
			movementFailureCounts: Array.from(this.movementFailureCounts.entries()),
			pendingDispatchAtMs: Array.from(this.pendingDispatchAtMs.entries()),
			actionSystem: this.actionSystem.serialize(),
			logistics: this.logisticsProvider.serialize()
		}
	}

	deserialize(state: WorkProviderSnapshot): void {
		this.assignments.clear()
		this.assignmentsByBuilding.clear()
		this.productionStateByBuilding = new Map(state.productionStateByBuilding)
		this.lastConstructionAssignAt = new Map(state.lastConstructionAssignAt)
		this.pauseRequests = new Map(state.pauseRequests)
		this.pausedContexts = new Map(state.pausedContexts)
		this.movementRecoveryUntil = new Map(state.movementRecoveryUntil)
		this.movementRecoveryReason = new Map(state.movementRecoveryReason)
		this.movementFailureCounts = new Map(state.movementFailureCounts)
		this.pendingDispatchAtMs = new Map(state.pendingDispatchAtMs)
		this.simulationTimeMs = this.managers.simulation.getSimulationTimeMs()
		this.actionSystem.setTime(this.simulationTimeMs)
		this.actionSystem.deserialize(state.actionSystem)

		for (const assignment of state.assignments) {
			this.assignments.set(assignment.settlerId, { ...assignment })
			if (assignment.buildingInstanceId) {
				let buildingAssignments = this.assignmentsByBuilding.get(assignment.buildingInstanceId)
				if (!buildingAssignments) {
					buildingAssignments = new Set()
					this.assignmentsByBuilding.set(assignment.buildingInstanceId, buildingAssignments)
				}
				buildingAssignments.add(assignment.settlerId)
			}

			if (assignment.providerType === WorkProviderType.Logistics) {
				this.logisticsProvider.assign(assignment.settlerId)
				continue
			}

			if (assignment.providerType === WorkProviderType.Construction && assignment.buildingInstanceId) {
				this.getConstructionProvider(assignment.buildingInstanceId)?.assign(assignment.settlerId)
				continue
			}

			if (assignment.providerType === WorkProviderType.Road) {
				const [_, mapId, playerId] = assignment.providerId.split(':')
				if (mapId && playerId) {
					this.getRoadProvider(mapId, playerId).assign(assignment.settlerId)
				}
				continue
			}

			if (assignment.buildingInstanceId) {
				this.getBuildingProvider(assignment.buildingInstanceId)?.assign(assignment.settlerId)
			}
		}

		for (const [buildingId, settlerIds] of state.assignmentsByBuilding) {
			this.assignmentsByBuilding.set(buildingId, new Set(settlerIds))
		}

		this.logisticsProvider.deserialize(state.logistics)

		for (const assignment of this.assignments.values()) {
			if (this.actionSystem.isBusy(assignment.settlerId)) {
				continue
			}
			if (this.pauseRequests.has(assignment.settlerId) || this.pausedContexts.has(assignment.settlerId)) {
				continue
			}
			this.dispatchNextStep(assignment.settlerId)
		}
	}

	reset(): void {
		this.assignments.clear()
		this.assignmentsByBuilding.clear()
		this.buildingProviders.clear()
		this.constructionProviders.clear()
		this.roadProviders.clear()
		this.productionStateByBuilding.clear()
		this.lastConstructionAssignAt.clear()
		this.pauseRequests.clear()
		this.pausedContexts.clear()
		this.movementRecoveryUntil.clear()
		this.movementRecoveryReason.clear()
		this.movementFailureCounts.clear()
		this.pendingDispatchAtMs.clear()
		this.simulationTimeMs = 0
		this.logisticsProvider.reset()
		this.actionSystem.reset()
	}
}

export { WorkProviderEvents }
export * from './types'
export * from './deps'
export * from './policies'
