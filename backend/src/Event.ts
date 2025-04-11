import { Receiver } from './Receiver'

// Interface for client operations
export interface EventClient {
	id: string
	currentGroup: string
	emit(to: Receiver, event: string, data: any, targetClientId?: string): void
	setGroup(group: string): void
}

// Type for event callback functions
export type EventCallback<T = any> = (data: T, client: EventClient) => void
export type LifecycleCallback = (client: EventClient) => void

// Interface that NetworkManager implements
export interface EventManager {
	on<T>(event: string, callback: EventCallback<T>): void
	onJoined(callback: LifecycleCallback): void
	onLeft(callback: LifecycleCallback): void
	emit(to: Receiver, event: string, data: any, groupName?: string): void
}

export const Event = {
	Player: {
		CS: {
			Join: 'cs:player:join',
			Moved: 'cs:player:moved',
			TransitionTo: 'cs:player:transition-to'
		},
		SC: {
			Joined: 'sc:player:joined',
			Left: 'sc:player:left',
			Disconnected: 'sc:player:disconnected'
		}
	},
	Players: {
		SC: {
			List: 'sc:players:list'
		}
	},
	Chat: {
		CS: {
			Send: 'cs:chat:send'
		},
		SC: {
			Receive: 'sc:chat:receive',
			SystemMessage: 'sc:chat:system_message'
		}
	},
	System: {
		CS: {
			Ping: 'cs:system:ping'
		}
	},
	Inventory: {
		CS: {
			Drop: 'cs:inventory:drop',
			PickUp: 'cs:inventory:pickup',
			Consume: 'cs:inventory:consume'
		},
		SC: {
			Loaded: 'sc:inventory:loaded'
		}
	},
	Scene: {
		SC: {
			AddItems: 'sc:scene:add-items',
			RemoveItems: 'sc:scene:remove-items'
		}
	},
	NPC: {
		CS: {
			Interact: 'cs:npc:interact',
			Dialog: 'cs:npc:dialog',
			CloseDialog: 'cs:npc:close-dialog'
		},
		SC: {
			List: 'sc:npc:list',
			Message: 'sc:npc:message',
			Dialog: 'sc:npc:dialog'
		}
	}
} as const 