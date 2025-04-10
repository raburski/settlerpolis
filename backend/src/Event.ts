import { Receiver } from './Receiver'

// Interface for client operations
export interface EventClient {
	id: string
	currentGroup?: string
	emit(to: Receiver, event: string, data: any, targetClientId?: string): void
	setGroup(group: string): void
}

// Type for event callback functions
export type EventCallback<T = any> = (data: T, client: EventClient) => void
export type TimeoutCallback = (clientId: string) => void

// Interface that NetworkManager implements
export interface EventManager {
	on<T>(event: string, callback: EventCallback<T>): void
	onClientTimeout(callback: TimeoutCallback): void
	getClientsInGroup(group: string): string[]
	emit(to: Receiver, event: string, data: any, groupName?: string): void
}

export const Event = {
	Player: {
		Join: 'player:join',
		Joined: 'player:joined',
		Left: 'player:left',
		Moved: 'player:moved',
		Disconnected: 'player:disconnected',
		TransitionTo: 'player:transition-to'
	},
	Players: {
		List: 'players:list'
	},
	Chat: {
		Message: 'chat:message'
	},
	System: {
		Ping: 'system:ping'
	},
	Inventory: {
		Loaded: 'inventory:loaded',
		Drop: 'inventory:drop',
		PickUp: 'inventory:pickup',
		Consume: 'inventory:consume'
	},
	Scene: {
		AddItems: 'scene:add-items',
		RemoveItems: 'scene:remove-items'
	}
} as const 