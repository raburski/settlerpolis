import { Effect, Condition } from '../ConditionEffect/types'
import type { ItemType } from '../Items/types'
import type { NPCId, PlayerId, QuestId } from '../ids'

export type { QuestId } from '../ids'

export enum QuestScope {
	Player = 'player',
	Global = 'global',
	Shared = 'shared'
}

export interface QuestSettings {
	repeatable: boolean
	scope: QuestScope
}

export interface QuestStep {
	id: string
	label: string
	optional?: boolean
	npcId?: NPCId // The NPC that needs to be talked to
	dialogue?: {
		id: string
		nodeId: string
	}
	condition?: Condition
	effect?: Effect
}

export interface QuestReward {
	exp?: number
	items?: Array<{
		id: ItemType
		qty: number
	}>
}

export interface Quest {
	id: QuestId
	chapter: number
	title: string
	description: string
	settings?: QuestSettings
	steps: QuestStep[]
	reward?: QuestReward
	startCondition?: Condition // Condition that must be met to start the quest
	startEffect?: Effect // Effect that is applied when the quest starts
}

export interface QuestProgress {
	questId: QuestId
	currentStep: number
	completed: boolean
	completedSteps: string[]
}

export interface PlayerQuestState {
	activeQuests: QuestProgress[]
	completedQuests: QuestId[]
}

export interface QuestStartRequest {
	questId: QuestId
	playerId: PlayerId
}

export interface QuestUpdateResponse {
	questId: QuestId
	progress: QuestProgress
}

export interface QuestListResponse {
	quests: QuestProgress[]
}

export interface QuestCompleteResponse {
	questId: QuestId
	reward?: QuestReward
	summary?: string
} 
