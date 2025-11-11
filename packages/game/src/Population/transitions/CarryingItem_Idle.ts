import { StateTransition } from './types'
import { SettlerState } from '../types'

// Simple transition from CarryingItem to Idle
// Item delivery is handled by MovingToItem_CarryingItem.completed callback
// This transition just clears the state
export const CarryingItem_Idle: StateTransition = {
	action: (settler) => {
		// Clear state - delivery was already handled by MovingToItem_CarryingItem.completed
		settler.state = SettlerState.Idle
		settler.stateContext = {}
		// Note: currentJob was already cleared by MovingToItem_CarryingItem.completed
	}
}

