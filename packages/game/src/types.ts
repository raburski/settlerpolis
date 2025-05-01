import { ItemMetadata } from './Items/types'
import { Quest } from './Quest/types'
import { AffinitySentiments } from './Affinity/types'
import { Cutscene } from './Cutscene/types'
import { Flag } from './Flags/types'
import { ScheduledEvent, ScheduleOptions } from './Scheduler/types'
import { Trigger } from './Triggers/types'
import { NPC } from "./NPC/types"
import { DialogueTreePartial } from './Dialogue/types'
import { TiledMap } from "./types"

export interface NPCContent extends NPC {
	sentiments?: AffinitySentiments
	dialogues?: DialogueTreePartial[]
}

export interface GameContent {
	items: ItemMetadata[]
	quests: Quest[]
	npcs: NPCContent[]
	cutscenes: Cutscene[]
	flags: Flag[]
	schedules: ScheduleOptions[]
	triggers: Trigger[]
	maps: Record<string, TiledMap>,
	defaultMap?: string // Optional default map ID to load initially
}

export interface Position {
	x: number
	y: number
}

export { Receiver } from './Receiver'

// Re-export types from modules
export * from './Affinity/types' 
export * from './Players/types'
export * from './Chat/types'
export * from './NPC/types'
export * from './Inventory/types'
export * from './Dialogue/types'
export * from './MapObjects/types'
export * from './Cutscene/types'
export * from './Flags/types'
export * from './FX/types'
export * from './Items/types'
export * from './Loot/types'
export * from './Map/types'
export * from './Quest/types'
export * from './Scheduler/types'
export * from './Time/types'
export * from './Triggers/types' 
