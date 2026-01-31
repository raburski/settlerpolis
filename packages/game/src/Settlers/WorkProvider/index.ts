import { BaseManager } from '../../Managers'
import type { EventClient, EventManager } from '../../events'
import { PopulationEvents } from '../../Population/events'
import { BuildingsEvents } from '../../Buildings/events'
import { SimulationEvents } from '../../Simulation/events'
import type { SimulationTickData } from '../../Simulation/types'
import type { BuildingManager } from '../../Buildings'
import type { PopulationManager } from '../../Population'
import type { MovementManager } from '../../Movement'
import type { LootManager } from '../../Loot'
import type { StorageManager } from '../../Storage'
import type { ResourceNodesManager } from '../../ResourceNodes'
import type { ItemsManager } from '../../Items'
import type { MapManager } from '../../Map'
import type { MapObjectsManager } from '../../MapObjects'
import type { ReservationSystem } from '../../Reservation'
import { Logger } from '../../Logs'
import { Receiver } from '../../Receiver'
import { v4 as uuidv4 } from 'uuid'
import { calculateDistance } from '../../utils'
import { SettlerState, ProfessionType } from '../../Population/types'
import { NeedsEvents } from '../../Needs/events'
import { NEED_CRITICAL_THRESHOLD } from '../../Needs/NeedsState'
import type { ContextPauseRequestedEventData, ContextResumeRequestedEventData, PausedContext } from '../../Needs/types'
import type { RequestWorkerData, UnassignWorkerData } from '../../Population/types'
import type { ProductionRecipe, SetProductionPausedData } from '../../Buildings/types'
import { ConstructionStage, ProductionStatus } from '../../Buildings/types'
import { getBuildingWorkKinds } from '../../Buildings/work'
import { ProviderRegistry } from './ProviderRegistry'
import { ActionSystem } from './ActionSystem'
import { WorkProviderEvents } from './events'
import type { WorkAssignment, WorkProvider, WorkStep, WorkAction, LogisticsRequest } from './types'
import { TransportTargetType, WorkStepType, WorkWaitReason } from './types'
import { StepHandlers } from './stepHandlers'
import { BuildingProvider } from './providers/BuildingProvider'
import { LogisticsProvider } from './providers/LogisticsProvider'
import { ConstructionProvider } from './providers/ConstructionProvider'

export interface WorkProviderDeps {
	buildings: BuildingManager
	population: PopulationManager
	movement: MovementManager
	loot: LootManager
	storage: StorageManager
	resourceNodes: ResourceNodesManager
	items: ItemsManager
	map: MapManager
	mapObjects: MapObjectsManager
	reservations: ReservationSystem
}

export class WorkProviderManager extends BaseManager<WorkProviderDeps> {
	private registry = new ProviderRegistry()
	private assignments = new Map<string, WorkAssignment>() // settlerId -> assignment
	private assignmentsByBuilding = new Map<string, Set<string>>()
	private buildingProviders = new Map<string, BuildingProvider>()
	private constructionProviders = new Map<string, ConstructionProvider>()
	private logisticsProvider: LogisticsProvider
	private actionSystem: ActionSystem
	private simulationTimeMs = 0
	private productionStateByBuilding = new Map<string, { status: ProductionStatus, progress: number }>()
	private constructionAssignCooldownMs = 2000
	private lastConstructionAssignAt = new Map<string, number>()
	private pauseRequests = new Map<string, { reason: string }>()
	private pausedContexts = new Map<string, PausedContext | null>()

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

		this.logisticsProvider = new LogisticsProvider(
			this.managers,
			this.logger
		)
		this.registry.register(this.logisticsProvider)

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

