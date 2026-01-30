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
		
		if (!managers.jobs) return false
		const job = managers.jobs.getJob(jobId)
		if (!job) return false
		
		const building = managers.buildings.getBuildingInstance(job.buildingInstanceId)
		return building !== undefined && managers.buildings.getBuildingNeedsWorkers(job.buildingInstanceId)
	},
	
	action: (settler, context, managers) => {
		const jobId = settler.stateContext.jobId
		if (!jobId) {
			throw new Error(`No jobId found in stateContext`)
		}
		
		if (!managers.jobs) {
			throw new Error(`JobsManager not available`)
		}
		
		const job = managers.jobs.getJob(jobId)
		if (!job) {
			throw new Error(`Job ${jobId} not found`)
		}
		
		const buildingInstanceId = job.buildingInstanceId
		const buildingPosition = managers.buildings.getBuildingPosition(buildingInstanceId)
		if (!buildingPosition) {
			throw new Error(`Building ${buildingInstanceId} not found`)
		}
		
		managers.logger.log(`[TRANSITION ACTION] MovingToTool -> MovingToBuilding | settler=${settler.id} | jobId=${jobId} | buildingId=${buildingInstanceId} | buildingPosition=(${Math.round(buildingPosition.x)},${Math.round(buildingPosition.y)})`)
		
		// Update state
		settler.state = SettlerState.MovingToBuilding
		settler.stateContext = {
			targetId: buildingInstanceId,
			targetPosition: buildingPosition,
			targetType: 'building',
			jobId: jobId
		}
		
		// Start movement to building
		const movementStarted = managers.movement.moveToPosition(settler.id, buildingPosition, {
			targetType: 'building',
			targetId: buildingInstanceId
		})
		managers.logger.log(`[MOVEMENT REQUESTED] MovingToTool -> MovingToBuilding | settler=${settler.id} | movementStarted=${movementStarted}`)
	},
	
	completed: (settler, managers) => {
		if (!managers.jobs) {
			return null
		}
		return managers.jobs.handleSettlerArrival(settler)
	}
}
