import { EventManager } from '../events'
import { BuildingManager } from '../Buildings'
import { PopulationManager } from '../Population'
import { LootManager } from '../Loot'
import { MapManager } from '../Map'
import { StorageManager } from '../Storage'
import { JobAssignment, JobType, Settler } from '../Population/types'
import { Position } from '../types'
import { v4 as uuidv4 } from 'uuid'
import { calculateDistance } from '../utils'
import { ConstructionStage } from '../Buildings/types'
import { ProfessionType } from '../Population/types'
import { PopulationEvents } from '../Population/events'
import { Receiver } from '../Receiver'
import { Logger } from '../Logs'

export class JobsManager {
	private jobs = new Map<string, JobAssignment>() // jobId -> JobAssignment
	private activeJobsByBuilding = new Map<string, Set<string>>() // buildingInstanceId -> Set<jobId>
	private storageManager?: StorageManager // Optional - set after construction to avoid circular dependency

	constructor(
		private event: EventManager,
		private buildingManager: BuildingManager,
		private populationManager: PopulationManager,
		private lootManager: LootManager,
		private mapManager: MapManager,
		private logger: Logger
	) {
		this.setupEventHandlers()
	}

	// Set StorageManager after construction to avoid circular dependency
	public setStorageManager(storageManager: StorageManager): void {
		this.storageManager = storageManager
	}

	private setupEventHandlers() {
		// No event handlers needed - job state is surfaced through existing events
		// See docs/jobs_manager_design.md for event flow
	}

