import { SettlerState } from '../types'
import { StateTransitionsConfig } from './types'
import { Idle_MovingToTool } from './Idle_MovingToTool'
import { Idle_MovingToBuilding } from './Idle_MovingToBuilding'
import { Idle_MovingToItem } from './Idle_MovingToItem'
import { Idle_MovingToResource } from './Idle_MovingToResource'
import { Idle_Idle } from './Idle_Idle'
import { MovingToTool_MovingToBuilding } from './MovingToTool_MovingToBuilding'
import { MovingToTool_Idle } from './MovingToTool_Idle'
import { MovingToBuilding_Working } from './MovingToBuilding_Working'
import { MovingToBuilding_Idle } from './MovingToBuilding_Idle'
import { MovingToItem_CarryingItem } from './MovingToItem_CarryingItem'
import { MovingToResource_CarryingItem } from './MovingToResource_CarryingItem'
import { CarryingItem_Idle } from './CarryingItem_Idle'
import { CarryingItem_Working } from './CarryingItem_Working'
import { Working_Idle } from './Working_Idle'

export const SETTLER_STATE_TRANSITIONS: StateTransitionsConfig = {
	[SettlerState.Idle]: {
		[SettlerState.MovingToTool]: Idle_MovingToTool,
		[SettlerState.MovingToBuilding]: Idle_MovingToBuilding,
		[SettlerState.MovingToItem]: Idle_MovingToItem,
		[SettlerState.MovingToResource]: Idle_MovingToResource,
		[SettlerState.Idle]: Idle_Idle // Self-transition for idle wandering
	},
	[SettlerState.MovingToTool]: {
		[SettlerState.MovingToBuilding]: MovingToTool_MovingToBuilding,
		[SettlerState.Idle]: MovingToTool_Idle
	},
	[SettlerState.MovingToBuilding]: {
		[SettlerState.Working]: MovingToBuilding_Working,
		[SettlerState.Idle]: MovingToBuilding_Idle
	},
	[SettlerState.MovingToItem]: {
		[SettlerState.CarryingItem]: MovingToItem_CarryingItem
	},
	[SettlerState.MovingToResource]: {
		[SettlerState.CarryingItem]: MovingToResource_CarryingItem
	},
	[SettlerState.CarryingItem]: {
		[SettlerState.Idle]: CarryingItem_Idle,
		[SettlerState.Working]: CarryingItem_Working
	},
	[SettlerState.Working]: {
		[SettlerState.Idle]: Working_Idle,
		[SettlerState.MovingToResource]: Idle_MovingToResource
	}
}

// Export all transitions for testing
export {
	Idle_MovingToTool,
	Idle_MovingToBuilding,
	Idle_MovingToItem,
	Idle_Idle,
	MovingToTool_MovingToBuilding,
	MovingToTool_Idle,
	MovingToBuilding_Working,
	MovingToBuilding_Idle,
	MovingToItem_CarryingItem,
	Idle_MovingToResource,
	MovingToResource_CarryingItem,
	CarryingItem_Idle,
	CarryingItem_Working,
	Working_Idle
}
