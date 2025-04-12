import { EventManager, Event, EventClient } from '../../events'
import { Receiver } from '../../Receiver'
import { QuestEvents } from './events'
import {
	Quest,
	QuestProgress,
	PlayerQuestState,
	QuestStartRequest,
	QuestUpdateResponse,
	QuestListResponse,
	QuestCompleteResponse
} from './types'
import { AllQuests } from './quests'

export class QuestManager {
	private quests: Map<string, Quest> = new Map()
	private playerQuestStates: Map<string, PlayerQuestState> = new Map()
	private eventToQuestSteps: Map<string, Array<{ questId: string, stepIndex: number }>> = new Map()

	constructor(private event: EventManager) {
		this.loadQuests()
		this.setupEventHandlers()
	}

	private loadQuests() {
		for (const quest of AllQuests) {
			this.quests.set(quest.id, quest)
			
			// Index quest steps by their trigger events
			quest.steps.forEach((step, index) => {
				const event = step.completeOn.event
				if (!this.eventToQuestSteps.has(event)) {
					this.eventToQuestSteps.set(event, [])
				}
				this.eventToQuestSteps.get(event)?.push({
					questId: quest.id,
					stepIndex: index
				})
			})
		}
	}

	private setupEventHandlers() {
		this.event.on<QuestStartRequest>(
			QuestEvents.SS.Start,
			(data: QuestStartRequest, client: EventClient) => {
				const quest = this.quests.get(data.questId)
				if (!quest) {
					return
				}

				const playerState = this.getOrCreatePlayerState(data.playerId)
				if (playerState.completedQuests.includes(data.questId)) {
					return
				}

				const progress: QuestProgress = {
					questId: data.questId,
					currentStep: 0,
					completed: false,
					completedSteps: []
				}

				playerState.activeQuests.push(progress)
				this.savePlayerState(data.playerId, playerState)

				const response: QuestUpdateResponse = {
					questId: data.questId,
					progress
				}
				client.emit(Receiver.Sender, QuestEvents.SC.Update, response)
			}
		)

		// Handle player connection
		this.event.on(
			Event.Players.CS.Connect,
			(data: { playerId: string }, client: EventClient) => {
				const playerState = this.getOrCreatePlayerState(client.id)
				const response: QuestListResponse = {
					quests: playerState.activeQuests
				}
				client.emit(Receiver.Sender, QuestEvents.SC.List, response)
			}
		)

		// Set up listeners for each unique event type used in quests
		for (const [eventName, questSteps] of this.eventToQuestSteps) {
			this.event.on(eventName, (data: any, client: EventClient) => {
				if (!client.id) return

				const playerState = this.getOrCreatePlayerState(client.id)
				
				// Check each quest step that listens to this event
				for (const { questId, stepIndex } of questSteps) {
					const questProgress = playerState.activeQuests.find(q => q.questId === questId)
					if (!questProgress || questProgress.completed) continue

					const quest = this.quests.get(questId)
					if (!quest) continue

					// Only check if this is the current step
					if (questProgress.currentStep === stepIndex) {
						const step = quest.steps[stepIndex]
						if (this.checkStepCompletion(step, data)) {
							this.completeStep(client.id, questProgress, quest, step, client)
						}
					}
				}
			})
		}
	}

	private checkStepCompletion(
		step: Quest['steps'][number],
		eventData: any
	): boolean {
		for (const [key, value] of Object.entries(step.completeOn.condition)) {
			if (eventData[key] !== value) {
				return false
			}
		}
		return true
	}

	private completeStep(
		playerId: string,
		progress: QuestProgress,
		quest: Quest,
		step: Quest['steps'][number],
		client: EventClient
	) {
		progress.completedSteps.push(step.id)

		// Handle step completion effects
		if (step.then) {
			if (step.then.triggerDialogue) {
				this.event.emit(Receiver.All, 'ss:dialogue:trigger', {
					dialogueId: step.then.triggerDialogue,
					playerId
				})
			}

			if (step.then.setWorldState) {
				this.event.emit(Receiver.All, 'ss:world:state:update', {
					...step.then.setWorldState,
					playerId
				})
			}

			// if (step.then.logMessage) {
			// 	client.emit(Receiver.Sender, 'ss:log:message', {
			// 		message: step.then.logMessage,
			// 		playerId
			// 	})
			// }

			// if (step.then.fx?.play) {
			// 	client.emit(Receiver.Sender, 'ss:fx:play', {
			// 		fxId: step.then.fx.play,
			// 		playerId
			// 	})
			// }
		}

		// Emit step completion event
		client.emit(Receiver.Sender, QuestEvents.SC.StepComplete, {
			questId: quest.id,
			stepId: step.id,
			playerId
		})

		// Check if this was the last step
		if (progress.currentStep === quest.steps.length - 1) {
			this.completeQuest(playerId, progress, quest, client)
		} else {
			progress.currentStep++
			const response: QuestUpdateResponse = {
				questId: quest.id,
				progress
			}
			client.emit(Receiver.Sender, QuestEvents.SC.Update, response)
		}

		const playerState = this.getOrCreatePlayerState(playerId)
		this.savePlayerState(playerId, playerState)
	}

	private completeQuest(
		playerId: string,
		progress: QuestProgress,
		quest: Quest,
		client: EventClient
	) {
		progress.completed = true
		const playerState = this.getOrCreatePlayerState(playerId)
		playerState.completedQuests.push(quest.id)
		playerState.activeQuests = playerState.activeQuests.filter(
			q => q.questId !== quest.id
		)

		if (quest.reward) {
			// Emit reward events
			if (quest.reward.items) {
				for (const item of quest.reward.items) {
					this.event.emit(Receiver.All, 'ss:inventory:add', {
						playerId,
						itemId: item.id,
						quantity: item.qty
					})
				}
			}

			if (quest.reward.exp) {
				this.event.emit(Receiver.All, 'ss:player:add_exp', {
					playerId,
					exp: quest.reward.exp
				})
			}
		}

		const response: QuestCompleteResponse = {
			questId: quest.id,
			reward: quest.reward
		}
		client.emit(Receiver.Sender, QuestEvents.SC.Complete, response)
		this.savePlayerState(playerId, playerState)
	}

	private getOrCreatePlayerState(playerId: string): PlayerQuestState {
		if (!this.playerQuestStates.has(playerId)) {
			this.playerQuestStates.set(playerId, {
				activeQuests: [],
				completedQuests: []
			})
		}
		return this.playerQuestStates.get(playerId)!
	}

	private savePlayerState(playerId: string, state: PlayerQuestState) {
		this.playerQuestStates.set(playerId, state)
		// TODO: Persist to database
	}
} 