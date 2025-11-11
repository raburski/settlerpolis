import { StateTransition, BuildingArrivalContext } from './types'
import { SettlerState, JobType } from '../types'
import { Receiver } from '../../Receiver'
import { PopulationEvents } from '../events'
import { ConstructionStage } from '../../Buildings/types'

export const MovingToBuilding_Working: StateTransition<BuildingArrivalContext> = {
	condition: (settler, context) => {
		// Settler has jobId in stateContext (job should already exist)
		const jobId = settler.stateContext.jobId
		return jobId !== undefined
	},
	
	validate: (settler, context, managers) => {
		// Get jobId from stateContext
		const jobId = settler.stateContext.jobId
		if (!jobId) return false
		
		// Verify job exists
		if (!managers.jobsManager) return false
		const job = managers.jobsManager.getJob(jobId)
		if (!job) return false
		
		// Verify building still needs workers
		const building = managers.buildingManager.getBuildingInstance(job.buildingInstanceId)
		return building !== undefined && managers.buildingManager.getBuildingNeedsWorkers(job.buildingInstanceId)
	},
	
	action: (settler, context, managers) => {
		// Get jobId from stateContext (job should already exist with status='pending')
		const jobId = settler.stateContext.jobId
		if (!jobId) {
			throw new Error(`[MovingToBuilding_Working] No jobId found in stateContext`)
		}
		
		if (!managers.jobsManager) {
			throw new Error(`[MovingToBuilding_Working] JobsManager not available`)
		}
		
		const job = managers.jobsManager.getJob(jobId)
		if (!job) {
			throw new Error(`[MovingToBuilding_Working] Job ${jobId} not found`)
		}
		
		const buildingInstanceId = job.buildingInstanceId
		
		// Assign worker to job (JobsManager will update job status and assign worker to building)
		managers.jobsManager.assignWorkerToJob(jobId, settler.id)
		
		// Update state
		settler.state = SettlerState.Working
		settler.stateContext = {
			jobId: jobId
		}
		settler.currentJob = job
		settler.buildingId = buildingInstanceId
		
		// Emit worker assigned event
		managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.WorkerAssigned, {
			jobAssignment: job,
			settlerId: settler.id,
			buildingInstanceId
		}, settler.mapName)
	}
}

