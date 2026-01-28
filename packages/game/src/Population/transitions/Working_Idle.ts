import { StateTransition, WorkerUnassignContext } from './types'
import { SettlerState, JobType } from '../types'
import { Receiver } from '../../Receiver'
import { PopulationEvents } from '../events'

export const Working_Idle: StateTransition<WorkerUnassignContext> = {
	condition: (settler, context) => {
		// Settler is currently working
		return settler.state === SettlerState.Working
	},
	
	validate: (settler, context, managers) => {
		// Verify settler has a job
		return settler.currentJob !== undefined
	},
	
	action: (settler, context, managers) => {
		const job = settler.currentJob!
		
		// Cancel movement if any
		managers.movementManager.cancelMovement(settler.id)
		
		// Unassign worker from building
		managers.buildingManager.unassignWorker(job.buildingInstanceId, settler.id)
		
		// Update state
		settler.state = SettlerState.Idle
		settler.stateContext = {}
		settler.currentJob = undefined
		settler.buildingId = undefined
		
		// Emit worker unassigned event
		managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.WorkerUnassigned, {
			settlerId: settler.id,
			buildingInstanceId: job.buildingInstanceId,
			jobId: job.jobId
		}, settler.mapName)
	}
}

