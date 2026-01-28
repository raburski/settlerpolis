import { StateTransition, BuildingArrivalContext } from './types'
import { SettlerState } from '../types'

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
		return !!job
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

		// Update state
		settler.state = SettlerState.Working
		settler.stateContext = {
			jobId: jobId
		}
		settler.buildingId = buildingInstanceId
	}
}