	// Transport Jobs
	public requestResourceCollection(buildingInstanceId: string, itemType: string): void {
		this.logger.log(`[JOBS] Requesting resource collection: building=${buildingInstanceId}, itemType=${itemType}`)
		
		// 1. Get building from BuildingManager
		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (!building) {
			this.logger.warn(`[JOBS] Cannot request resource collection: Building ${buildingInstanceId} not found`)
			return
		}

		// 2. Check if already has active job for this resource type
		if (this.hasActiveJobForBuilding(buildingInstanceId, itemType)) {
			this.logger.log(`[JOBS] Building ${buildingInstanceId} already has active job for ${itemType}`)
			return // Already has an active transport job
		}

		// 3. Find item on the ground (anywhere on the map, not just nearby)
		const mapItems = this.lootManager.getMapItems(building.mapName)
		this.logger.log(`[JOBS] Found ${mapItems.length} total items on map ${building.mapName}`)
		
		// Filter to items of the requested type (no distance restriction)
		const itemsOfType = mapItems.filter(item => item.itemType === itemType)
		this.logger.log(`[JOBS] Found ${itemsOfType.length} items of type ${itemType} on map`)

		if (itemsOfType.length === 0) {
			this.logger.log(`[JOBS] No items of type ${itemType} found on map for building ${buildingInstanceId}`)
			return // No items found
		}

		// Find the closest item to the building (carriers will travel to get it)
		const closestItem = this.findClosestItem(itemsOfType, building.position)
		if (!closestItem) {
			this.logger.warn(`[JOBS] Could not find closest item for building ${buildingInstanceId}`)
			return
		}
		
		const distanceToItem = calculateDistance(building.position, closestItem.position)
		this.logger.log(`[JOBS] Closest item: ${closestItem.id} at (${Math.round(closestItem.position.x)}, ${Math.round(closestItem.position.y)}) | distance: ${Math.round(distanceToItem)}px from building`)

		// 4. Find available carrier
		const availableCarriers = this.populationManager.getAvailableCarriers(
			building.mapName,
			building.playerId
		)
		this.logger.log(`[JOBS] Found ${availableCarriers.length} available carriers on map ${building.mapName}`)

		if (availableCarriers.length === 0) {
			this.logger.log(`[JOBS] No available carriers for building ${buildingInstanceId}`)
			return // No available carriers
		}

		const closestCarrier = this.findClosestCarrier(availableCarriers, closestItem.position)
		if (!closestCarrier) {
			this.logger.warn(`[JOBS] Could not find closest carrier for building ${buildingInstanceId}`)
			return
		}
		this.logger.log(`[JOBS] Assigned carrier: ${closestCarrier.id} at (${Math.round(closestCarrier.position.x)}, ${Math.round(closestCarrier.position.y)})`)

		// 5. Create transport job
		const jobAssignment: JobAssignment = {
			jobId: uuidv4(),
			settlerId: closestCarrier.id,
			buildingInstanceId: buildingInstanceId,
			jobType: JobType.Transport,
			priority: 1,
			assignedAt: Date.now(),
			status: 'active',
			// Transport-specific fields
			sourceItemId: closestItem.id,
			sourcePosition: closestItem.position,
			itemType: itemType,
			quantity: 1
		}

		// 6. Store job
		this.jobs.set(jobAssignment.jobId, jobAssignment)
		if (!this.activeJobsByBuilding.has(buildingInstanceId)) {
			this.activeJobsByBuilding.set(buildingInstanceId, new Set())
		}
		this.activeJobsByBuilding.get(buildingInstanceId)!.add(jobAssignment.jobId)
		this.logger.log(`[JOBS] Created transport job ${jobAssignment.jobId} for building ${buildingInstanceId}, itemType: ${itemType}, carrier: ${closestCarrier.id}`)

		// 7. Assign worker to job (delegate to PopulationManager)
		this.populationManager.assignWorkerToTransportJob(
			closestCarrier.id,
			jobAssignment.jobId,
			jobAssignment
		)

		// 8. No event needed - settler state change (MovingToItem) will be emitted by PopulationManager
		// via PopulationEvents.SC.SettlerUpdated
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
		if (building.stage === ConstructionStage.Constructing) {
			jobType = JobType.Construction
		} else if (building.stage === ConstructionStage.Completed && buildingDef.workerSlots) {
			jobType = JobType.Production
		} else {
			return // Building doesn't need workers
		}

		// 5. Find available worker (delegate to PopulationManager)
		const worker = this.populationManager.findWorkerForBuilding(
			buildingInstanceId,
			buildingDef.requiredProfession ? buildingDef.requiredProfession as ProfessionType : undefined,
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
			requiredProfession: buildingDef.requiredProfession ? buildingDef.requiredProfession as ProfessionType : undefined // Store required profession in job
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
			return jobs.some(job =>
				job.jobType === JobType.Transport && job.itemType === itemType
			)
		}
		return jobs.length > 0
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

	// NEW: Request transport from source building to target building
	public requestTransport(
		sourceBuildingInstanceId: string,
		targetBuildingInstanceId: string,
		itemType: string,
		quantity: number,
		priority: number = 1
	): string | null {
		if (!this.storageManager) {
			this.logger.warn(`[JOBS] Cannot request transport: StorageManager not set`)
			return null
		}

		this.logger.log(`[JOBS] Requesting transport: source=${sourceBuildingInstanceId}, target=${targetBuildingInstanceId}, itemType=${itemType}, quantity=${quantity}`)

		// 1. Validate source and target buildings exist
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

		// 2. Check if source building has available output items
		const availableQuantity = this.storageManager.getAvailableQuantity(sourceBuildingInstanceId, itemType)
		if (availableQuantity < quantity) {
			this.logger.warn(`[JOBS] Cannot request transport: Source building ${sourceBuildingInstanceId} has insufficient ${itemType}. Available: ${availableQuantity}, Requested: ${quantity}`)
			return null
		}

		// 3. Check if target building has available input storage
		if (!this.storageManager.hasAvailableStorage(targetBuildingInstanceId, itemType, quantity)) {
			this.logger.warn(`[JOBS] Cannot request transport: Target building ${targetBuildingInstanceId} has no available storage for ${itemType}`)
			return null
		}

		// 4. Reserve storage at source (output) and target (input) buildings
		// Source reservation is outgoing (items already in storage, will be removed)
		const sourceReservationId = this.storageManager.reserveStorage(sourceBuildingInstanceId, itemType, quantity, `transport-${targetBuildingInstanceId}`, true)
		if (!sourceReservationId) {
			this.logger.warn(`[JOBS] Cannot request transport: Failed to reserve storage at source building ${sourceBuildingInstanceId}`)
			return null
		}

		// Target reservation is incoming (empty space needed for delivery)
		const targetReservationId = this.storageManager.reserveStorage(targetBuildingInstanceId, itemType, quantity, `transport-${sourceBuildingInstanceId}`, false)
		if (!targetReservationId) {
			this.logger.warn(`[JOBS] Cannot request transport: Failed to reserve storage at target building ${targetBuildingInstanceId}`)
			// Release source reservation
			this.storageManager.releaseReservation(sourceReservationId)
			return null
		}

		// 5. Find available carrier
		const availableCarriers = this.populationManager.getAvailableCarriers(
			sourceBuilding.mapName,
			sourceBuilding.playerId
		)

		if (availableCarriers.length === 0) {
			this.logger.log(`[JOBS] No available carriers for transport from ${sourceBuildingInstanceId} to ${targetBuildingInstanceId}`)
			// Release reservations
			this.storageManager.releaseReservation(sourceReservationId)
			this.storageManager.releaseReservation(targetReservationId)
			return null
		}

		// Find closest carrier to source building
		const closestCarrier = this.findClosestCarrier(availableCarriers, sourceBuilding.position)
		if (!closestCarrier) {
			this.logger.warn(`[JOBS] Could not find closest carrier for transport`)
			// Release reservations
			this.storageManager.releaseReservation(sourceReservationId)
			this.storageManager.releaseReservation(targetReservationId)
			return null
		}

		// 6. Create transport job with sourceBuildingInstanceId (not sourceItemId)
		const jobAssignment: JobAssignment = {
			jobId: uuidv4(),
			settlerId: closestCarrier.id,
			buildingInstanceId: targetBuildingInstanceId, // Target building
			jobType: JobType.Transport,
			priority,
			assignedAt: Date.now(),
			status: 'active',
			// Transport-specific fields
			sourceBuildingInstanceId: sourceBuildingInstanceId, // Source building
			itemType: itemType,
			quantity: quantity,
			reservationId: targetReservationId // Store reservation ID for release on completion
		}

		// 7. Store job
		this.jobs.set(jobAssignment.jobId, jobAssignment)
		if (!this.activeJobsByBuilding.has(targetBuildingInstanceId)) {
			this.activeJobsByBuilding.set(targetBuildingInstanceId, new Set())
		}
		this.activeJobsByBuilding.get(targetBuildingInstanceId)!.add(jobAssignment.jobId)

		// Also track source building jobs
		if (!this.activeJobsByBuilding.has(sourceBuildingInstanceId)) {
			this.activeJobsByBuilding.set(sourceBuildingInstanceId, new Set())
		}
		this.activeJobsByBuilding.get(sourceBuildingInstanceId)!.add(jobAssignment.jobId)

		this.logger.log(`[JOBS] Created transport job ${jobAssignment.jobId} from ${sourceBuildingInstanceId} to ${targetBuildingInstanceId}, itemType: ${itemType}, quantity: ${quantity}, carrier: ${closestCarrier.id}`)

		// 8. Assign worker to job (delegate to PopulationManager)
		this.populationManager.assignWorkerToTransportJob(
			closestCarrier.id,
			jobAssignment.jobId,
			jobAssignment
		)

		return jobAssignment.jobId
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
