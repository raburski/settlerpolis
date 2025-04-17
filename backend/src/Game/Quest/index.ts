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
	QuestCompleteResponse,
	QuestScope
} from './types'
import { AllQuests } from './quests'
import { InventoryManager } from "../Inventory"
import { ConditionEffectManager } from "../ConditionEffect"

export class QuestManager {
	private quests: Map<string, Quest> = new Map()
	private playerQuestStates: Map<string, PlayerQuestState> = new Map()
	private eventToQuestSteps: Map<string, Array<{ questId: string, stepIndex: number }>> = new Map()
	private globalQuestStates: Map<string, QuestProgress> = new Map()
	private sharedQuestStates: Map<string, QuestProgress> = new Map()
	private _conditionEffectManager: ConditionEffectManager | null = null

	constructor(
		private event: EventManager, 
		private inventoryManager: InventoryManager
	) {
		this.loadQuests()
		this.setupEventHandlers()
	}

	set conditionEffectManager(manager: ConditionEffectManager) {
		this._conditionEffectManager = manager
	}

	get conditionEffectManager(): ConditionEffectManager {
		if (!this._conditionEffectManager) {
			throw new Error('ConditionEffectManager not initialized')
		}
		return this._conditionEffectManager
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
				this.startQuest(data.questId, data.playerId, client)
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
		// Mark step as completed
		progress.completedSteps.push(step.id)
		progress.currentStep++

		// Apply effect if present
		if (step.effect) {
			this.conditionEffectManager.applyEffect(step.effect, client, step.npcId || '')
		}

		// Check if quest is complete
		if (progress.currentStep >= quest.steps.length) {
			this.completeQuest(playerId, progress, quest, client)
			return
		}

		// Update progress
		this.savePlayerState(playerId, this.getOrCreatePlayerState(playerId))
		
		// Notify client
		const response: QuestUpdateResponse = {
			questId: quest.id,
			progress
		}
		client.emit(Receiver.Sender, QuestEvents.SC.Update, response)
	}

