import { EventManager } from '../events'
import { BuildingManager } from '../Buildings'
import { PopulationManager } from '../Population'
import { LootManager } from '../Loot'
import { MapManager } from '../Map'
import { StorageManager } from '../Storage'
import { ResourceNodesManager } from '../ResourceNodes'
import { ItemsManager } from '../Items'
import { JobAssignment, JobPhase, JobReservation, JobReservationType, JobType, Settler, SettlerState } from '../Population/types'
import { Position } from '../types'
import { v4 as uuidv4 } from 'uuid'
import { calculateDistance } from '../utils'
import { ConstructionStage } from '../Buildings/types'
import { ProfessionType } from '../Population/types'
import { PopulationEvents } from '../Population/events'
import { Receiver } from '../Receiver'
import { Logger } from '../Logs'
import { SimulationEvents } from '../Simulation/events'
import { SimulationTickData } from '../Simulation/types'
import { JOB_DEFINITIONS, JobEvent, getNextPhase } from './definitions'
import { ReservationService } from './ReservationService'

type PendingTransportRequest =
	| {
			id: string
			type: 'collect'
			buildingInstanceId: string
			itemType: string
			priority: number
			requestedAt: number
	  }
	| {
			id: string
			type: 'direct'
			sourceBuildingInstanceId: string
			targetBuildingInstanceId: string
			itemType: string
			quantity: number
			priority: number
			requestedAt: number
	  }

export class JobsManager {
	private jobs = new Map<string, JobAssignment>() // jobId -> JobAssignment
	private activeJobsByBuilding = new Map<string, Set<string>>() // buildingInstanceId -> Set<jobId>
	private storageManager?: StorageManager // Optional - set after construction to avoid circular dependency
	private pendingTransportRequests: PendingTransportRequest[] = []
	private pendingRequestKeys = new Set<string>()
	private dispatchAccumulatorMs = 0
	private simulationTimeMs = 0
	private readonly DISPATCH_INTERVAL_MS = 500
	private reservationService: ReservationService

	constructor(
		private event: EventManager,
		private buildingManager: BuildingManager,
		private populationManager: PopulationManager,
		private lootManager: LootManager,
		private mapManager: MapManager,
		private resourceNodesManager: ResourceNodesManager,
		private itemsManager: ItemsManager,
		private logger: Logger
	) {
		this.reservationService = new ReservationService(this.lootManager, this.resourceNodesManager, this.logger)
		this.setupEventHandlers()
	}

	// Set StorageManager after construction to avoid circular dependency
	public setStorageManager(storageManager: StorageManager): void {
		this.storageManager = storageManager
		this.reservationService.setStorageManager(storageManager)
	}

	private setupEventHandlers() {
		this.event.on(SimulationEvents.SS.Tick, (data: SimulationTickData) => {
			this.handleSimulationTick(data)
		})
	}

	private handleSimulationTick(data: SimulationTickData): void {
		this.simulationTimeMs = data.nowMs
		this.dispatchAccumulatorMs += data.deltaMs
		if (this.dispatchAccumulatorMs < this.DISPATCH_INTERVAL_MS) {
			return
		}
		this.dispatchAccumulatorMs -= this.DISPATCH_INTERVAL_MS
		this.dispatchPendingTransportJobs()
	}

	private setJobPhase(job: JobAssignment, phase: JobPhase): void {
		job.phase = phase
		job.phaseStartedAtMs = this.simulationTimeMs || Date.now()
		job.lastProgressAtMs = job.phaseStartedAtMs

		if (phase === JobPhase.Completed) {
			job.status = 'completed'
			return
		}
		if (phase === JobPhase.Cancelled) {
			job.status = 'cancelled'
			return
		}

		if (job.jobType === JobType.Construction || job.jobType === JobType.Production) {
			job.status = phase === JobPhase.Working ? 'active' : 'pending'
		} else {
			job.status = 'active'
		}
	}

	private advanceJobPhase(job: JobAssignment, event: JobEvent): JobPhase | null {
		const nextPhase = getNextPhase(job, event)
		if (!nextPhase) {
			return null
		}
		this.setJobPhase(job, nextPhase)
		return nextPhase
	}

	private addReservation(job: JobAssignment, reservation: JobReservation | null): void {
		if (!reservation) {
			return
		}
		if (!job.reservations) {
			job.reservations = []
		}
		job.reservations.push(reservation)
	}

	private removeReservation(job: JobAssignment, reservationId: string): void {
		if (!job.reservations || job.reservations.length === 0) {
			return
		}
		job.reservations = job.reservations.filter(reservation => reservation.id !== reservationId)
	}

	private releaseAllReservations(job: JobAssignment): void {
		if (!job.reservations || job.reservations.length === 0) {
			return
		}
		this.reservationService.releaseAll(job.reservations)
		job.reservations = []
	}

	private getSettler(job: JobAssignment): Settler | null {
		const settler = this.populationManager.getSettler(job.settlerId)
		if (!settler) {
			return null
		}
		return settler
	}

	private startJob(job: JobAssignment): void {
		const definition = JOB_DEFINITIONS[job.jobType]
		if (!definition) {
			return
		}

		const phase = definition.initialPhase(job)
		this.setJobPhase(job, phase)
		this.dispatchPhase(job, phase)
	}