		// Assign idle carriers to logistics if there is pending demand
		this.assignIdleCarriersToLogistics()
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
			assignment.status = 'assigned'
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
			assignment.status = 'paused'
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
			if (!byMap.has(building.mapName)) {
				byMap.set(building.mapName, [])
			}
			byMap.get(building.mapName)!.push(request)
		}

		for (const [mapName, mapRequests] of byMap.entries()) {
			this.event.emit(Receiver.Group, WorkProviderEvents.SC.LogisticsUpdated, { requests: mapRequests }, mapName)
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
		if (building.stage !== 'constructing' && workerSlots > 0) {
			const assigned = this.assignmentsByBuilding.get(building.id)?.size || 0
			if (assigned >= workerSlots) {
				client.emit(Receiver.Sender, PopulationEvents.SC.WorkerRequestFailed, {
					buildingInstanceId: building.id,
					reason: 'building_does_not_need_workers'
				})
				return
			}
		}

		let requiredProfession = buildingDef.requiredProfession
			? (buildingDef.requiredProfession as ProfessionType)
			: undefined
		const isConstruction = building.stage === 'constructing'
		if (isConstruction) {
			requiredProfession = ProfessionType.Builder
		}
		const candidate = this.findBestSettler(building.mapName, building.playerId, building.position, requiredProfession, {
			allowFallbackToCarrier: !isConstruction
		})
		if (!candidate) {
			const reason = isConstruction
				? 'no_builder_available'
				: requiredProfession
					? 'no_suitable_profession'
					: 'no_available_worker'
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
			providerType: isConstruction ? 'construction' : 'building',
			buildingInstanceId: building.id,
			requiredProfession: requiredProfession,
			assignedAt: Date.now(),
			status: 'assigned'
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
		}, building.mapName)

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

		this.assignments.delete(data.settlerId)
		if (assignment.buildingInstanceId) {
			this.assignmentsByBuilding.get(assignment.buildingInstanceId)?.delete(data.settlerId)
			this.managers.buildings.setAssignedWorker(assignment.buildingInstanceId, data.settlerId, false)
			const provider = assignment.providerType === 'construction'
				? this.getConstructionProvider(assignment.buildingInstanceId)
				: this.getBuildingProvider(assignment.buildingInstanceId)
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
				}, building.mapName)
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
				providerType: 'logistics',
				assignedAt: Date.now(),
				status: 'assigned'
			}
			this.assignments.set(carrier.id, assignment)
			this.logisticsProvider.assign(carrier.id)
			this.managers.population.setSettlerAssignment(carrier.id, assignment.assignmentId, assignment.providerId, undefined)
			this.managers.population.setSettlerState(carrier.id, SettlerState.Assigned)
			this.dispatchNextStep(carrier.id)
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
				assignment => assignment.buildingInstanceId === building.id && assignment.providerType === 'construction'
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
			this.requestWorker({ buildingInstanceId: building.id }, this.getServerClient(building.mapName))
		}
	}

	private getServerClient(mapName?: string): EventClient {
		return {
			id: 'server',
			currentGroup: mapName || 'GLOBAL',
			setGroup: () => {},
			emit: (to, event, data, groupName) => {
				this.event.emit(to, event, data, groupName)
			}
		}
	}

	public enqueueActions(settlerId: string, actions: WorkAction[], onComplete?: () => void, onFail?: (reason: string) => void): void {
		if (this.actionSystem.isBusy(settlerId)) {
			this.logger.warn(`[WorkProvider] Cannot enqueue actions for ${settlerId}: action system busy`)
			onFail?.('action_system_busy')
			return
		}
		this.actionSystem.enqueue(settlerId, actions, onComplete, onFail)
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

		const settler = this.managers.population.getSettler(settlerId)
		if (settler?.needs &&
			(settler.needs.hunger <= NEED_CRITICAL_THRESHOLD || settler.needs.fatigue <= NEED_CRITICAL_THRESHOLD)) {
			this.managers.population.setSettlerWaitReason(settlerId, WorkWaitReason.NeedsCritical)
			this.managers.population.setSettlerLastStep(settlerId, undefined, WorkWaitReason.NeedsCritical)
			this.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
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
			this.managers.population.setSettlerWaitReason(settlerId, WorkWaitReason.NoWork)
			this.managers.population.setSettlerLastStep(settlerId, undefined, WorkWaitReason.NoWork)
			this.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
			return
		}

		if (step.type === WorkStepType.Wait) {
			this.managers.population.setSettlerWaitReason(settlerId, step.reason)
			this.managers.population.setSettlerLastStep(settlerId, step.type, step.reason)
			if (assignment.providerType === 'logistics' &&
				(step.reason === WorkWaitReason.NoRequests || step.reason === WorkWaitReason.NoViableRequest)) {
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

		this.actionSystem.enqueue(settlerId, actions, () => {
			releaseReservations?.()
			this.event.emit(Receiver.All, WorkProviderEvents.SS.StepCompleted, { settlerId, step })
			this.managers.population.setSettlerLastStep(settlerId, step.type, undefined)
			this.managers.population.setSettlerState(settlerId, SettlerState.Idle)
			if (step.type === WorkStepType.Transport && step.target.type === TransportTargetType.Construction) {
				this.logisticsProvider.releaseConstructionInFlight(step.target.buildingInstanceId, step.itemType, step.quantity)
			}
			if (step.type === WorkStepType.Produce && assignment.buildingInstanceId) {
				this.emitProductionCompleted(assignment.buildingInstanceId, step.recipe)
			}
			if (assignment.providerType === 'logistics' && !this.logisticsProvider.hasPendingRequests()) {
				this.unassignWorker({ settlerId })
				return
			}
			this.dispatchNextStep(settlerId)
		}, (reason) => {
			releaseReservations?.()
			this.event.emit(Receiver.All, WorkProviderEvents.SS.StepFailed, { settlerId, step, reason })
			this.managers.population.setSettlerWaitReason(settlerId, reason)
			this.managers.population.setSettlerLastStep(settlerId, step.type, reason)
			this.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
			if (step.type === WorkStepType.Transport && step.target.type === TransportTargetType.Construction) {
				this.logisticsProvider.releaseConstructionInFlight(step.target.buildingInstanceId, step.itemType, step.quantity)
			}
			setTimeout(() => this.dispatchNextStep(settlerId), 1000)
		})
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
		mapName: string,
		playerId: string,
		position: { x: number, y: number },
		requiredProfession?: ProfessionType | null,
		options: { allowFallbackToCarrier?: boolean } = {}
	) {
		const idleSettlers = this.managers.population.getAvailableSettlers(mapName, playerId)
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
		}, building.mapName)
		this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionProgress, {
			buildingInstanceId,
			progress: 0
		}, building.mapName)
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
		}, building.mapName)
		this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionProgress, {
			buildingInstanceId,
			progress: 100
		}, building.mapName)
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
		}, building.mapName)
		if (typeof progress === 'number') {
			this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionProgress, {
				buildingInstanceId,
				progress
			}, building.mapName)
		}
	}

	// External hooks for LogisticsProvider
	public enqueueLogisticsRequest(request: LogisticsRequest): void {
		this.logisticsProvider.enqueue(request)
	}
}

export { WorkProviderEvents }
export * from './types'
