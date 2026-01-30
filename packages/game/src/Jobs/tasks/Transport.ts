import { v4 as uuidv4 } from 'uuid'
import type { JobTaskContext } from '../TaskContext'
import type { JobAssignment, JobReservation } from '../types'
import { JobPhase, JobReservationType, JobStatus, JobType } from '../types'
import type { JobDefinition } from '../TaskRegistry'
import { JobQueue, PendingTransportRequest, DispatchResult } from '../JobQueue'
import { ConstructionStage } from '../../Buildings/types'
import { SettlerState } from '../../Population/types'
import type { Settler } from '../../Population/types'
import { calculateDistance } from '../../utils'
import type { JobsDeps } from '../index'
import type { Logger } from '../../Logs'
import type { ReservationService } from '../ReservationService'

export interface TransportJobServiceContext {
	managers: JobsDeps
	reservationService: ReservationService
	logger: Logger
	getSimulationTimeMs: () => number
	isSettlerAssignedToRole: (settlerId: string) => boolean
	registerJob: (job: JobAssignment) => void
	startJob: (job: JobAssignment) => void
	addReservation: (job: JobAssignment, reservation: JobReservation | null) => void
	trackJobForBuilding: (jobId: string, buildingInstanceId: string) => void
}

export class TransportJobService {
	private queue: JobQueue

	constructor(private context: TransportJobServiceContext) {
		this.queue = new JobQueue({
			getSimulationTimeMs: () => this.context.getSimulationTimeMs(),
			tryDispatch: (request) => this.tryDispatchRequest(request)
		})
	}

	public requestResourceCollection(buildingInstanceId: string, itemType: string, priority: number): void {
		this.queue.enqueueCollect(buildingInstanceId, itemType, priority)
		this.dispatchQueue()
	}

	public requestTransport(
		sourceBuildingInstanceId: string,
		targetBuildingInstanceId: string,
		itemType: string,
		quantity: number,
		priority: number
	): void {
		this.queue.enqueueDirect(sourceBuildingInstanceId, targetBuildingInstanceId, itemType, quantity, priority)
		this.dispatchQueue()
	}

	public dispatchQueue(): void {
		this.queue.dispatchPending()
	}

	public hasPendingRequestForBuilding(buildingInstanceId: string, itemType?: string): boolean {
		return this.queue.hasPendingRequestForBuilding(buildingInstanceId, itemType)
	}

	private tryDispatchRequest(request: PendingTransportRequest): DispatchResult {
		if (request.type === 'collect') {
			return this.tryDispatchCollectRequest(request)
		}

		return this.tryDispatchDirectRequest(request)
	}