	private dispatchPhase(job: JobAssignment, phase: JobPhase): void {
		const settler = this.getSettler(job)
		if (!settler) {
			this.cancelJob(job.jobId, 'settler_missing')
			return
		}

		if (phase === JobPhase.MovingToTool) {
			if (!job.toolItemId) {
				this.logger.warn(`[JOBS] Job ${job.jobId} in moving_to_tool without toolItemId`)
				this.advanceJobPhase(job, 'arrived')
				this.dispatchPhase(job, job.phase || phase)
				return
			}

			const toolItem = this.lootManager.getItem(job.toolItemId)
			if (!this.reservationService.isValid({ type: JobReservationType.Tool, id: job.toolItemId, ownerId: job.jobId, targetId: job.toolItemId })) {
				this.logger.warn(`[JOBS] Tool reservation invalid for job ${job.jobId}`)
				job.toolItemId = undefined
				this.advanceJobPhase(job, 'arrived')
				this.dispatchPhase(job, job.phase || phase)
				return
			}
			if (!toolItem) {
				this.logger.warn(`[JOBS] Tool ${job.toolItemId} not found for job ${job.jobId}`)
				job.toolItemId = undefined
				this.advanceJobPhase(job, 'arrived')
				this.dispatchPhase(job, job.phase || phase)
				return
			}

			settler.stateContext.jobId = job.jobId
			this.populationManager.transitionSettlerState(settler.id, SettlerState.MovingToTool, {
				toolId: toolItem.id,
				toolPosition: toolItem.position,
				buildingInstanceId: job.buildingInstanceId,
				requiredProfession: job.requiredProfession
			})
			return
		}

		if (phase === JobPhase.MovingToSource) {
			settler.stateContext.jobId = job.jobId
			this.populationManager.transitionSettlerState(settler.id, SettlerState.MovingToItem, {
				jobId: job.jobId
			})
			return
		}

		if (phase === JobPhase.MovingToResource) {
			settler.stateContext.jobId = job.jobId
			this.populationManager.transitionSettlerState(settler.id, SettlerState.MovingToResource, {
				jobId: job.jobId
			})
			return
		}

		if (phase === JobPhase.MovingToTarget) {
			settler.stateContext.jobId = job.jobId
			if (job.jobType === JobType.Construction || job.jobType === JobType.Production) {
				const buildingPosition = this.buildingManager.getBuildingPosition(job.buildingInstanceId)
				if (!buildingPosition) {
					this.cancelJob(job.jobId, 'building_missing')
					return
				}
				this.populationManager.transitionSettlerState(settler.id, SettlerState.MovingToBuilding, {
					buildingInstanceId: job.buildingInstanceId,
					buildingPosition,
					requiredProfession: job.requiredProfession
				})
				return
			}

			this.populationManager.transitionSettlerState(settler.id, SettlerState.CarryingItem, {
				jobId: job.jobId
			})
			return
		}
	}

	public handleSettlerArrival(settler: Settler): SettlerState | null {
		const jobId = settler.stateContext.jobId
		if (!jobId) {
			return null
		}

		const job = this.jobs.get(jobId)
		if (!job) {
			return null
		}

		job.lastProgressAtMs = this.simulationTimeMs || Date.now()

		switch (job.phase) {
			case JobPhase.MovingToTool: {
				if (job.toolItemId) {
					const toolItem = this.lootManager.getItem(job.toolItemId)
					if (toolItem && this.reservationService.isValid({ type: JobReservationType.Tool, id: job.toolItemId, ownerId: job.jobId, targetId: job.toolItemId })) {
						const itemMetadata = this.itemsManager.getItemMetadata(toolItem.itemType)
						if (itemMetadata?.changesProfession) {
							const targetProfession = itemMetadata.changesProfession as ProfessionType
							const oldProfession = settler.profession
							settler.profession = targetProfession

							const fakeClient: any = {
								id: settler.playerId,
								currentGroup: settler.mapName,
								emit: (receiver: any, event: string, data: any, target?: any) => {
									this.event.emit(receiver, event, data, target)
								},
								setGroup: () => {}
							}
							this.lootManager.pickItem(job.toolItemId, fakeClient)

							this.event.emit(Receiver.Group, PopulationEvents.SC.ProfessionChanged, {
								settlerId: settler.id,
								oldProfession,
								newProfession: targetProfession
							}, settler.mapName)
						}
					} else {
						this.logger.warn(`[JOBS] Tool reservation invalid for job ${job.jobId}`)
					}
					this.reservationService.release({ type: JobReservationType.Tool, id: job.toolItemId, ownerId: job.jobId, targetId: job.toolItemId })
					this.removeReservation(job, job.toolItemId)
					job.toolItemId = undefined
				}

				const nextPhase = this.advanceJobPhase(job, 'arrived')
				if (nextPhase === JobPhase.MovingToTarget) {
					return SettlerState.MovingToBuilding
				}
				return null
			}
			case JobPhase.MovingToSource: {
				if (job.jobType !== JobType.Transport) {
					return null
				}

				const targetBuilding = this.buildingManager.getBuildingInstance(job.buildingInstanceId)
				if (!targetBuilding) {
					this.cancelJob(job.jobId, 'building_missing')
					return SettlerState.Idle
				}

				const pickupSuccess = this.handleTransportPickup(job, settler)
				if (!pickupSuccess) {
					this.cancelJob(job.jobId, 'pickup_failed')
					return SettlerState.Idle
				}

				this.advanceJobPhase(job, 'arrived')
				return SettlerState.CarryingItem
			}
			case JobPhase.MovingToResource: {
				if (job.jobType !== JobType.Harvest) {
					return null
				}
				this.advanceJobPhase(job, 'arrived')
				job.harvestStartedAtMs = this.simulationTimeMs || Date.now()
				return SettlerState.Harvesting
			}
			case JobPhase.MovingToTarget: {
				if (job.jobType === JobType.Transport || job.jobType === JobType.Harvest) {
					const delivered = this.handleDelivery(job, settler)
					if (!delivered) {
						this.cancelJob(job.jobId, 'delivery_failed')
						return SettlerState.Idle
					}
					this.advanceJobPhase(job, 'arrived')
					this.completeJob(job.jobId)
					if (job.jobType === JobType.Harvest) {
						const assignedWorkers = this.buildingManager.getBuildingWorkers(job.buildingInstanceId)
						if (assignedWorkers.includes(settler.id)) {
							return SettlerState.Working
						}
					}
					return SettlerState.Idle
				}

				if (job.jobType === JobType.Construction || job.jobType === JobType.Production) {
					const building = this.buildingManager.getBuildingInstance(job.buildingInstanceId)
					if (!building || !this.buildingManager.getBuildingNeedsWorkers(job.buildingInstanceId)) {
						this.cancelJob(job.jobId, 'building_not_needing_worker')
						return SettlerState.Idle
					}
					this.assignWorkerToJob(job.jobId, settler.id)
					this.advanceJobPhase(job, 'arrived')
					return SettlerState.Working
				}
				return null
			}
			default:
				return null
		}
	}

