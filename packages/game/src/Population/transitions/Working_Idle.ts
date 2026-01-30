import { StateTransition, WorkerUnassignContext } from './types'
import { SettlerState } from '../types'

export const Working_Idle: StateTransition<WorkerUnassignContext> = {
	condition: (settler, context) => {
		// Settler is currently working
		return settler.state === SettlerState.Working
	},
	
	validate: (settler, context, managers) => {
		return true
	},
	
	action: (settler, context, managers) => {
		// Cancel movement if any
		managers.movement.cancelMovement(settler.id)

		// Update state
		settler.state = SettlerState.Idle
		settler.stateContext = {}
		settler.buildingId = undefined
	}
}
