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
import { InventoryManager } from "../Inventory"

export class QuestManager {
	private quests: Map<string, Quest> = new Map()
	private playerQuestStates: Map<string, PlayerQuestState> = new Map()
	private eventToQuestSteps: Map<string, Array<{ questId: string, stepIndex: number }>> = new Map()

	constructor(private event: EventManager, private inventoryManager: InventoryManager) {
		this.loadQuests()
		this.setupEventHandlers()
	}

	private loadQuests() {
		for (const quest of AllQuests) {
			this.quests.set(quest.id, quest)
			
			// Index quest steps by their trigger events
			quest.steps.forEach((step, index) => {
				if (!step.completeWhen?.event) return
				
				const event = step.completeWhen.event
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

				const playerState = this.getOrCreatePlayerState(client.id)
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
				this.savePlayerState(client.id, playerState)

				// Send sanitized quest details and progress
				client.emit(Receiver.Sender, QuestEvents.SC.Start, {
					quest: {
						id: quest.id,
						title: quest.title,
						description: quest.description,
						chapter: quest.chapter,
						reward: quest.reward,
						steps: quest.steps.map(step => ({
							id: step.id,
							label: step.label
						}))
					},
					progress
				})
			}
		)

		// Handle player connection
		this.event.on(
			Event.Players.CS.Connect,
			(data: {}, client: EventClient) => {
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
						if (this.checkStepCompletion(step, data, client.id)) {
							this.completeStep(client.id, questProgress, quest, step, client)
						}
					}
				}
			})
		}
	}

	private checkStepCompletion(
		step: Quest['steps'][number],
		eventData: any,
		playerId: string
	): boolean {
		// Check inventory condition if present
		if (step.completeWhen.inventory) {
			const { itemType, quantity } = step.completeWhen.inventory
			return this.inventoryManager.doesHave(itemType, quantity, playerId)
		}

		// Check payload properties if present
		if (step.completeWhen.payload) {
			for (const [key, value] of Object.entries(step.completeWhen.payload)) {
				if (eventData[key] !== value) {
					return false
				}
			}
			return true
		}

		// Fall back to generic condition check
		if (step.completeWhen.condition) {
			for (const [key, value] of Object.entries(step.completeWhen.condition)) {
				if (eventData[key] !== value) {
					return false
				}
			}
			return true
		}

		return false
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
		if (step.onComplete) {
			if (step.onComplete.logMessage) {
				client.emit(Receiver.Sender, 'ss:log:message', {
					message: step.onComplete.logMessage,
					playerId
				})
			}
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
			// if (quest.reward.items) {
			// 	for (const item of quest.reward.items) {
			// 		this.event.emit(Receiver.All, 'ss:inventory:add', {
			// 			playerId,
			// 			itemId: item.id,
			// 			quantity: item.qty
			// 		})
			// 	}
			// }

			// if (quest.reward.exp) {
			// 	this.event.emit(Receiver.All, 'ss:player:add_exp', {
			// 		playerId,
			// 		exp: quest.reward.exp
			// 	})
			// }
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

	public findDialogueFor(npcId: string, playerId: string): { dialogueId: string, nodeId: string } | undefined {
		const playerState = this.getOrCreatePlayerState(playerId)
		
		// Check all active quests for this player
		for (const progress of playerState.activeQuests) {
			const quest = this.quests.get(progress.questId)
			if (!quest || progress.completed) continue
			
			// Get current step
			const currentStep = quest.steps[progress.currentStep]
			
			// If current step involves this NPC and has dialogue info, return it
			if (currentStep.npcId === npcId && currentStep.dialogue) {
				return {
					dialogueId: currentStep.dialogue.id,
					nodeId: currentStep.dialogue.nodeId
				}
			}
		}
		
		return undefined
	}
} 