	public handleHarvestComplete(jobId: string): void {
		const job = this.jobs.get(jobId)
		if (!job || job.jobType !== JobType.Harvest) {
			return
		}

		if (job.phase !== JobPhase.Harvesting) {
			return
		}

		if (!job.resourceNodeId) {
			this.cancelJob(jobId, 'resource_missing')
			return
		}

		const node = this.resourceNodesManager.getNode(job.resourceNodeId)
		if (!node || node.remainingHarvests <= 0) {
			this.cancelJob(jobId, 'resource_missing')
			return
		}

		const harvestedItem = this.resourceNodesManager.harvestNode(node.id, job.jobId)
		if (!harvestedItem) {
			this.cancelJob(jobId, 'harvest_failed')
			return
		}

		job.carriedItemId = harvestedItem.id
		job.itemType = harvestedItem.itemType
		job.quantity = job.quantity || 1
		this.removeReservation(job, job.resourceNodeId)

		this.advanceJobPhase(job, 'harvest_complete')
		this.dispatchPhase(job, job.phase || JobPhase.MovingToTarget)
	}

	private handleTransportPickup(job: JobAssignment, settler: Settler): boolean {
		if (job.sourceItemId) {
			const item = this.lootManager.getItem(job.sourceItemId)
			if (!item || !this.reservationService.isValid({ type: JobReservationType.Loot, id: job.sourceItemId, ownerId: job.jobId, targetId: job.sourceItemId })) {
				return false
			}

			const fakeClient: any = {
				id: settler.playerId,
				currentGroup: settler.mapName,
				emit: (receiver: any, event: string, data: any, target?: any) => {
					this.event.emit(receiver, event, data, target)
				},
				setGroup: () => {}
			}

			const pickedItem = this.lootManager.pickItem(job.sourceItemId, fakeClient)
			if (!pickedItem) {
				return false
			}

			job.carriedItemId = pickedItem.id
			job.sourceItemId = undefined
			this.removeReservation(job, item.id)
			return true
		}

		if (job.sourceBuildingInstanceId) {
			const pickup = this.handleBuildingPickup(job.jobId)
			return pickup
		}

		return false
	}

	private handleDelivery(job: JobAssignment, settler: Settler): boolean {
		if (!job.itemType || !job.quantity) {
			return false
		}

		const building = this.buildingManager.getBuildingInstance(job.buildingInstanceId)
		if (!building) {
			return false
		}

		if (job.jobType === JobType.Harvest) {
			if (!this.storageManager) {
				return false
			}
			const delivered = this.storageManager.addToStorage(job.buildingInstanceId, job.itemType, job.quantity)
			return delivered
		}

		if (job.jobType === JobType.Transport) {
			if (building.stage === ConstructionStage.Completed && this.storageManager) {
				if (!this.storageManager.acceptsItemType(job.buildingInstanceId, job.itemType)) {
					return false
				}
				const delivered = this.handleBuildingDelivery(job.jobId)
				return delivered
			}

			if (building.stage === ConstructionStage.CollectingResources || building.stage === ConstructionStage.Constructing) {
				return this.buildingManager.addResourceToBuilding(job.buildingInstanceId, job.itemType, 1)
			}
		}

		return false
	}

	// Transport Jobs
	public requestResourceCollection(buildingInstanceId: string, itemType: string, priority: number = 1): void {
		this.logger.log(`[JOBS] Requesting resource collection: building=${buildingInstanceId}, itemType=${itemType}, priority=${priority}`)

		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (!building) {
			this.logger.warn(`[JOBS] Cannot request resource collection: Building ${buildingInstanceId} not found`)
			return
		}

		if (this.hasActiveJobForBuilding(buildingInstanceId, itemType)) {
			this.logger.log(`[JOBS] Building ${buildingInstanceId} already has active or pending job for ${itemType}`)
			return
		}

		this.enqueueCollectRequest(buildingInstanceId, itemType, priority)
		this.dispatchPendingTransportJobs()
	}

	// Harvest Jobs (worker goes to resource node, harvests, returns to building storage)
	public requestHarvestJob(settlerId: string, buildingInstanceId: string, resourceNodeId: string): string | null {
		const settler = this.populationManager.getSettler(settlerId)
		if (!settler || (settler.state !== SettlerState.Idle && settler.state !== SettlerState.Working)) {
			return null
		}

		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (!building) {
			this.logger.warn(`[JOBS] Cannot request harvest: Building ${buildingInstanceId} not found`)
			return null
		}

		const node = this.resourceNodesManager.getNode(resourceNodeId)
		if (!node) {
			this.logger.warn(`[JOBS] Cannot request harvest: Resource node ${resourceNodeId} not found`)
			return null
		}

		const definition = this.resourceNodesManager.getDefinition(node.nodeType)
		if (!definition) {
			this.logger.warn(`[JOBS] Cannot request harvest: Definition for node type ${node.nodeType} not found`)
			return null
		}

		const harvestDurationMs = definition.harvestTimeMs ?? 1000
		const jobId = uuidv4()
		const nodeReservation = this.reservationService.reserveNode(resourceNodeId, jobId)
		if (!nodeReservation) {
			this.logger.log(`[JOBS] Cannot request harvest: Resource node ${resourceNodeId} already reserved`)
			return null
		}

		const jobAssignment: JobAssignment = {
			jobId,
			settlerId,
			buildingInstanceId,
			jobType: JobType.Harvest,
			priority: 1,
			assignedAt: Date.now(),
			status: 'active',
			resourceNodeId,
			itemType: definition.outputItemType,
			quantity: definition.harvestQuantity,
			harvestDurationMs
		}
		this.addReservation(jobAssignment, nodeReservation)

		this.jobs.set(jobAssignment.jobId, jobAssignment)
		if (!this.activeJobsByBuilding.has(buildingInstanceId)) {
			this.activeJobsByBuilding.set(buildingInstanceId, new Set())
		}
		this.activeJobsByBuilding.get(buildingInstanceId)!.add(jobAssignment.jobId)

		this.logger.log(`[JOBS] Created harvest job ${jobAssignment.jobId} for building ${buildingInstanceId}, node=${resourceNodeId}, settler=${settlerId}`)

		this.startJob(jobAssignment)

		return jobAssignment.jobId
	}

