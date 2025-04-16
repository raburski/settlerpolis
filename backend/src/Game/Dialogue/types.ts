import { FlagScope } from '../Flags/types'
import { AffinitySentimentType } from '../Affinity/types'

export interface DialogueNode {
	speaker?: string
	text?: string
	options?: DialogueOption[]
	next?: string
	event?: DialogueEvent
	item?: DialogueItem
}

export interface DialogueOption {
	id: string
	text: string
	next?: string
	item?: DialogueItem
	condition?: DialogueCondition
	conditions?: DialogueCondition[]
	effect?: DialogueEffect
	effects?: DialogueEffect[]
}

export interface DialogueEvent {
	type: string
	payload: Record<string, any>
}

export interface DialogueItem {
	id?: string
	itemType: string
}

export interface DialogueTreePartial {
	id?: string
	npcId?: string
	nodes: Record<string, DialogueNode>
	startNode?: string
}

export interface DialogueTree extends DialogueTreePartial {
	id: string
	startNode: string
	npcId: string
}

export interface DialogueTriggerData {
	dialogueId: string
	node: DialogueNode
}

export interface DialogueContinueData {
	dialogueId: string
}

export interface DialogueChoiceData {
	dialogueId: string
	choiceId: string
}

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

export interface DialogueCondition {
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

export interface DialogueEffect {
	flag?: FlagEffect
	event?: DialogueEvent
	quest?: QuestEffect
	affinity?: AffinityEffect
}
