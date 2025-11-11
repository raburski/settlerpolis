import { StateTransition, ToolPickupContext } from './types'
import { SettlerState } from '../types'

export const MovingToTool_MovingToBuilding: StateTransition<ToolPickupContext> = {
	condition: (settler, context) => {
		// Settler has jobId after picking up tool
		return settler.stateContext.jobId !== undefined
	},
	
	validate: (settler, context, managers) => {
		// Verify job exists and building still needs workers
		const jobId = settler.stateContext.jobId
		if (!jobId) return false
		
		if (!managers.jobsManager) return false
		const job = managers.jobsManager.getJob(jobId)
		if (!job) return false
		
		const building = managers.buildingManager.getBuildingInstance(job.buildingInstanceId)
		return building !== undefined && managers.buildingManager.getBuildingNeedsWorkers(job.buildingInstanceId)
	},
	
	action: (settler, context, managers) => {
		const jobId = settler.stateContext.jobId
		if (!jobId) {
			throw new Error(`No jobId found in stateContext`)
		}
		
		if (!managers.jobsManager) {
			throw new Error(`JobsManager not available`)
		}
		
		const job = managers.jobsManager.getJob(jobId)
		if (!job) {
			throw new Error(`Job ${jobId} not found`)
		}
		
		const buildingInstanceId = job.buildingInstanceId
		const building = managers.buildingManager.getBuildingInstance(buildingInstanceId)!
		const buildingPosition = managers.buildingManager.getBuildingPosition(buildingInstanceId)!
		
		managers.logger.log(`[TRANSITION ACTION] MovingToTool -> MovingToBuilding | settler=${settler.id} | jobId=${jobId} | buildingId=${buildingInstanceId} | buildingPosition=(${Math.round(buildingPosition.x)},${Math.round(buildingPosition.y)})`)
		
		// Update state
		settler.state = SettlerState.MovingToBuilding
		settler.stateContext = {
			targetId: buildingInstanceId,
			targetPosition: buildingPosition,
			jobId: jobId
		}
		
		// Start movement to building
		const movementStarted = managers.movementManager.moveToPosition(settler.id, buildingPosition, {
			targetType: 'building',
			targetId: buildingInstanceId
		})
		managers.logger.log(`[MOVEMENT REQUESTED] MovingToTool -> MovingToBuilding | settler=${settler.id} | movementStarted=${movementStarted}`)
	},
	
	completed: (settler, managers) => {
		// When movement to building completes, transition to Working
		return SettlerState.Working
	}
}