	public getActiveHarvestJobs(): JobAssignment[] {
		return Array.from(this.jobs.values())
			.filter(job => job.jobType === JobType.Harvest && job.status === 'active')
	}

	private enqueueCollectRequest(buildingInstanceId: string, itemType: string, priority: number): void {
		const key = `collect:${buildingInstanceId}:${itemType}`
		if (this.pendingRequestKeys.has(key)) {
			return
		}

		this.pendingRequestKeys.add(key)
		this.pendingTransportRequests.push({
			id: uuidv4(),
			type: 'collect',
			buildingInstanceId,
			itemType,
			priority,
			requestedAt: this.simulationTimeMs || Date.now()
		})
	}

	private enqueueDirectRequest(
		sourceBuildingInstanceId: string,
		targetBuildingInstanceId: string,
		itemType: string,
		quantity: number,
		priority: number
	): void {
		const key = `direct:${sourceBuildingInstanceId}:${targetBuildingInstanceId}:${itemType}`
		if (this.pendingRequestKeys.has(key)) {
			return
		}

		this.pendingRequestKeys.add(key)
		this.pendingTransportRequests.push({
			id: uuidv4(),
			type: 'direct',
			sourceBuildingInstanceId,
			targetBuildingInstanceId,
			itemType,
			quantity,
			priority,
			requestedAt: this.simulationTimeMs || Date.now()
		})
	}

	private dispatchPendingTransportJobs(): void {
		if (this.pendingTransportRequests.length === 0) {
			return
		}

		// Higher priority first, then older requests first
		const sorted = [...this.pendingTransportRequests].sort((a, b) => {
			if (b.priority !== a.priority) {
				return b.priority - a.priority
			}
			return a.requestedAt - b.requestedAt
		})

		const handledIds = new Set<string>()
		for (const request of sorted) {
			if (handledIds.has(request.id)) {
				continue
			}

			const result = this.tryDispatchRequest(request)
			if (result === 'assigned' || result === 'drop') {
				handledIds.add(request.id)
			}
		}

		if (handledIds.size === 0) {
			return
		}

		this.pendingTransportRequests = this.pendingTransportRequests.filter(req => !handledIds.has(req.id))
		for (const request of sorted) {
			if (handledIds.has(request.id)) {
				this.pendingRequestKeys.delete(this.getRequestKey(request))
			}
		}
	}

	private tryDispatchRequest(request: PendingTransportRequest): 'assigned' | 'keep' | 'drop' {
		if (request.type === 'collect') {
			return this.tryDispatchCollectRequest(request)
		}

		return this.tryDispatchDirectRequest(request)
	}

	private tryDispatchCollectRequest(request: Extract<PendingTransportRequest, { type: 'collect' }>): 'assigned' | 'keep' | 'drop' {
		const building = this.buildingManager.getBuildingInstance(request.buildingInstanceId)
		if (!building) {
			return 'drop'
		}

		const availableCarriers = this.populationManager.getAvailableCarriers(
			building.mapName,
			building.playerId
		)

		if (availableCarriers.length === 0) {
			return 'keep'
		}

		// Prefer building storage sources first
		if (this.storageManager) {
			const sourceBuildingIds = this.storageManager
				.getBuildingsWithAvailableItems(request.itemType, 1, building.mapName, building.playerId)
				.filter(id => id !== building.id)

			if (sourceBuildingIds.length > 0) {
				const sourceBuildingId = this.findClosestBuilding(sourceBuildingIds, building.position)
				if (sourceBuildingId) {
					const jobId = this.tryCreateBuildingTransportJob(
						sourceBuildingId,
						building.id,
						request.itemType,
						1,
						request.priority
					)
					return jobId ? 'assigned' : 'drop'
				}
			}
		}

		// Fall back to ground items
		const mapItems = this.lootManager.getMapItems(building.mapName)
		const itemsOfType = mapItems.filter(item =>
			item.itemType === request.itemType && this.lootManager.isItemAvailable(item.id)
		)
		if (itemsOfType.length === 0) {
			return 'drop'
		}

		const closestItem = this.findClosestItem(itemsOfType, building.position)
		if (!closestItem) {
			return 'drop'
		}

		const jobId = this.tryCreateGroundTransportJob(
			building.id,
			closestItem.id,
			closestItem.position,
			request.itemType,
			request.priority
		)

		return jobId ? 'assigned' : 'drop'
	}

	private tryDispatchDirectRequest(request: Extract<PendingTransportRequest, { type: 'direct' }>): 'assigned' | 'keep' | 'drop' {
		const sourceBuilding = this.buildingManager.getBuildingInstance(request.sourceBuildingInstanceId)
		if (!sourceBuilding) {
			return 'drop'
		}

		const availableCarriers = this.populationManager.getAvailableCarriers(
			sourceBuilding.mapName,
			sourceBuilding.playerId
		)

		if (availableCarriers.length === 0) {
			return 'keep'
		}

		const jobId = this.tryCreateBuildingTransportJob(
			request.sourceBuildingInstanceId,
			request.targetBuildingInstanceId,
			request.itemType,
			request.quantity,
			request.priority
		)

		return jobId ? 'assigned' : 'drop'
	}