	private tryDispatchCollectRequest(request: Extract<PendingTransportRequest, { type: 'collect' }>): DispatchResult {
		const building = this.context.managers.buildings.getBuildingInstance(request.buildingInstanceId)
		if (!building) {
			return 'drop'
		}

		const availableCarriers = this.getAvailableCarriers(building.mapName, building.playerId)
		if (availableCarriers.length === 0) {
			return 'keep'
		}

		if (this.context.managers.storage) {
			const sourceBuildingIds = this.context.managers.storage
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

		const mapItems = this.context.managers.loot.getMapItems(building.mapName)
		const itemsOfType = mapItems.filter(item =>
			item.itemType === request.itemType && this.context.managers.loot.isItemAvailable(item.id)
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

	private tryDispatchDirectRequest(request: Extract<PendingTransportRequest, { type: 'direct' }>): DispatchResult {
		const sourceBuilding = this.context.managers.buildings.getBuildingInstance(request.sourceBuildingInstanceId)
		if (!sourceBuilding) {
			return 'drop'
		}

		const availableCarriers = this.getAvailableCarriers(sourceBuilding.mapName, sourceBuilding.playerId)
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

	private getAvailableCarriers(mapName: string, playerId: string): Settler[] {
		return this.context.managers.population.getAvailableCarriers(mapName, playerId)
			.filter(carrier => !this.context.isSettlerAssignedToRole(carrier.id))
	}

	private tryCreateGroundTransportJob(
		targetBuildingInstanceId: string,
		itemId: string,
		itemPosition: { x: number, y: number },
		itemType: string,
		priority: number
	): string | null {
		const building = this.context.managers.buildings.getBuildingInstance(targetBuildingInstanceId)
		if (!building) {
			return null
		}

		const availableCarriers = this.getAvailableCarriers(building.mapName, building.playerId)
		if (availableCarriers.length === 0) {
			return null
		}

		const closestCarrier = this.findClosestCarrier(availableCarriers, itemPosition)
		if (!closestCarrier) {
			return null
		}

		const jobId = uuidv4()
		const lootReservation = this.context.reservationService.reserveLoot(itemId, jobId)
		if (!lootReservation) {
			this.context.logger.warn(`[JOBS] Cannot reserve ground item ${itemId} for transport`)
			return null
		}

		const jobAssignment: JobAssignment = {
			jobId,
			settlerId: closestCarrier.id,
			buildingInstanceId: targetBuildingInstanceId,
			jobType: JobType.Transport,
			priority,
			assignedAt: Date.now(),
			status: JobStatus.Active,
			sourceItemId: itemId,
			sourcePosition: itemPosition,
			itemType,
			quantity: 1
		}
		this.context.addReservation(jobAssignment, lootReservation)

		this.context.registerJob(jobAssignment)
		this.context.startJob(jobAssignment)

		return jobAssignment.jobId
	}

	private tryCreateBuildingTransportJob(
		sourceBuildingInstanceId: string,
		targetBuildingInstanceId: string,
		itemType: string,
		quantity: number,
		priority: number
	): string | null {
		if (!this.context.managers.storage) {
			this.context.logger.warn(`[JOBS] Cannot request transport: StorageManager not set`)
			return null
		}

		const sourceBuilding = this.context.managers.buildings.getBuildingInstance(sourceBuildingInstanceId)
		if (!sourceBuilding) {
			this.context.logger.warn(`[JOBS] Cannot request transport: Source building ${sourceBuildingInstanceId} not found`)
			return null
		}

		const targetBuilding = this.context.managers.buildings.getBuildingInstance(targetBuildingInstanceId)
		if (!targetBuilding) {
			this.context.logger.warn(`[JOBS] Cannot request transport: Target building ${targetBuildingInstanceId} not found`)
			return null
		}

		const availableQuantity = this.context.managers.storage.getAvailableQuantity(sourceBuildingInstanceId, itemType)
		if (availableQuantity < quantity) {
			return null
		}

		const isConstructionTarget = targetBuilding.stage === ConstructionStage.CollectingResources
			|| targetBuilding.stage === ConstructionStage.Constructing

		if (isConstructionTarget) {
			if (!this.context.managers.buildings.buildingNeedsResource(targetBuildingInstanceId, itemType)) {
				return null
			}
		} else if (!this.context.managers.storage.hasAvailableStorage(targetBuildingInstanceId, itemType, quantity)) {
			return null
		}

		const jobId = uuidv4()

		const sourceReservation = this.context.reservationService.reserveStorage(sourceBuildingInstanceId, itemType, quantity, jobId, true)
		if (!sourceReservation) {
			return null
		}

		let targetReservation: JobReservation | null = null
		if (!isConstructionTarget) {
			targetReservation = this.context.reservationService.reserveStorage(targetBuildingInstanceId, itemType, quantity, jobId, false)
			if (!targetReservation) {
				this.context.reservationService.release(sourceReservation)
				return null
			}
		}

		const availableCarriers = this.getAvailableCarriers(sourceBuilding.mapName, sourceBuilding.playerId)
		if (availableCarriers.length === 0) {
			this.context.reservationService.release(sourceReservation)
			if (targetReservation) {
				this.context.reservationService.release(targetReservation)
			}
			return null
		}

		const closestCarrier = this.findClosestCarrier(availableCarriers, sourceBuilding.position)
		if (!closestCarrier) {
			this.context.reservationService.release(sourceReservation)
			if (targetReservation) {
				this.context.reservationService.release(targetReservation)
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
			status: JobStatus.Active,
			sourceBuildingInstanceId,
			itemType,
			quantity,
			reservationId: targetReservation?.id
		}
		this.context.addReservation(jobAssignment, sourceReservation)
		this.context.addReservation(jobAssignment, targetReservation)

		this.context.registerJob(jobAssignment)
		this.context.trackJobForBuilding(jobAssignment.jobId, sourceBuildingInstanceId)
		this.context.startJob(jobAssignment)

		return jobAssignment.jobId
	}

	private findClosestItem(items: Array<{ id: string, position: { x: number, y: number } }>, targetPosition: { x: number, y: number }): { id: string, position: { x: number, y: number } } | null {
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

	private findClosestBuilding(buildingIds: string[], targetPosition: { x: number, y: number }): string | null {
		if (buildingIds.length === 0) {
			return null
		}

		let closestId: string | null = null
		let closestDistance = Infinity

		for (const buildingId of buildingIds) {
			const building = this.context.managers.buildings.getBuildingInstance(buildingId)
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

	private findClosestCarrier(carriers: Settler[], targetPosition: { x: number, y: number }): Settler | null {
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
}

const handleBuildingPickup = (context: JobTaskContext, job: JobAssignment): boolean => {
	if (!context.managers.storage) {
		context.logger.warn(`[JOBS] Cannot handle building pickup: StorageManager not set`)
		return false
	}

	if (!job.sourceBuildingInstanceId) {
		context.logger.warn(`[JOBS] Cannot handle building pickup: Job ${job.jobId} missing source building`)
		return false
	}

	const sourceBuilding = context.managers.buildings.getBuildingInstance(job.sourceBuildingInstanceId)
	if (!sourceBuilding) {
		context.logger.warn(`[JOBS] Cannot handle building pickup: Source building ${job.sourceBuildingInstanceId} not found`)
		return false
	}

	if (!job.itemType || !job.quantity) {
		context.logger.warn(`[JOBS] Cannot handle building pickup: Job ${job.jobId} missing itemType or quantity`)
		return false
	}

	if (!context.managers.storage.removeFromStorage(job.sourceBuildingInstanceId, job.itemType, job.quantity)) {
		context.logger.warn(`[JOBS] Cannot handle building pickup: Failed to remove ${job.quantity} ${job.itemType} from source building ${job.sourceBuildingInstanceId}`)
		return false
	}

	job.carriedItemId = uuidv4()

	const outgoingReservation = job.reservations?.find(reservation =>
		reservation.type === JobReservationType.Storage && reservation.metadata?.isOutgoing
	)
	if (outgoingReservation) {
		context.managers.storage.releaseReservation(outgoingReservation.id)
		context.removeReservation(job, outgoingReservation.id)
	}

	context.logger.log(`[JOBS] Building pickup completed: Job ${job.jobId}, removed ${job.quantity} ${job.itemType} from ${sourceBuilding.id}`)
	return true
}

const handleBuildingDelivery = (context: JobTaskContext, job: JobAssignment): boolean => {
	if (!context.managers.storage) {
		context.logger.warn(`[JOBS] Cannot handle building delivery: StorageManager not set`)
		return false
	}

	const targetBuilding = context.managers.buildings.getBuildingInstance(job.buildingInstanceId)
	if (!targetBuilding) {
		context.logger.warn(`[JOBS] Cannot handle building delivery: Target building ${job.buildingInstanceId} not found`)
		return false
	}

	if (!job.itemType || !job.quantity) {
		context.logger.warn(`[JOBS] Cannot handle building delivery: Job ${job.jobId} missing itemType or quantity`)
		return false
	}

	const incomingReservation = job.reservations?.find(reservation =>
		reservation.type === JobReservationType.Storage && !reservation.metadata?.isOutgoing
	)
	if (incomingReservation) {
		context.managers.storage.releaseReservation(incomingReservation.id)
		context.removeReservation(job, incomingReservation.id)
	}

	if (!context.managers.storage.addToStorage(job.buildingInstanceId, job.itemType, job.quantity)) {
		context.logger.warn(`[JOBS] Cannot handle building delivery: Failed to add ${job.quantity} ${job.itemType} to target building ${job.buildingInstanceId}`)
		return false
	}

	job.carriedItemId = undefined

	context.logger.log(`[JOBS] Building delivery completed: Job ${job.jobId}, added ${job.quantity} ${job.itemType} to ${targetBuilding.id}`)
	return true
}

const handleTransportPickup = (context: JobTaskContext, job: JobAssignment, settler: Settler): boolean => {
	if (job.sourceItemId) {
		const item = context.managers.loot.getItem(job.sourceItemId)
		if (!item || !context.reservationService.isValid({ type: JobReservationType.Loot, id: job.sourceItemId, ownerId: job.jobId, targetId: job.sourceItemId })) {
			return false
		}

		const fakeClient: any = {
			id: settler.playerId,
			currentGroup: settler.mapName,
			emit: (receiver: any, event: string, data: any, target?: any) => {
				context.event.emit(receiver, event, data, target)
			},
			setGroup: () => {}
		}

		const pickedItem = context.managers.loot.pickItem(job.sourceItemId, fakeClient)
		if (!pickedItem) {
			return false
		}

		job.carriedItemId = pickedItem.id
		job.sourceItemId = undefined
		context.removeReservation(job, item.id)
		return true
	}

	if (job.sourceBuildingInstanceId) {
		return handleBuildingPickup(context, job)
	}

	return false
}

const handleDelivery = (context: JobTaskContext, job: JobAssignment): boolean => {
	if (!job.itemType || !job.quantity) {
		return false
	}

	const building = context.managers.buildings.getBuildingInstance(job.buildingInstanceId)
	if (!building) {
		return false
	}

	if (job.jobType === JobType.Transport) {
		if (building.stage === ConstructionStage.Completed && context.managers.storage) {
			if (!context.managers.storage.acceptsItemType(job.buildingInstanceId, job.itemType)) {
				return false
			}
			return handleBuildingDelivery(context, job)
		}

		if (building.stage === ConstructionStage.CollectingResources || building.stage === ConstructionStage.Constructing) {
			return context.managers.buildings.addResourceToBuilding(job.buildingInstanceId, job.itemType, 1)
		}
	}

	return false
}

export const createTransportDefinition = (context: JobTaskContext): JobDefinition => ({
	type: JobType.Transport,
	initialPhase: () => JobPhase.MovingToSource,
	transitions: {
		[JobPhase.MovingToSource]: {
			arrived: JobPhase.MovingToTarget
		},
		[JobPhase.MovingToTarget]: {
			arrived: JobPhase.Completed
		}
	},
	dispatch: {
		[JobPhase.MovingToSource]: (job, settler) => {
			settler.stateContext.jobId = job.jobId
			context.managers.population.transitionSettlerState(settler.id, SettlerState.MovingToItem, {
				jobId: job.jobId
			})
		},
		[JobPhase.MovingToTarget]: (job, settler) => {
			settler.stateContext.jobId = job.jobId
			context.managers.population.transitionSettlerState(settler.id, SettlerState.CarryingItem, {
				jobId: job.jobId
			})
		}
	},
	arrival: {
		[JobPhase.MovingToSource]: (job, settler) => {
			const pickupSuccess = handleTransportPickup(context, job, settler)
			if (!pickupSuccess) {
				context.cancelJob(job.jobId, 'pickup_failed')
				return SettlerState.Idle
			}

			context.advanceJobPhase(job, 'arrived')
			return SettlerState.CarryingItem
		},
		[JobPhase.MovingToTarget]: (job) => {
			const delivered = handleDelivery(context, job)
			if (!delivered) {
				context.cancelJob(job.jobId, 'delivery_failed')
				return SettlerState.Idle
			}
			context.advanceJobPhase(job, 'arrived')
			context.completeJob(job.jobId)
			return SettlerState.Idle
		}
	}
})
