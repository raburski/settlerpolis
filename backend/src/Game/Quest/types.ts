export interface QuestStep {
	id: string
	label: string
	optional?: boolean
	completeOn: {
		event: string
		condition: Record<string, any>
	}
	then?: {
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
	start: {
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