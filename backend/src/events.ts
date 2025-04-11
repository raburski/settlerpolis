import { Receiver } from './Receiver'
import { PlayerEvents } from './Game/Players/events'
import { ChatEvents } from './Game/Chat/events'
import { SystemEvents } from './Game/System/events'
import { InventoryEvents } from './Game/Inventory/events'
import { SceneEvents } from './Game/Scene/events'
import { NPCEvents } from './Game/NPC/events'
import { ItemsEvents } from './Game/Items/events'

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
	Player: PlayerEvents,
	Chat: ChatEvents,
	System: SystemEvents,
	Inventory: InventoryEvents,
	Scene: SceneEvents,
	NPC: NPCEvents,
	Items: ItemsEvents
} as const 