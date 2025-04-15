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
	npcId?: string // The NPC that needs to be talked to
	dialogue?: {
		id: string
		nodeId: string
	}
	completeWhen: {
		event: string
		inventory?: {
			itemType: string
			quantity: number
		}
		condition?: Record<string, any>
		payload?: Record<string, any>
	}
	onComplete?: {
		triggerDialogue?: string
		setWorldState?: Record<string, any>
		logMessage?: string
		fx?: {
			play: string
		}
	}
}

export interface QuestReward {
	items?: Array<{
		id: string
		qty: number
	}>
	exp?: number
}

export interface Quest {
	id: string
	chapter: number
	title: string
	description: string
	settings?: QuestSettings
	start?: {
		onEvent: string
		dialogueId: string
	}
	steps: QuestStep[]
	reward?: QuestReward
}

export interface QuestProgress {
	questId: string
	currentStep: number
	completed: boolean
	completedSteps: string[]
}

export interface PlayerQuestState {
	activeQuests: QuestProgress[]
	completedQuests: string[]
}

export interface QuestStartRequest {
	questId: string
	playerId: string
}

export interface QuestUpdateResponse {
	questId: string
	progress: QuestProgress
}

export interface QuestListResponse {
	quests: QuestProgress[]
}

export interface QuestCompleteResponse {
	questId: string
	reward?: QuestReward
	summary?: string
} 