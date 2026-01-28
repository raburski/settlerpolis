import { EventManager } from '../events'
import { BuildingManager } from '../Buildings'
import { PopulationManager } from '../Population'
import { LootManager } from '../Loot'
import { MapManager } from '../Map'
import { StorageManager } from '../Storage'
import { ResourceNodesManager } from '../ResourceNodes'
import { JobAssignment, JobType, Settler, SettlerState } from '../Population/types'
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

	constructor(
		private event: EventManager,
		private buildingManager: BuildingManager,
		private populationManager: PopulationManager,
		private lootManager: LootManager,
		private mapManager: MapManager,
		private resourceNodesManager: ResourceNodesManager,
		private logger: Logger
	) {
		this.setupEventHandlers()
	}

	// Set StorageManager after construction to avoid circular dependency
	public setStorageManager(storageManager: StorageManager): void {
		this.storageManager = storageManager
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
		if (!this.resourceNodesManager.reserveNode(resourceNodeId, jobId)) {
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

		this.jobs.set(jobAssignment.jobId, jobAssignment)
		if (!this.activeJobsByBuilding.has(buildingInstanceId)) {
			this.activeJobsByBuilding.set(buildingInstanceId, new Set())
		}
		this.activeJobsByBuilding.get(buildingInstanceId)!.add(jobAssignment.jobId)

		this.logger.log(`[JOBS] Created harvest job ${jobAssignment.jobId} for building ${buildingInstanceId}, node=${resourceNodeId}, settler=${settlerId}`)

		this.populationManager.assignWorkerToHarvestJob(settlerId, jobAssignment.jobId, jobAssignment)

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
		const itemsOfType = mapItems.filter(item => item.itemType === request.itemType)
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

		// 6. Create job assignment immediately with status='pending'
		// This allows us to store jobId in SettlerStateContext and look up all job details from the job
		const jobAssignment: JobAssignment = {
			jobId: uuidv4(),
			settlerId: worker.id,
			buildingInstanceId: buildingInstanceId,
			jobType: jobType,
			priority: 1,
			assignedAt: Date.now(),
			status: 'pending', // Will be 'active' when worker arrives
			requiredProfession // Store required profession in job
		}

		// 7. Store job
		this.jobs.set(jobAssignment.jobId, jobAssignment)
		if (!this.activeJobsByBuilding.has(buildingInstanceId)) {
			this.activeJobsByBuilding.set(buildingInstanceId, new Set())
		}
		this.activeJobsByBuilding.get(buildingInstanceId)!.add(jobAssignment.jobId)

		// 8. Assign worker to job (delegate to PopulationManager)
		// PopulationManager will store jobId in settler.stateContext and execute state transition
		this.populationManager.assignWorkerToJob(
			worker.id,
			jobAssignment.jobId,
			jobAssignment
		)

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
		job.status = 'completed'

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

	public cancelJob(jobId: string, reason?: string): void {
		const job = this.jobs.get(jobId)
		if (!job) {
			return
		}

		job.status = 'cancelled'

		// Release storage reservations if this is a building-to-building transport
		if (this.storageManager && job.reservationId) {
			this.storageManager.releaseReservation(job.reservationId)
		}

		// If carrier is carrying items from building storage, we should handle that in the state transition
		// The state transition will handle dropping items if needed

		if (job.resourceNodeId) {
			this.resourceNodesManager.releaseReservation(job.resourceNodeId, jobId)
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

		// No event needed - job cancellation is reflected by:
		// - Settler state change to Idle (PopulationEvents.SC.SettlerUpdated)
		// - Building state remains unchanged (no resource delivered)
	}

	public assignWorkerToJob(jobId: string, settlerId: string): void {
		const job = this.jobs.get(jobId)
		if (!job) {
			return
		}

		// Update job status to active
		job.status = 'active'

		// Assign worker to building (for construction/production jobs)
		if (job.jobType === JobType.Construction || job.jobType === JobType.Production) {
			this.buildingManager.assignWorker(job.buildingInstanceId, settlerId)
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

		const jobAssignment: JobAssignment = {
			jobId: uuidv4(),
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

		this.jobs.set(jobAssignment.jobId, jobAssignment)
		if (!this.activeJobsByBuilding.has(targetBuildingInstanceId)) {
			this.activeJobsByBuilding.set(targetBuildingInstanceId, new Set())
		}
		this.activeJobsByBuilding.get(targetBuildingInstanceId)!.add(jobAssignment.jobId)

		this.logger.log(`[JOBS] Created ground transport job ${jobAssignment.jobId} for building ${targetBuildingInstanceId}, itemType: ${itemType}, carrier: ${closestCarrier.id}`)

		this.populationManager.assignWorkerToTransportJob(
			closestCarrier.id,
			jobAssignment.jobId,
			jobAssignment
		)

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

		if (!this.storageManager.hasAvailableStorage(targetBuildingInstanceId, itemType, quantity)) {
			return null
		}

		const sourceReservationId = this.storageManager.reserveStorage(sourceBuildingInstanceId, itemType, quantity, `transport-${targetBuildingInstanceId}`, true)
		if (!sourceReservationId) {
			return null
		}

		const targetReservationId = this.storageManager.reserveStorage(targetBuildingInstanceId, itemType, quantity, `transport-${sourceBuildingInstanceId}`, false)
		if (!targetReservationId) {
			this.storageManager.releaseReservation(sourceReservationId)
			return null
		}

		const availableCarriers = this.populationManager.getAvailableCarriers(
			sourceBuilding.mapName,
			sourceBuilding.playerId
		)

		if (availableCarriers.length === 0) {
			this.storageManager.releaseReservation(sourceReservationId)
			this.storageManager.releaseReservation(targetReservationId)
			return null
		}

		const closestCarrier = this.findClosestCarrier(availableCarriers, sourceBuilding.position)
		if (!closestCarrier) {
			this.storageManager.releaseReservation(sourceReservationId)
			this.storageManager.releaseReservation(targetReservationId)
			return null
		}

		const jobAssignment: JobAssignment = {
			jobId: uuidv4(),
			settlerId: closestCarrier.id,
			buildingInstanceId: targetBuildingInstanceId,
			jobType: JobType.Transport,
			priority,
			assignedAt: Date.now(),
			status: 'active',
			sourceBuildingInstanceId,
			itemType,
			quantity,
			reservationId: targetReservationId
		}

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

		this.populationManager.assignWorkerToTransportJob(
			closestCarrier.id,
			jobAssignment.jobId,
			jobAssignment
		)

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
		job.sourceBuildingInstanceId = undefined // Clear source building ID after pickup

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

		// Add items to target building storage
		if (!this.storageManager.addToStorage(job.buildingInstanceId, job.itemType, job.quantity)) {
			this.logger.warn(`[JOBS] Cannot handle building delivery: Failed to add ${job.quantity} ${job.itemType} to target building ${job.buildingInstanceId}`)
			return false
		}

		// Release storage reservation if it exists
		if (job.reservationId) {
			this.storageManager.releaseReservation(job.reservationId)
		}

		// Clear carriedItemId
		job.carriedItemId = undefined

		this.logger.log(`[JOBS] Building delivery completed: Job ${jobId}, added ${job.quantity} ${job.itemType} to ${targetBuilding.id}`)

		return true
	}
}