	private getRequestKey(request: PendingTransportRequest): string {
		if (request.type === 'collect') {
			return `collect:${request.buildingInstanceId}:${request.itemType}`
		}
		return `direct:${request.sourceBuildingInstanceId}:${request.targetBuildingInstanceId}:${request.itemType}`
	}

	// Worker Jobs (construction/production)
	public requestWorker(buildingInstanceId: string): void {
		// 1. Get building from BuildingManager
		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return
		}

		// 2. Check if building needs workers
		if (!this.buildingManager.getBuildingNeedsWorkers(buildingInstanceId)) {
			return
		}

		// 3. Get building definition
		const buildingDef = this.buildingManager.getBuildingDefinition(building.buildingId)
		if (!buildingDef) {
			return
		}

		// 4. Determine job type from building state
		// Note: Builders are only needed during Constructing stage
		// During CollectingResources, only carriers are needed (handled by requestResourceCollection)
		let jobType: JobType
		let requiredProfession: ProfessionType | undefined
		if (building.stage === ConstructionStage.Constructing) {
			jobType = JobType.Construction
			requiredProfession = ProfessionType.Builder
		} else if (building.stage === ConstructionStage.Completed && buildingDef.workerSlots) {
			jobType = JobType.Production
			requiredProfession = buildingDef.requiredProfession ? buildingDef.requiredProfession as ProfessionType : undefined
		} else {
			return // Building doesn't need workers
		}

		// 5. Find available worker (delegate to PopulationManager)
		const worker = this.populationManager.findWorkerForBuilding(
			buildingInstanceId,
			requiredProfession,
			building.mapName,
			building.position,
			building.playerId
		)

		if (!worker) {
			// No worker available - emit failure event (use existing PopulationEvents)
			this.event.emit(Receiver.Group, PopulationEvents.SC.WorkerRequestFailed, {
				buildingInstanceId: buildingInstanceId,
				reason: 'no_worker_available'
			}, building.mapName)
			return
		}

		const jobId = uuidv4()
		let toolItemId: string | undefined
		let toolReservation: JobReservation | null = null

		if (requiredProfession && worker.profession !== requiredProfession) {
			const toolItemType = this.populationManager.getToolItemType(requiredProfession)
			if (toolItemType) {
				const toolItem = this.populationManager.findAvailableToolOnMap(building.mapName, toolItemType)
				if (toolItem) {
					toolReservation = this.reservationService.reserveTool(toolItem.id, jobId)
					if (toolReservation) {
						toolItemId = toolItem.id
					}
				}
			}
		}

		// 6. Create job assignment immediately with status='pending'
		// This allows us to store jobId in SettlerStateContext and look up all job details from the job
		const jobAssignment: JobAssignment = {
			jobId,
			settlerId: worker.id,
			buildingInstanceId: buildingInstanceId,
			jobType: jobType,
			priority: 1,
			assignedAt: Date.now(),
			status: 'pending', // Will be 'active' when worker arrives
			requiredProfession, // Store required profession in job
			toolItemId
		}
		this.addReservation(jobAssignment, toolReservation)

		// 7. Store job
		this.jobs.set(jobAssignment.jobId, jobAssignment)
		if (!this.activeJobsByBuilding.has(buildingInstanceId)) {
			this.activeJobsByBuilding.set(buildingInstanceId, new Set())
		}
		this.activeJobsByBuilding.get(buildingInstanceId)!.add(jobAssignment.jobId)

		// 8. Assign worker to job (delegate to PopulationManager)
		// PopulationManager will store jobId in settler.stateContext and execute state transition
		this.startJob(jobAssignment)

