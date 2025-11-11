import { StateTransition, RequestWorkerHasProfessionContext } from './types'
import { SettlerState } from '../types'

export const Idle_MovingToBuilding: StateTransition<RequestWorkerHasProfessionContext> = {
	condition: (settler, context) => {
		// Settler has required profession (or no profession required)
		return !context.requiredProfession || settler.profession === context.requiredProfession
	},
	
	validate: (settler, context, managers) => {
		// Verify building exists and needs workers
		const building = managers.buildingManager.getBuildingInstance(context.buildingInstanceId)
		return building !== undefined && managers.buildingManager.getBuildingNeedsWorkers(context.buildingInstanceId)
	},
	
	action: (settler, context, managers) => {
		// Get jobId from stateContext (should be set by assignWorkerToJob before calling this transition)
		const jobId = settler.stateContext.jobId
		if (!jobId) {
			throw new Error(`[Idle_MovingToBuilding] No jobId found in stateContext`)
		}
		
		managers.logger.log(`[TRANSITION ACTION] Idle -> MovingToBuilding | settler=${settler.id} | jobId=${jobId} | buildingId=${context.buildingInstanceId} | buildingPosition=(${Math.round(context.buildingPosition.x)},${Math.round(context.buildingPosition.y)})`)
		
		// Update state
		settler.state = SettlerState.MovingToBuilding
		settler.stateContext = {
			targetId: context.buildingInstanceId,
			targetPosition: context.buildingPosition,
			jobId: jobId
		}
		
		// Start movement to building
		const movementStarted = managers.movementManager.moveToPosition(settler.id, context.buildingPosition, {
			targetType: 'building',
			targetId: context.buildingInstanceId
		})
		managers.logger.log(`[MOVEMENT REQUESTED] Idle -> MovingToBuilding | settler=${settler.id} | movementStarted=${movementStarted}`)
	},
	
	completed: (settler, managers) => {
		// When movement to building completes, transition to Working
		return SettlerState.Working
	}
}

