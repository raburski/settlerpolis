import { EventManager, Event, EventClient } from '../events'
import { Receiver } from '../Receiver'
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
import type { ConditionEffectManager } from "../ConditionEffect"
import { Logger } from '../Logs'
import { BaseManager } from '../Managers'
import type { QuestSnapshot } from '../state/types'

export interface QuestDeps {
	conditionEffect: ConditionEffectManager
}

export class QuestManager extends BaseManager<QuestDeps> {
	private quests: Map<string, Quest> = new Map()
	private playerQuestStates: Map<string, PlayerQuestState> = new Map()
	private globalQuestStates: Map<string, QuestProgress> = new Map()
	private sharedQuestStates: Map<string, QuestProgress> = new Map()

	constructor(
		managers: QuestDeps,
		private event: EventManager,
		private logger: Logger
	) {
		super(managers)
		this.setupEventHandlers()
	}

	public loadQuests(quests: Quest[]) {
		for (const quest of quests) {
			// Process each step to set dialogue property if needed
			quest.steps = quest.steps.map(step => {
				// If step has no dialogue but has a dialogue condition, set dialogue from condition
				if (!step.dialogue && step.condition?.dialogue) {
					return {
						...step,
						dialogue: {
							id: step.condition.dialogue.id,
							nodeId: step.condition.dialogue.nodeId
						}
					}
				}
				return step
			})
			this.quests.set(quest.id, quest)
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
	}

	private checkStepCompletion(
		step: Quest['steps'][number],
		playerId: string,
		client: EventClient
	): boolean {
		this.logger.debug(`Checking step completion for step ${step.id}`)
		
		if (!step.condition) {
			this.logger.debug(`Step ${step.id} has no condition, allowing progression`)
			return true
		}
		
		const result = this.managers.conditionEffect.checkCondition(step.condition, client)
		this.logger.debug(`Step ${step.id} condition check result:`, result)
		return result
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
			this.managers.conditionEffect.applyEffect(step.effect, client)
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

	private savePlayerState(playerId: string, state: PlayerQuestState) {
		this.playerQuestStates.set(playerId, state)
		// TODO: Persist to database
	}

	public getOrCreatePlayerState(playerId: string): PlayerQuestState {
		if (!this.playerQuestStates.has(playerId)) {
			this.playerQuestStates.set(playerId, {
				activeQuests: [],
				completedQuests: []
			})
		}
		return this.playerQuestStates.get(playerId)!
	}

	public findDialogueFor(npcId: string, playerId: string): { dialogueId: string, nodeId: string } | undefined {
		this.logger.debug(`Finding dialogue for NPC ${npcId} and player ${playerId}`)
		
		const playerState = this.getOrCreatePlayerState(playerId)
		this.logger.debug(`Player state:`, {
			activeQuests: playerState.activeQuests,
			completedQuests: playerState.completedQuests
		})
		
		// Helper function to check a quest's current step
		const checkQuestStep = (quest: Quest, progress: QuestProgress) => {
			if (progress.completed) {
				this.logger.debug(`Quest ${quest.id} is already completed`)
				return undefined
			}
			
			// Get current step
			const currentStep = quest.steps[progress.currentStep]
			this.logger.debug(`Current step for quest ${quest.id}:`, {
				step: currentStep,
				stepIndex: progress.currentStep,
				hasNPCId: currentStep?.npcId === npcId,
				hasDialogue: !!currentStep?.dialogue
			})
			
			// If current step involves this NPC and has dialogue info, return it
			if (currentStep.npcId === npcId && currentStep.dialogue) {
				this.logger.debug(`Found matching dialogue:`, {
					dialogueId: currentStep.dialogue.id,
					nodeId: currentStep.dialogue.nodeId
				})
				return {
					dialogueId: currentStep.dialogue.id,
					nodeId: currentStep.dialogue.nodeId
				}
			}
			
			return undefined
		}
		
		// Check player's active quests
		for (const progress of playerState.activeQuests) {
			const quest = this.quests.get(progress.questId)
			if (!quest) {
				this.logger.debug(`Quest ${progress.questId} not found in quests map`)
				continue
			}
			
			const dialogue = checkQuestStep(quest, progress)
			if (dialogue) return dialogue
		}
		
		// Check global quests
		for (const [questId, progress] of this.globalQuestStates.entries()) {
			const quest = this.quests.get(questId)
			if (!quest) continue
			
			// Get default settings if not provided
			const settings = quest.settings || { repeatable: false, scope: QuestScope.Global }
			
			// Only check if it's a global quest
			if (settings.scope === QuestScope.Global) {
				this.logger.debug(`Checking global quest ${questId}`)
				const dialogue = checkQuestStep(quest, progress)
				if (dialogue) return dialogue
			}
		}
		
		// Check shared quests
		for (const [questId, progress] of this.sharedQuestStates.entries()) {
			const quest = this.quests.get(questId)
			if (!quest) continue
			
			// Get default settings if not provided
			const settings = quest.settings || { repeatable: false, scope: QuestScope.Shared }
			
			// Only check if it's a shared quest
			if (settings.scope === QuestScope.Shared) {
				this.logger.debug(`Checking shared quest ${questId}`)
				const dialogue = checkQuestStep(quest, progress)
				if (dialogue) return dialogue
			}
		}
		
		this.logger.debug(`No matching dialogue found for NPC ${npcId}`)
		return undefined
	}

	/**
	 * Check if a player has a specific quest active/in progress
	 * @param questId The ID of the quest to check
	 * @param playerId The ID of the player
	 * @returns true if the player has the quest active, false otherwise
	 */
	public hasActiveQuest(questId: string, playerId: string): boolean {
		// First check if the quest exists
		const quest = this.quests.get(questId)
		if (!quest) return false
		
		// Get default settings if not provided
		const settings = quest.settings || { repeatable: false, scope: QuestScope.Player }
		
		// Get player state
		const playerState = this.getOrCreatePlayerState(playerId)
		this.logger.debug('hasActiveQuest, playerState', playerState)
		
		// Check player's active quests first (applies to all scopes)
		const isActiveForPlayer = playerState.activeQuests.some(quest => 
			quest.questId === questId && !quest.completed
		)
		
		if (isActiveForPlayer) return true
		
		// For shared quests, also check the shared quest state
		if (settings.scope === QuestScope.Shared) {
			const sharedQuestState = this.sharedQuestStates.get(questId)
			if (sharedQuestState && !sharedQuestState.completed) {
				return true
			}
		}
		
		// For global quests, check the global quest state
		if (settings.scope === QuestScope.Global) {
			const globalQuestState = this.globalQuestStates.get(questId)
			if (globalQuestState && !globalQuestState.completed) {
				return true
			}
		}
		
		return false
	}

	/**
	 * Check if a player has completed a specific quest
	 * @param questId The ID of the quest to check
	 * @param playerId The ID of the player
	 * @returns true if the player has completed the quest, false otherwise
	 */
	public hasCompletedQuest(questId: string, playerId: string): boolean {
		// First check if the quest exists
		const quest = this.quests.get(questId)
		if (!quest) return false
		
		// Get default settings if not provided
		const settings = quest.settings || { repeatable: false, scope: QuestScope.Player }
		
		// Get player state
		const playerState = this.getOrCreatePlayerState(playerId)
		
		// Check player's completed quests
		const isCompletedByPlayer = playerState.completedQuests.includes(questId)
		
		// For player-scoped quests, just check the player's completed quests
		if (settings.scope === QuestScope.Player) {
			return isCompletedByPlayer
		}
		
		// For shared quests, check if either the player has completed it
		// or the shared quest is marked as completed
		if (settings.scope === QuestScope.Shared) {
			if (isCompletedByPlayer) return true
			
			const sharedQuestState = this.sharedQuestStates.get(questId)
			return sharedQuestState?.completed || false
		}
		
		// For global quests, check if either the player has completed it
		// or the global quest is marked as completed
		if (settings.scope === QuestScope.Global) {
			if (isCompletedByPlayer) return true
			
			const globalQuestState = this.globalQuestStates.get(questId)
			return globalQuestState?.completed || false
		}
		
		return isCompletedByPlayer
	}

	/**
	 * Check if a player can start a specific quest
	 * @param questId The ID of the quest to check
	 * @param client The client to check for
	 * @returns true if the player can start the quest, false otherwise
	 */
	public canStartQuest(questId: string, client: EventClient): boolean {
		this.logger.debug(`Checking if quest ${questId} can be started for player ${client.id}`)
		
		const quest = this.quests.get(questId)
		if (!quest) {
			this.logger.debug(`Quest ${questId} not found in quests map`)
			return false
		}

		// Get default settings if not provided
		const settings = quest.settings || { repeatable: false, scope: QuestScope.Player }
		this.logger.debug(`Quest settings:`, settings)
		
		// Get player state
		const playerState = this.getOrCreatePlayerState(client.id)
		this.logger.debug(`Player state:`, {
			activeQuests: playerState.activeQuests,
			completedQuests: playerState.completedQuests
		})

		// Check if quest is already completed by the player
		const isCompleted = playerState.completedQuests.includes(questId)
		this.logger.debug(`Quest completed by player:`, isCompleted)
		
		// Check if quest is already active for the player
		const isActive = playerState.activeQuests.some(q => q.questId === questId)
		this.logger.debug(`Quest active for player:`, isActive)

		// For player-scoped quests
		if (settings.scope === QuestScope.Player) {
			// If quest is not repeatable and already completed, can't start
			if (!settings.repeatable && isCompleted) {
				this.logger.debug(`Quest is not repeatable and already completed`)
				return false
			}
			
			// If quest is already active, can't start again
			if (isActive) {
				this.logger.debug(`Quest is already active`)
				return false
			}
		}

		// For global quests (one instance for everyone)
		if (settings.scope === QuestScope.Global) {
			// Check if global quest is already active
			const globalQuestState = this.globalQuestStates.get(questId)
			this.logger.debug(`Global quest state:`, globalQuestState)
			
			if (globalQuestState && !globalQuestState.completed) {
				this.logger.debug(`Global quest is already active`)
				return false
			}
			
			// If quest is not repeatable and already completed globally, can't start
			if (!settings.repeatable && globalQuestState?.completed) {
				this.logger.debug(`Global quest is not repeatable and already completed`)
				return false
			}
		}

		// For shared quests (many players can take it and progress is communal)
		if (settings.scope === QuestScope.Shared) {
			// Check if player has already completed this shared quest
			if (!settings.repeatable && isCompleted) {
				this.logger.debug(`Shared quest is not repeatable and already completed by player`)
				return false
			}
			
			// Check if shared quest is already active
			const sharedQuestState = this.sharedQuestStates.get(questId)
			this.logger.debug(`Shared quest state:`, sharedQuestState)
			
			if (sharedQuestState && !sharedQuestState.completed) {
				// If quest is already active, player can join it
				this.logger.debug(`Shared quest is already active, player can join`)
				return true
			}
		}

		// Check start condition if present
		if (quest.startCondition) {
			this.logger.debug(`Checking start condition:`, quest.startCondition)
			if (!this.managers.conditionEffect.checkCondition(quest.startCondition, client)) {
				this.logger.debug(`Start condition not met`)
				return false
			}
		}
		
		this.logger.debug(`Quest can be started`)
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

		// Check if quest can be started
		if (!this.canStartQuest(questId, client)) return
		
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
			if (this.checkStepCompletion(step, playerId, client)) {
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

		// Apply start effect if present
		if (quest.startEffect) {
			this.managers.conditionEffect.applyEffect(quest.startEffect, client)
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

	/**
	 * Complete a specific step for a quest
	 * @param questId The ID of the quest
	 * @param stepId The ID of the step to complete
	 * @param playerId The ID of the player
	 * @param client The client to emit events to
	 */
	public completeSpecificStep(questId: string, stepId: string, playerId: string, client: EventClient): void {
		// Get the quest
		const quest = this.quests.get(questId)
		if (!quest) {
			this.logger.warn(`Cannot complete step: Quest ${questId} not found`)
			return
		}
		
		// Get default settings if not provided
		const settings = quest.settings || { repeatable: false, scope: QuestScope.Player }
		
		// Get quest progress based on scope
		let questProgress: QuestProgress | undefined
		
		if (settings.scope === QuestScope.Global) {
			// For global quests, get the global state
			questProgress = this.globalQuestStates.get(questId)
		} else if (settings.scope === QuestScope.Shared) {
			// For shared quests, get the shared state
			questProgress = this.sharedQuestStates.get(questId)
		}
		
		// If no global/shared progress found, or this is a player quest,
		// get the player's personal quest progress
		if (!questProgress) {
			const playerState = this.getOrCreatePlayerState(playerId)
			questProgress = playerState.activeQuests.find(q => q.questId === questId)
		}
		
		// If no quest progress found at all
		if (!questProgress) {
			this.logger.warn(`Cannot complete step: Quest ${questId} is not active`)
			return
		}
		
		// If quest is already completed
		if (questProgress.completed) {
			this.logger.warn(`Cannot complete step: Quest ${questId} is already completed`)
			return
		}
		
		// Find the step in the quest
		const stepIndex = quest.steps.findIndex(step => step.id === stepId)
		if (stepIndex === -1) {
			this.logger.warn(`Cannot complete step: Step ${stepId} not found in quest ${questId}`)
			return
		}
		
		// Get the step
		const step = quest.steps[stepIndex]
		
		// If step is already completed
		if (questProgress.completedSteps.includes(stepId)) {
			this.logger.warn(`Step ${stepId} is already completed for quest ${questId}`)
			return
		}
		
		// Complete the step
		this.completeStep(playerId, questProgress, quest, step, client)
		
		// For global and shared quests, we need to update the specific state maps
		if (settings.scope === QuestScope.Global) {
			this.globalQuestStates.set(questId, questProgress)
		} else if (settings.scope === QuestScope.Shared) {
			this.sharedQuestStates.set(questId, questProgress)
		}
	}

	/**
	 * Check and progress a quest if conditions are met
	 * @param questId The ID of the quest to progress
	 * @param playerId The ID of the player
	 * @param client The client to emit events to
	 */
	public checkAndProgressQuest(questId: string, playerId: string, client: EventClient): void {
		this.logger.debug(`Checking quest progression for quest ${questId} and player ${playerId}`)
		
		const quest = this.quests.get(questId)
		if (!quest) {
			this.logger.warn(`Cannot progress quest: Quest ${questId} not found`)
			return
		}

		// Get default settings if not provided
		const settings = quest.settings || { repeatable: false, scope: QuestScope.Player }
		this.logger.debug(`Quest settings:`, settings)
		
		// Get quest progress based on scope
		let questProgress: QuestProgress | undefined
		
		if (settings.scope === QuestScope.Global) {
			questProgress = this.globalQuestStates.get(questId)
			this.logger.debug(`Global quest progress:`, questProgress)
		} else if (settings.scope === QuestScope.Shared) {
			questProgress = this.sharedQuestStates.get(questId)
			this.logger.debug(`Shared quest progress:`, questProgress)
		}
		
		// If no global/shared progress found, or this is a player quest,
		// get the player's personal quest progress
		if (!questProgress) {
			const playerState = this.getOrCreatePlayerState(playerId)
			questProgress = playerState.activeQuests.find(q => q.questId === questId)
			this.logger.debug(`Player quest progress:`, questProgress)
		}
		
		// If no quest progress found at all
		if (!questProgress) {
			this.logger.warn(`Cannot progress quest: Quest ${questId} is not active`)
			return
		}
		
		// If quest is already completed
		if (questProgress.completed) {
			this.logger.warn(`Cannot progress quest: Quest ${questId} is already completed`)
			return
		}

		// Get current step
		const currentStep = quest.steps[questProgress.currentStep]
		if (!currentStep) {
			this.logger.warn(`Cannot progress quest: No current step found for quest ${questId}`)
			return
		}

		this.logger.debug(`Current step:`, {
			stepId: currentStep.id,
			stepIndex: questProgress.currentStep,
			step: currentStep
		})

		// Check if current step conditions are met
		const stepCompleted = this.checkStepCompletion(currentStep, playerId, client)
		this.logger.debug(`Step completion check result:`, stepCompleted)

		if (stepCompleted) {
			this.logger.debug(`Completing step ${currentStep.id} for quest ${questId}`)
			this.completeStep(playerId, questProgress, quest, currentStep, client)
		}
	}

	/**
	 * Check quest completion conditions for all active quests involving a specific NPC
	 * @param npcId The ID of the NPC that was interacted with
	 * @param playerId The ID of the player
	 * @param client The client to emit events to
	 */
	public checkQuestsForNPCInteraction(npcId: string, playerId: string, client: EventClient): void {
		const playerState = this.getOrCreatePlayerState(playerId)
		
		// Helper function to check a quest's current step
		const checkQuestStep = (quest: Quest, progress: QuestProgress) => {
			if (progress.completed) return
			
			// Get current step
			const currentStep = quest.steps[progress.currentStep]
			
			// If current step involves this NPC, check completion
			if (currentStep.npcId === npcId) {
				this.checkAndProgressQuest(quest.id, playerId, client)
			}
		}
		
		// Check player's active quests
		for (const progress of playerState.activeQuests) {
			const quest = this.quests.get(progress.questId)
			if (!quest) continue
			checkQuestStep(quest, progress)
		}
		
		// Check global quests
		for (const [questId, progress] of this.globalQuestStates.entries()) {
			const quest = this.quests.get(questId)
			if (!quest) continue
			
			// Get default settings if not provided
			const settings = quest.settings || { repeatable: false, scope: QuestScope.Global }
			
			// Only check if it's a global quest
			if (settings.scope === QuestScope.Global) {
				checkQuestStep(quest, progress)
			}
		}
		
		// Check shared quests
		for (const [questId, progress] of this.sharedQuestStates.entries()) {
			const quest = this.quests.get(questId)
			if (!quest) continue
			
			// Get default settings if not provided
			const settings = quest.settings || { repeatable: false, scope: QuestScope.Shared }
			
			// Only check if it's a shared quest
			if (settings.scope === QuestScope.Shared) {
				checkQuestStep(quest, progress)
			}
		}
	}

	serialize(): QuestSnapshot {
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

	deserialize(state: QuestSnapshot): void {
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

	reset(): void {
		this.playerQuestStates.clear()
		this.globalQuestStates.clear()
		this.sharedQuestStates.clear()
	}
}
