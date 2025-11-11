import { StateTransition, ToolPickupContext } from './types'
import { SettlerState } from '../types'

export const MovingToTool_Idle: StateTransition<ToolPickupContext> = {
	condition: (settler, context) => {
		// Settler has no jobId after picking up tool (job was cancelled or no assignment)
		return settler.stateContext.jobId === undefined
	},
	
	validate: (settler, context, managers) => {
		// Tool was successfully picked up, but no job assignment
		return true
	},
	
	action: (settler, context, managers) => {
		// Update state to Idle and clear context
		settler.state = SettlerState.Idle
		settler.stateContext = {}
		settler.currentJob = undefined
	}
}

