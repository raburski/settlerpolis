import { ItemMetadata } from './Items/types'
import { Quest } from './Quest/types'
import { AffinitySentiments } from './Affinity/types'
import { Cutscene } from './Cutscene/types'
import { Flag } from './Flags/types'
import { ScheduledEvent, ScheduleOptions } from './Scheduler/types'
import { Trigger } from './Triggers/types'
import { NPC, NPCAssets } from "./NPC/types"
import { DialogueTreePartial } from './Dialogue/types'
import { TiledMap } from "./types"
import { BuildingDefinition } from './Buildings/types'
import { ProfessionDefinition, ProfessionToolDefinition } from './Population/types'

export interface NPCContent extends NPC {
	sentiments?: AffinitySentiments
	dialogues?: DialogueTreePartial[]
	assets?: NPCAssets // Required assets for the NPC
	triggers?: Trigger[] // Optional triggers specific to this NPC
	schedules?: ScheduleOptions[] // Optional schedules specific to this NPC
}

export interface StartingItem {
	itemType: string
	offset?: {
		x?: number // Offset in tiles or pixels (depending on tileBased)
		y?: number // Offset in tiles or pixels (depending on tileBased)
		tileBased?: boolean // If true, offsets are in tiles (default: true). If false, offsets are in pixels.
	}
}

export interface StartingPopulation {
	profession: string // ProfessionType
	count: number // Number of settlers with this profession to spawn
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
	buildings?: BuildingDefinition[]
	professions?: ProfessionDefinition[]
	professionTools?: ProfessionToolDefinition[]
	startingItems?: StartingItem[] // Items to spawn at player start location
	startingPopulation?: StartingPopulation[] // Settlers to spawn at player start location
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
export * from './Buildings/types'
export * from './Population/types'
export * from './Production/types'
export * from './Storage/types'
export * from './Simulation/types'
