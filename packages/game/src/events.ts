import { Receiver } from './Receiver'
import { PlayersEvents } from './Players/events'
import { ChatEvents } from './Chat/events'
import { SystemEvents } from './System/events'
import { InventoryEvents } from './Inventory/events'
import { NPCEvents } from './NPC/events'
import { ItemsEvents } from './Items/events'
import { LootEvents } from './Loot/events'
import { DialogueEvents } from './Dialogue/events'
import { QuestEvents } from "./Quest/events"
import { MapObjectsEvents } from "./MapObjects/events"
import { FlagsEvents } from "./Flags/events"
import { AffinityEvents } from "./Affinity/events"
import { FXEvents } from "./FX/events"
import { CutsceneEvents } from "./Cutscene/events"
import { MapEvents } from "./Map/events"
import { TimeEvents } from './Time/events'

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
	Players: PlayersEvents,
	Chat: ChatEvents,
	System: SystemEvents,
	Inventory: InventoryEvents,
	NPC: NPCEvents,
	Items: ItemsEvents,
	Loot: LootEvents,
	Dialogue: DialogueEvents,
	Quest: QuestEvents,
	MapObjects: MapObjectsEvents,
	Flags: FlagsEvents,
	Affinity: AffinityEvents,
	FX: FXEvents,
	Cutscene: CutsceneEvents,
	Map: MapEvents,
	Time: TimeEvents,
} as const

export default Event 