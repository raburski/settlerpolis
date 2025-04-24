import { Receiver } from './Receiver'
import { PlayersEvents } from './Game/Players/events'
import { ChatEvents } from './Game/Chat/events'
import { SystemEvents } from './Game/System/events'
import { InventoryEvents } from './Game/Inventory/events'
import { NPCEvents } from './Game/NPC/events'
import { ItemsEvents } from './Game/Items/events'
import { LootEvents } from './Game/Loot/events'
import { DialogueEvents } from './Game/Dialogue/events'
import { QuestEvents } from "./Game/Quest/events"
import { MapObjectsEvents } from "./Game/MapObjects/events"
import { FlagsEvents } from "./Game/Flags/events"
import { AffinityEvents } from "./Game/Affinity/events"
import { FXEvents } from "./Game/FX/events"
import { CutsceneEvents } from "./Game/Cutscene/events"
import { MapEvents } from "./Game/Map/events"
import { TimeEvents } from './Game/Time/events'

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
}