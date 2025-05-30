import { FlagScope } from '../Flags/types'
import { AffinitySentimentType } from '../Affinity/types'
import { FXType } from '../FX/types'
import { Position } from '../types'
import { NPCState } from '../NPC/types'

export interface TimeRange {
	before?: string // format: "HH:MM"
	after?: string // format: "HH:MM"
}

export interface DateRange {
	day?: number
	month?: number
	year?: number
	before?: {
		day?: number
		month?: number
		year?: number
	}
	after?: {
		day?: number
		month?: number
		year?: number
	}
}

export interface FlagCondition {
	exists?: string
	notExists?: string
	scope: FlagScope
	playerId?: string
	mapId?: string
}

export interface QuestCondition {
	canStart?: string
	inProgress?: string
	notInProgress?: string
	completed?: string
}

export interface NPCAffinityCondition {
	sentimentType: AffinitySentimentType
	min?: number
	max?: number
}

export interface NPCAffinityOverallCondition {
	minScore?: number
	maxScore?: number
}

export interface NPCAttributeCondition {
	[attributeName: string]: {
		min?: number
		max?: number
		equals?: any
		exists?: boolean
	}
}

export interface NPCCondition {
	proximity?: number
	id: string
	affinity?: NPCAffinityCondition
	affinityOverall?: NPCAffinityOverallCondition
	attributes?: NPCAttributeCondition
	state?: NPCState
	active?: boolean
}

export interface InventoryCondition {
	has?: {
		itemType: string
		quantity?: number // Default to 1 if not provided
		playerId?: string // Optional, defaults to the current player
	}
}

export interface DialogueCondition {
	id: string
	nodeId: string
	playerId?: string // Optional, defaults to the current player
}

export interface Condition {
	flag?: FlagCondition
	quest?: QuestCondition
	npc?: NPCCondition
	time?: TimeRange
	date?: DateRange
	inventory?: InventoryCondition
	dialogue?: DialogueCondition
}

export interface FlagEffect {
	set?: string
	unset?: string
	scope: FlagScope
	playerId?: string
	mapId?: string
}

export interface QuestEffect {
	start?: string
	progress?: string
}

export interface AffinityEffect {
	sentimentType: AffinitySentimentType
	set?: number
	add?: number
}

export interface FXEffect {
	type: FXType
	payload?: Record<string, any>
}

export interface CutsceneEffect {
	trigger: string
}

export interface EventEffect {
	type: string
	payload: Record<string, any>
}

export interface ChatEffect {
	message?: string
	system?: string
	fullscreen?: string
	emoji?: string
}

export interface NPCAttributeEffect {
	[attributeName: string]: {
		set?: any
		add?: number
		subtract?: number
		remove?: boolean
	}
}

export interface NPCEffect {
	id: string
	goTo?: Position | string | string[] // string for spot name, string[] for random selection from multiple spots
	message?: string
	emoji?: string
	affinity?: AffinityEffect
	attributes?: NPCAttributeEffect
	active?: boolean // can be used to enable/disable NPC
}

export interface ScheduleEffect {
	id: string            // ID of the scheduled event to target
	enabled: boolean      // Set to true to enable the event, false to disable
}

export interface InventoryEffect {
	add?: {
		itemType: string
		quantity?: number // Default to 1 if not provided
		playerId?: string // Optional, defaults to the current player
	}
	remove?: {
		itemType: string
		quantity?: number // Default to 1 if not provided
		playerId?: string // Optional, defaults to the current player
	}
}

export interface Effect {
	flag?: FlagEffect
	event?: EventEffect
	quest?: QuestEffect
	fx?: FXEffect
	cutscene?: CutsceneEffect
	chat?: ChatEffect
	npc?: NPCEffect
	schedule?: ScheduleEffect
	inventory?: InventoryEffect
} 