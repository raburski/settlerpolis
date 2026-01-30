import { StateTransition, BuildingArrivalContext } from './types'
import { SettlerState } from '../types'

export const MovingToBuilding_Idle: StateTransition<BuildingArrivalContext> = {
	condition: (settler, context) => {
		// Building no longer needs workers
		return true
	},
	
	validate: (settler, context, managers) => {
		// Verify building doesn't need workers
		return !managers.buildings.getBuildingNeedsWorkers(context.buildingInstanceId)
	},
	
	action: (settler, context, managers) => {
		// Update state to Idle
		settler.state = SettlerState.Idle
		settler.stateContext = {}
	}
}

