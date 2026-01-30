import { v4 as uuidv4 } from 'uuid'
import type { JobTaskContext } from '../TaskContext'
import type { JobAssignment, JobReservation } from '../types'
import { JobPhase, JobReservationType, JobStatus, JobType } from '../types'
import type { JobDefinition } from '../TaskRegistry'
import { SettlerState } from '../../Population/types'
import type { JobsDeps } from '../index'
import type { Logger } from '../../Logs'
import type { ReservationService } from '../ReservationService'

export interface HarvestJobServiceContext {
	managers: JobsDeps
	reservationService: ReservationService
	logger: Logger
	registerJob: (job: JobAssignment) => void
	startJob: (job: JobAssignment) => void
	addReservation: (job: JobAssignment, reservation: JobReservation | null) => void
	getJob: (jobId: string) => JobAssignment | undefined
	getJobs: () => Iterable<JobAssignment>
	advanceJobPhase: (job: JobAssignment, event: 'arrived' | 'harvest_complete' | 'complete') => JobPhase | null
	dispatchPhase: (job: JobAssignment, phase: JobPhase) => void
	cancelJob: (jobId: string, reason?: string) => void
}

export class HarvestJobService {
	constructor(private context: HarvestJobServiceContext) {}

	public requestHarvestJob(settlerId: string, buildingInstanceId: string, resourceNodeId: string): string | null {
		const settler = this.context.managers.population.getSettler(settlerId)
		if (!settler || settler.state !== SettlerState.Idle || settler.stateContext.jobId) {
			return null
		}

		const building = this.context.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			this.context.logger.warn(`[JOBS] Cannot request harvest: Building ${buildingInstanceId} not found`)
			return null
		}

		const node = this.context.managers.resourceNodes.getNode(resourceNodeId)
		if (!node) {
			this.context.logger.warn(`[JOBS] Cannot request harvest: Resource node ${resourceNodeId} not found`)
			return null
		}

		const definition = this.context.managers.resourceNodes.getDefinition(node.nodeType)
		if (!definition) {
			this.context.logger.warn(`[JOBS] Cannot request harvest: Definition for node type ${node.nodeType} not found`)
			return null
		}

		const harvestDurationMs = definition.harvestTimeMs ?? 1000
		const jobId = uuidv4()
		const nodeReservation = this.context.reservationService.reserveNode(resourceNodeId, jobId)
		if (!nodeReservation) {
			this.context.logger.log(`[JOBS] Cannot request harvest: Resource node ${resourceNodeId} already reserved`)
			return null
		}

		const jobAssignment: JobAssignment = {
			jobId,
			settlerId,
			buildingInstanceId,
			jobType: JobType.Harvest,
			priority: 1,
			assignedAt: Date.now(),
			status: JobStatus.Active,
			resourceNodeId,
			itemType: definition.outputItemType,
			quantity: definition.harvestQuantity,
			harvestDurationMs
		}
		this.context.addReservation(jobAssignment, nodeReservation)

		this.context.registerJob(jobAssignment)
		this.context.logger.log(`[JOBS] Created harvest job ${jobAssignment.jobId} for building ${buildingInstanceId}, node=${resourceNodeId}, settler=${settlerId}`)
		this.context.startJob(jobAssignment)

		return jobAssignment.jobId
	}

	public getActiveHarvestJobs(): JobAssignment[] {
		return Array.from(this.context.getJobs())
			.filter(job => job.jobType === JobType.Harvest && job.status === JobStatus.Active)
	}

	public handleHarvestComplete(jobId: string): void {
		const job = this.context.getJob(jobId)
		if (!job || job.jobType !== JobType.Harvest) {
			return
		}

		if (job.phase !== JobPhase.Harvesting) {
			return
		}

		if (!job.resourceNodeId) {
			this.context.cancelJob(jobId, 'resource_missing')
			return
		}

		const node = this.context.managers.resourceNodes.getNode(job.resourceNodeId)
		if (!node || node.remainingHarvests <= 0) {
			this.context.cancelJob(jobId, 'resource_missing')
			return
		}

		const harvestedItem = this.context.managers.resourceNodes.harvestNode(node.id, job.jobId)
		if (!harvestedItem) {
			this.context.cancelJob(jobId, 'harvest_failed')
			return
		}

		job.carriedItemId = harvestedItem.id
		job.itemType = harvestedItem.itemType
		job.quantity = job.quantity || 1
		this.context.removeReservation(job, job.resourceNodeId)

		this.context.advanceJobPhase(job, 'harvest_complete')
		this.context.dispatchPhase(job, job.phase || JobPhase.MovingToTarget)
	}
}

export const createHarvestDefinition = (context: JobTaskContext): JobDefinition => ({
	type: JobType.Harvest,
	initialPhase: () => JobPhase.MovingToResource,
	transitions: {
		[JobPhase.MovingToResource]: {
			arrived: JobPhase.Harvesting
		},
		[JobPhase.Harvesting]: {
			harvest_complete: JobPhase.MovingToTarget
		},
		[JobPhase.MovingToTarget]: {
			arrived: JobPhase.Completed
		}
	},
	dispatch: {
		[JobPhase.MovingToResource]: (job, settler) => {
			settler.stateContext.jobId = job.jobId
			context.managers.population.transitionSettlerState(settler.id, SettlerState.MovingToResource, {
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
		[JobPhase.MovingToResource]: (job) => {
			context.advanceJobPhase(job, 'arrived')
			job.harvestStartedAtMs = context.getSimulationTimeMs()
			return SettlerState.Harvesting
		},
		[JobPhase.MovingToTarget]: (job, settler) => {
			if (!job.itemType || !job.quantity) {
				context.cancelJob(job.jobId, 'delivery_failed')
				return SettlerState.Idle
			}

			const delivered = context.managers.storage?.addToStorage(job.buildingInstanceId, job.itemType, job.quantity) ?? false
			if (!delivered) {
				context.cancelJob(job.jobId, 'delivery_failed')
				return SettlerState.Idle
			}
			context.advanceJobPhase(job, 'arrived')
			context.completeJob(job.jobId)
			const assignedWorkers = context.managers.buildings.getBuildingWorkers(job.buildingInstanceId)
			if (assignedWorkers.includes(settler.id)) {
				return SettlerState.Working
			}
			return SettlerState.Idle
		}
	}
})
