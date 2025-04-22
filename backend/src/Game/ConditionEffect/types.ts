import { FlagScope } from '../Flags/types'
import { AffinitySentimentType } from '../Affinity/types'
import { FXType } from '../FX/types'
import { Position } from '../../types'

export interface FlagCondition {
	exists?: string
	notExists?: string
	scope: FlagScope
	playerId?: string
	mapId?: string
}

export interface QuestCondition {
	canStart: string
}

export interface AffinityCondition {
	sentimentType: AffinitySentimentType
	min?: number
	max?: number
}

export interface AffinityOverallCondition {
	minScore?: number
	maxScore?: number
}

export interface Condition {
	flag?: FlagCondition
	quest?: QuestCondition
	affinity?: AffinityCondition
	affinityOverall?: AffinityOverallCondition
}

export interface FlagEffect {
	set?: string
	unset?: string
	scope: FlagScope
	playerId?: string
	mapId?: string
}

export interface QuestEffect {
	start: string
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

export interface NPCEffect {
	npcId: string
	goTo: Position | string // string for spot name
}

export interface Effect {
	flag?: FlagEffect
	event?: EventEffect
	quest?: QuestEffect
	affinity?: AffinityEffect
	fx?: FXEffect
	cutscene?: CutsceneEffect
	chat?: ChatEffect
	npc?: NPCEffect
} 