	private completeQuest(
		playerId: string,
		progress: QuestProgress,
		quest: Quest,
		client: EventClient
	) {
		progress.completed = true
		const playerState = this.getOrCreatePlayerState(playerId)
		
		// Get default settings if not provided
		const settings = quest.settings || { repeatable: false, scope: QuestScope.Player }
		
		// Handle different quest scopes
		if (settings.scope === QuestScope.Player) {
			// For player-scoped quests, move to completed quests
			playerState.completedQuests.push(quest.id)
			playerState.activeQuests = playerState.activeQuests.filter(
				q => q.questId !== quest.id
			)
		} else if (settings.scope === QuestScope.Global) {
			// For global quests, mark as completed globally
			this.globalQuestStates.set(quest.id, progress)
			
			// Also mark as completed for the player
			playerState.completedQuests.push(quest.id)
			playerState.activeQuests = playerState.activeQuests.filter(
				q => q.questId !== quest.id
			)
		} else if (settings.scope === QuestScope.Shared) {
			// For shared quests, mark as completed in shared state
			this.sharedQuestStates.set(quest.id, progress)
			
			// Also mark as completed for the player
			playerState.completedQuests.push(quest.id)
			playerState.activeQuests = playerState.activeQuests.filter(
				q => q.questId !== quest.id
			)
		}
		
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

	/**
	 * Check if a player can start a specific quest
	 * @param questId The ID of the quest to check
	 * @param playerId The ID of the player
	 * @returns true if the player can start the quest, false otherwise
	 */
	public canStartQuest(questId: string, playerId: string): boolean {
		const quest = this.quests.get(questId)
		if (!quest) return false

		// Get default settings if not provided
		const settings = quest.settings || { repeatable: false, scope: QuestScope.Player }
		
		// Get player state
		const playerState = this.getOrCreatePlayerState(playerId)
		
		// Check if quest is already completed by the player
		const isCompleted = playerState.completedQuests.includes(questId)
		
		// Check if quest is already active for the player
		const isActive = playerState.activeQuests.some(q => q.questId === questId)
		
		// For player-scoped quests
		if (settings.scope === QuestScope.Player) {
			// If quest is not repeatable and already completed, can't start
			if (!settings.repeatable && isCompleted) return false
			
			// If quest is already active, can't start again
			if (isActive) return false
			
			return true
		}
		
		// For global quests (one instance for everyone)
		if (settings.scope === QuestScope.Global) {
			// Check if global quest is already active
			const globalQuestState = this.globalQuestStates.get(questId)
			if (globalQuestState && !globalQuestState.completed) return false
			
			// If quest is not repeatable and already completed globally, can't start
			if (!settings.repeatable && globalQuestState?.completed) return false
			
			return true
		}
		
		// For shared quests (many players can take it and progress is communal)
		if (settings.scope === QuestScope.Shared) {
			// Check if player has already completed this shared quest
			if (!settings.repeatable && isCompleted) return false
			
			// Check if shared quest is already active
			const sharedQuestState = this.sharedQuestStates.get(questId)
			if (sharedQuestState && !sharedQuestState.completed) {
				// If quest is already active, player can join it
				return true
			}
			
			return true
		}
		
		// Default case
		return true
	}

	/**
	 * Start a quest for a player
	 * @param questId The ID of the quest to start
	 * @param playerId The ID of the player
	 * @param client The client to emit events to
	 */
	public startQuest(questId: string, playerId: string, client: EventClient): void {
		const quest = this.quests.get(questId)
		if (!quest) return
		
		// Get default settings if not provided
		const settings = quest.settings || { repeatable: false, scope: QuestScope.Player }
		
		// Ensure scope is defined, default to Player if not
		if (!settings.scope) {
			settings.scope = QuestScope.Player
		}
		
		// Get player state
		const playerState = this.getOrCreatePlayerState(playerId)
		
		// Check if quest is already active for the player
		const isActive = playerState.activeQuests.some(q => q.questId === questId)
		if (isActive) return
		
		// Find first uncompleted step
		let currentStep = 0
		const completedSteps: string[] = []
		
		// Check each step until we find one that's not completed
		for (let i = 0; i < quest.steps.length; i++) {
			const step = quest.steps[i]
			if (this.checkStepCompletion(step, {}, playerId)) {
				completedSteps.push(step.id)
				currentStep = i + 1
				continue
			}
			break // Stop at first uncompleted step
		}
		
		const progress: QuestProgress = {
			questId: questId,
			currentStep,
			completed: false,
			completedSteps
		}
		
		// Handle different quest scopes
		if (settings.scope === QuestScope.Player) {
			// For player-scoped quests, add to player's active quests
			playerState.activeQuests.push(progress)
			this.savePlayerState(playerId, playerState)
		} else if (settings.scope === QuestScope.Global) {
			// For global quests, set the global quest state
			this.globalQuestStates.set(questId, progress)
		} else if (settings.scope === QuestScope.Shared) {
			// For shared quests, check if it's already active
			const sharedQuestState = this.sharedQuestStates.get(questId)
			if (sharedQuestState && !sharedQuestState.completed) {
				// If quest is already active, just add player to it
				playerState.activeQuests.push(progress)
				this.savePlayerState(playerId, playerState)
			} else {
				// If quest is not active, create a new shared quest state
				this.sharedQuestStates.set(questId, progress)
				playerState.activeQuests.push(progress)
				this.savePlayerState(playerId, playerState)
			}
		}
		
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
		
		// Now emit step completion events for any steps that were auto-completed
		for (const stepId of completedSteps) {
			client.emit(Receiver.Sender, QuestEvents.SC.StepComplete, {
				questId: quest.id,
				stepId,
				playerId: playerId
			})
		}
	}
} 