		// 9. No event needed - settler state change (MovingToTool or MovingToBuilding) will be emitted by PopulationManager
		// via PopulationEvents.SC.SettlerUpdated
	}

	// Job Tracking
	public getJob(jobId: string): JobAssignment | undefined {
		return this.jobs.get(jobId)
	}

	public getActiveJobsForBuilding(buildingInstanceId: string): JobAssignment[] {
		const jobIds = this.activeJobsByBuilding.get(buildingInstanceId) || new Set()
		return Array.from(jobIds)
			.map(jobId => this.jobs.get(jobId))
			.filter(job => job !== undefined && job.status !== 'completed' && job.status !== 'cancelled') as JobAssignment[]
	}

	public hasActiveJobForBuilding(buildingInstanceId: string, itemType?: string): boolean {
		const jobs = this.getActiveJobsForBuilding(buildingInstanceId)
		if (itemType) {
			const activeMatch = jobs.some(job =>
				job.jobType === JobType.Transport && job.itemType === itemType
			)
			if (activeMatch) {
				return true
			}
			if (this.pendingRequestKeys.has(`collect:${buildingInstanceId}:${itemType}`)) {
				return true
			}
			for (const key of this.pendingRequestKeys) {
				if (!key.startsWith('direct:')) {
					continue
				}
				const [, sourceId, targetId, keyItemType] = key.split(':')
				if (keyItemType !== itemType) {
					continue
				}
				if (sourceId === buildingInstanceId || targetId === buildingInstanceId) {
					return true
				}
			}
			return false
		}
		if (jobs.length > 0) {
			return true
		}
		for (const key of this.pendingRequestKeys) {
			const parts = key.split(':')
			if (parts.length < 3) {
				continue
			}
			if (parts[0] === 'collect' && parts[1] === buildingInstanceId) {
				return true
			}
			if (parts[0] === 'direct') {
				const sourceId = parts[1]
				const targetId = parts[2]
				if (sourceId === buildingInstanceId || targetId === buildingInstanceId) {
					return true
				}
			}
		}
		return false
	}

	public hasActiveHarvestJobForBuilding(buildingInstanceId: string): boolean {
		const jobs = this.getActiveJobsForBuilding(buildingInstanceId)
		return jobs.some(job => job.jobType === JobType.Harvest)
	}

	// Job Completion
	public completeJob(jobId: string): void {
		const job = this.jobs.get(jobId)
		if (!job) {
			this.logger.warn(`[JOBS] Cannot complete job: Job ${jobId} not found`)
			return
		}

		this.logger.log(`[JOBS] Completing job ${jobId}: building=${job.buildingInstanceId}, type=${job.jobType}, itemType=${job.itemType || 'none'}`)
		this.setJobPhase(job, JobPhase.Completed)
		this.releaseAllReservations(job)

		if (job.jobType === JobType.Construction || job.jobType === JobType.Production) {
			this.buildingManager.unassignWorker(job.buildingInstanceId, job.settlerId)
			const building = this.buildingManager.getBuildingInstance(job.buildingInstanceId)
			if (building) {
				this.event.emit(Receiver.Group, PopulationEvents.SC.WorkerUnassigned, {
					settlerId: job.settlerId,
					buildingInstanceId: job.buildingInstanceId,
					jobId: job.jobId
				}, building.mapName)
			}
		}

		// Remove from active jobs
		const buildingJobs = this.activeJobsByBuilding.get(job.buildingInstanceId)
		if (buildingJobs) {
			buildingJobs.delete(jobId)
			this.logger.log(`[JOBS] Removed job ${jobId} from building ${job.buildingInstanceId}. Remaining active jobs: ${buildingJobs.size}`)
			if (buildingJobs.size === 0) {
				this.activeJobsByBuilding.delete(job.buildingInstanceId)
				this.logger.log(`[JOBS] No more active jobs for building ${job.buildingInstanceId}`)
			}
		}

		// No event needed - job completion is reflected by:
		// - Settler state change to Idle (PopulationEvents.SC.SettlerUpdated)
		// - Building resource delivery (BuildingsEvents.SC.ResourcesChanged) for transport jobs
		// - Building stage change (BuildingsEvents.SC.StageChanged) when resources collected

		if (job.resourceNodeId) {
			this.resourceNodesManager.releaseReservation(job.resourceNodeId, jobId)
		}
	}

	public cancelJob(jobId: string, reason?: string, options?: { skipSettlerReset?: boolean }): void {
		const job = this.jobs.get(jobId)
		if (!job) {
			return
		}

		this.setJobPhase(job, JobPhase.Cancelled)
		this.releaseAllReservations(job)

		if (job.resourceNodeId) {
			this.resourceNodesManager.releaseReservation(job.resourceNodeId, jobId)
		}

		const settler = this.populationManager.getSettler(job.settlerId)
		if (settler && job.carriedItemId && job.itemType) {
			if (job.sourceBuildingInstanceId && this.storageManager && job.quantity) {
				const returned = this.storageManager.addToStorage(job.sourceBuildingInstanceId, job.itemType, job.quantity)
				if (!returned) {
					this.dropCarriedItem(job, settler)
				}
			} else {
				this.dropCarriedItem(job, settler)
			}
		}

		if (job.jobType === JobType.Construction || job.jobType === JobType.Production) {
			this.buildingManager.unassignWorker(job.buildingInstanceId, job.settlerId)
			const building = this.buildingManager.getBuildingInstance(job.buildingInstanceId)
			if (building) {
				this.event.emit(Receiver.Group, PopulationEvents.SC.WorkerUnassigned, {
					settlerId: job.settlerId,
					buildingInstanceId: job.buildingInstanceId,
					jobId: job.jobId
				}, building.mapName)
			}
		}

		// Remove from active jobs
		const buildingJobs = this.activeJobsByBuilding.get(job.buildingInstanceId)
		if (buildingJobs) {
			buildingJobs.delete(jobId)
			if (buildingJobs.size === 0) {
				this.activeJobsByBuilding.delete(job.buildingInstanceId)
			}
		}

		// Also remove from source building if it exists
		if (job.sourceBuildingInstanceId) {
			const sourceBuildingJobs = this.activeJobsByBuilding.get(job.sourceBuildingInstanceId)
			if (sourceBuildingJobs) {
				sourceBuildingJobs.delete(jobId)
				if (sourceBuildingJobs.size === 0) {
					this.activeJobsByBuilding.delete(job.sourceBuildingInstanceId)
				}
			}
		}

		if (!options?.skipSettlerReset) {
			this.populationManager.resetSettlerFromJob(jobId, reason || 'job_cancelled')
		}
	}

	private dropCarriedItem(job: JobAssignment, settler: Settler): void {
		if (!job.carriedItemId || !job.itemType) {
			return
		}

		const fakeClient: any = {
			id: settler.playerId,
			currentGroup: settler.mapName,
			emit: (receiver: any, event: string, data: any, target?: any) => {
				this.event.emit(receiver, event, data, target)
			},
			setGroup: () => {}
		}

		this.lootManager.dropItem({ id: job.carriedItemId, itemType: job.itemType }, settler.position, fakeClient, job.quantity || 1)
		this.logger.log(`[JOBS] Dropped carried item ${job.carriedItemId} for cancelled job ${job.jobId}`)
	}

	public assignWorkerToJob(jobId: string, settlerId: string): void {
		const job = this.jobs.get(jobId)
		if (!job) {
			return
		}

		// Assign worker to building (for construction/production jobs)
		if (job.jobType === JobType.Construction || job.jobType === JobType.Production) {
			this.buildingManager.assignWorker(job.buildingInstanceId, settlerId)
			const building = this.buildingManager.getBuildingInstance(job.buildingInstanceId)
			if (building) {
				this.event.emit(Receiver.Group, PopulationEvents.SC.WorkerAssigned, {
					jobAssignment: job,
					settlerId,
					buildingInstanceId: job.buildingInstanceId
				}, building.mapName)
			}
		}
	}

	// Helper methods
	private findClosestItem(items: Array<{ id: string, position: Position }>, targetPosition: Position): { id: string, position: Position } | null {
		if (items.length === 0) {
			return null
		}

		let closest = items[0]
		let closestDistance = calculateDistance(closest.position, targetPosition)

		for (let i = 1; i < items.length; i++) {
			const distance = calculateDistance(items[i].position, targetPosition)
			if (distance < closestDistance) {
				closest = items[i]
				closestDistance = distance
			}
		}

		return closest
	}

	private findClosestBuilding(buildingIds: string[], targetPosition: Position): string | null {
		if (buildingIds.length === 0) {
			return null
		}

		let closestId: string | null = null
		let closestDistance = Infinity

		for (const buildingId of buildingIds) {
			const building = this.buildingManager.getBuildingInstance(buildingId)
			if (!building) {
				continue
			}
			const distance = calculateDistance(building.position, targetPosition)
			if (distance < closestDistance) {
				closestDistance = distance
				closestId = buildingId
			}
		}

		return closestId
	}

	private findClosestCarrier(carriers: Settler[], targetPosition: Position): Settler | null {
		if (carriers.length === 0) {
			return null
		}

		let closest = carriers[0]
		let closestDistance = calculateDistance(closest.position, targetPosition)

		for (let i = 1; i < carriers.length; i++) {
			const distance = calculateDistance(carriers[i].position, targetPosition)
			if (distance < closestDistance) {
				closest = carriers[i]
				closestDistance = distance
			}
		}

		return closest
	}

	private tryCreateGroundTransportJob(
		targetBuildingInstanceId: string,
		itemId: string,
		itemPosition: Position,
		itemType: string,
		priority: number
	): string | null {
		const building = this.buildingManager.getBuildingInstance(targetBuildingInstanceId)
		if (!building) {
			return null
		}

		const availableCarriers = this.populationManager.getAvailableCarriers(
			building.mapName,
			building.playerId
		)

		if (availableCarriers.length === 0) {
			return null
		}

		const closestCarrier = this.findClosestCarrier(availableCarriers, itemPosition)
		if (!closestCarrier) {
			return null
		}

		const jobId = uuidv4()
		const lootReservation = this.reservationService.reserveLoot(itemId, jobId)
		if (!lootReservation) {
			this.logger.warn(`[JOBS] Cannot reserve ground item ${itemId} for transport`)
			return null
		}

		const jobAssignment: JobAssignment = {
			jobId,
			settlerId: closestCarrier.id,
			buildingInstanceId: targetBuildingInstanceId,
			jobType: JobType.Transport,
			priority,
			assignedAt: Date.now(),
			status: 'active',
			sourceItemId: itemId,
			sourcePosition: itemPosition,
			itemType,
			quantity: 1
		}
		this.addReservation(jobAssignment, lootReservation)

		this.jobs.set(jobAssignment.jobId, jobAssignment)
		if (!this.activeJobsByBuilding.has(targetBuildingInstanceId)) {
			this.activeJobsByBuilding.set(targetBuildingInstanceId, new Set())
		}
		this.activeJobsByBuilding.get(targetBuildingInstanceId)!.add(jobAssignment.jobId)

		this.logger.log(`[JOBS] Created ground transport job ${jobAssignment.jobId} for building ${targetBuildingInstanceId}, itemType: ${itemType}, carrier: ${closestCarrier.id}`)

		this.startJob(jobAssignment)

		return jobAssignment.jobId
	}

	private tryCreateBuildingTransportJob(
		sourceBuildingInstanceId: string,
		targetBuildingInstanceId: string,
		itemType: string,
		quantity: number,
		priority: number
	): string | null {
		if (!this.storageManager) {
			this.logger.warn(`[JOBS] Cannot request transport: StorageManager not set`)
			return null
		}

		const sourceBuilding = this.buildingManager.getBuildingInstance(sourceBuildingInstanceId)
		if (!sourceBuilding) {
			this.logger.warn(`[JOBS] Cannot request transport: Source building ${sourceBuildingInstanceId} not found`)
			return null
		}

		const targetBuilding = this.buildingManager.getBuildingInstance(targetBuildingInstanceId)
		if (!targetBuilding) {
			this.logger.warn(`[JOBS] Cannot request transport: Target building ${targetBuildingInstanceId} not found`)
			return null
		}

		const availableQuantity = this.storageManager.getAvailableQuantity(sourceBuildingInstanceId, itemType)
		if (availableQuantity < quantity) {
			return null
		}

		const isConstructionTarget = targetBuilding.stage === ConstructionStage.CollectingResources
			|| targetBuilding.stage === ConstructionStage.Constructing

		if (isConstructionTarget) {
			if (!this.buildingManager.buildingNeedsResource(targetBuildingInstanceId, itemType)) {
				return null
			}
		} else if (!this.storageManager.hasAvailableStorage(targetBuildingInstanceId, itemType, quantity)) {
			return null
		}

		const jobId = uuidv4()

		const sourceReservation = this.reservationService.reserveStorage(sourceBuildingInstanceId, itemType, quantity, jobId, true)
		if (!sourceReservation) {
			return null
		}

		let targetReservation: JobReservation | null = null
		if (!isConstructionTarget) {
			targetReservation = this.reservationService.reserveStorage(targetBuildingInstanceId, itemType, quantity, jobId, false)
			if (!targetReservation) {
				this.reservationService.release(sourceReservation)
				return null
			}
		}

		const availableCarriers = this.populationManager.getAvailableCarriers(
			sourceBuilding.mapName,
			sourceBuilding.playerId
		)

		if (availableCarriers.length === 0) {
			this.reservationService.release(sourceReservation)
			if (targetReservation) {
				this.reservationService.release(targetReservation)
			}
			return null
		}

		const closestCarrier = this.findClosestCarrier(availableCarriers, sourceBuilding.position)
		if (!closestCarrier) {
			this.reservationService.release(sourceReservation)
			if (targetReservation) {
				this.reservationService.release(targetReservation)
			}
			return null
		}

		const jobAssignment: JobAssignment = {
			jobId,
			settlerId: closestCarrier.id,
			buildingInstanceId: targetBuildingInstanceId,
			jobType: JobType.Transport,
			priority,
			assignedAt: Date.now(),
			status: 'active',
			sourceBuildingInstanceId,
			itemType,
			quantity,
			reservationId: targetReservation?.id
		}
		this.addReservation(jobAssignment, sourceReservation)
		this.addReservation(jobAssignment, targetReservation)

		this.jobs.set(jobAssignment.jobId, jobAssignment)
		if (!this.activeJobsByBuilding.has(targetBuildingInstanceId)) {
			this.activeJobsByBuilding.set(targetBuildingInstanceId, new Set())
		}
		this.activeJobsByBuilding.get(targetBuildingInstanceId)!.add(jobAssignment.jobId)

		if (!this.activeJobsByBuilding.has(sourceBuildingInstanceId)) {
			this.activeJobsByBuilding.set(sourceBuildingInstanceId, new Set())
		}
		this.activeJobsByBuilding.get(sourceBuildingInstanceId)!.add(jobAssignment.jobId)

		this.logger.log(`[JOBS] Created transport job ${jobAssignment.jobId} from ${sourceBuildingInstanceId} to ${targetBuildingInstanceId}, itemType: ${itemType}, quantity: ${quantity}, carrier: ${closestCarrier.id}`)

		this.startJob(jobAssignment)

		return jobAssignment.jobId
	}

	// NEW: Request transport from source building to target building
	public requestTransport(
		sourceBuildingInstanceId: string,
		targetBuildingInstanceId: string,
		itemType: string,
		quantity: number,
		priority: number = 1
	): string | null {
		this.logger.log(`[JOBS] Requesting transport: source=${sourceBuildingInstanceId}, target=${targetBuildingInstanceId}, itemType=${itemType}, quantity=${quantity}, priority=${priority}`)
		this.enqueueDirectRequest(sourceBuildingInstanceId, targetBuildingInstanceId, itemType, quantity, priority)
		this.dispatchPendingTransportJobs()
		return null
	}

	// NEW: Handle building pickup (remove from source building storage)
	public handleBuildingPickup(jobId: string): boolean {
		if (!this.storageManager) {
			this.logger.warn(`[JOBS] Cannot handle building pickup: StorageManager not set`)
			return false
		}

		const job = this.jobs.get(jobId)
		if (!job || !job.sourceBuildingInstanceId) {
			this.logger.warn(`[JOBS] Cannot handle building pickup: Job ${jobId} not found or not a building-to-building transport`)
			return false
		}

		const sourceBuilding = this.buildingManager.getBuildingInstance(job.sourceBuildingInstanceId)
		if (!sourceBuilding) {
			this.logger.warn(`[JOBS] Cannot handle building pickup: Source building ${job.sourceBuildingInstanceId} not found`)
			return false
		}

		if (!job.itemType || !job.quantity) {
			this.logger.warn(`[JOBS] Cannot handle building pickup: Job ${jobId} missing itemType or quantity`)
			return false
		}

		// Remove items from source building storage
		if (!this.storageManager.removeFromStorage(job.sourceBuildingInstanceId, job.itemType, job.quantity)) {
			this.logger.warn(`[JOBS] Cannot handle building pickup: Failed to remove ${job.quantity} ${job.itemType} from source building ${job.sourceBuildingInstanceId}`)
			return false
		}

		// Set carriedItemId (generate UUID for tracking)
		job.carriedItemId = uuidv4()

		// Release outgoing storage reservation now that items are removed
		const outgoingReservation = job.reservations?.find(reservation =>
			reservation.type === JobReservationType.Storage && reservation.metadata?.isOutgoing
		)
		if (outgoingReservation) {
			this.storageManager.releaseReservation(outgoingReservation.id)
			this.removeReservation(job, outgoingReservation.id)
		}

		this.logger.log(`[JOBS] Building pickup completed: Job ${jobId}, removed ${job.quantity} ${job.itemType} from ${sourceBuilding.id}`)

		return true
	}

	// NEW: Handle building delivery (add to target building storage)
	public handleBuildingDelivery(jobId: string): boolean {
		if (!this.storageManager) {
			this.logger.warn(`[JOBS] Cannot handle building delivery: StorageManager not set`)
			return false
		}

		const job = this.jobs.get(jobId)
		if (!job) {
			this.logger.warn(`[JOBS] Cannot handle building delivery: Job ${jobId} not found`)
			return false
		}

		const targetBuilding = this.buildingManager.getBuildingInstance(job.buildingInstanceId)
		if (!targetBuilding) {
			this.logger.warn(`[JOBS] Cannot handle building delivery: Target building ${job.buildingInstanceId} not found`)
			return false
		}

		if (!job.itemType || !job.quantity) {
			this.logger.warn(`[JOBS] Cannot handle building delivery: Job ${jobId} missing itemType or quantity`)
			return false
		}

		const incomingReservation = job.reservations?.find(reservation =>
			reservation.type === JobReservationType.Storage && !reservation.metadata?.isOutgoing
		)
		if (incomingReservation) {
			this.storageManager.releaseReservation(incomingReservation.id)
			this.removeReservation(job, incomingReservation.id)
		}

		// Add items to target building storage
		if (!this.storageManager.addToStorage(job.buildingInstanceId, job.itemType, job.quantity)) {
			this.logger.warn(`[JOBS] Cannot handle building delivery: Failed to add ${job.quantity} ${job.itemType} to target building ${job.buildingInstanceId}`)
			return false
		}

		// Clear carriedItemId
		job.carriedItemId = undefined

		this.logger.log(`[JOBS] Building delivery completed: Job ${jobId}, added ${job.quantity} ${job.itemType} to ${targetBuilding.id}`)

		return true
	}
}
