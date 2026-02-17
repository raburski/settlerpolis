import type { Quest, QuestProgress, PlayerQuestState } from './types'
import type { QuestSnapshot } from '../state/types'

export class QuestManagerState {
	public quests: Map<string, Quest> = new Map()
	public playerQuestStates: Map<string, PlayerQuestState> = new Map()
	public globalQuestStates: Map<string, QuestProgress> = new Map()
	public sharedQuestStates: Map<string, QuestProgress> = new Map()

	/* SERIALISATION */
	public serialize(): QuestSnapshot {
		return {
			playerQuestStates: Array.from(this.playerQuestStates.entries()).map(([playerId, state]) => ([
				playerId,
				{
					...state,
					activeQuests: state.activeQuests.map(progress => ({ ...progress, completedSteps: [...progress.completedSteps] })),
					completedQuests: [...state.completedQuests]
				}
			])),
			globalQuestStates: Array.from(this.globalQuestStates.entries()).map(([questId, progress]) => ([
				questId,
				{ ...progress, completedSteps: [...progress.completedSteps] }
			])),
			sharedQuestStates: Array.from(this.sharedQuestStates.entries()).map(([questId, progress]) => ([
				questId,
				{ ...progress, completedSteps: [...progress.completedSteps] }
			]))
		}
	}

	public deserialize(state: QuestSnapshot): void {
		this.playerQuestStates.clear()
		this.globalQuestStates.clear()
		this.sharedQuestStates.clear()

		for (const [playerId, questState] of state.playerQuestStates) {
			this.playerQuestStates.set(playerId, {
				...questState,
				activeQuests: questState.activeQuests.map(progress => ({ ...progress, completedSteps: [...progress.completedSteps] })),
				completedQuests: [...questState.completedQuests]
			})
		}
		for (const [questId, progress] of state.globalQuestStates) {
			this.globalQuestStates.set(questId, { ...progress, completedSteps: [...progress.completedSteps] })
		}
		for (const [questId, progress] of state.sharedQuestStates) {
			this.sharedQuestStates.set(questId, { ...progress, completedSteps: [...progress.completedSteps] })
		}
	}

	public reset(): void {
		this.playerQuestStates.clear()
		this.globalQuestStates.clear()
		this.sharedQuestStates.clear()
	}
}
