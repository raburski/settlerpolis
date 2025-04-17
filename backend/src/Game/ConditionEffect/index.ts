import { EventClient } from '../../events'
import { Receiver } from '../../Receiver'
import { Condition, Effect, FlagCondition, QuestCondition, AffinityCondition, AffinityOverallCondition, FlagEffect, QuestEffect, AffinityEffect, FXEffect, CutsceneEffect, EventEffect, ChatEffect } from './types'
import { QuestManager } from "../Quest"
import { FlagsManager } from "../Flags"
import { AffinityManager } from "../Affinity"
import { FXEvents } from "../FX/events"
import { CutsceneEvents } from "../Cutscene/events"
import { ChatEvents } from "../Chat/events"

export class ConditionEffectManager {
	constructor(
		private questManager: QuestManager,
		private flagsManager: FlagsManager,
		private affinityManager: AffinityManager
	) {}

	/**
	 * Apply a flag effect
	 */
	public applyFlagEffect(effect: FlagEffect, client: EventClient) {
		const { set, unset, scope, playerId, mapId } = effect
		
		// If playerId is not provided, use the client's ID
		const targetPlayerId = playerId || client.id
		
		// Warning if scope is undefined
		if (scope === undefined) {
			console.warn('Flag effect scope is undefined. This may cause unexpected behavior.', set || unset)
		}
		
		if (set) {
			this.flagsManager.setFlag(client, {
				name: set,
				value: true,
				scope,
				playerId: targetPlayerId,
				mapId
			})
		}
		
		if (unset) {
			this.flagsManager.unsetFlag(client, {
				name: unset,
				scope,
				playerId: targetPlayerId,
				mapId
			})
		}
	}

	/**
	 * Apply a quest effect
	 */
	public applyQuestEffect(effect: QuestEffect, client: EventClient) {
		const { start } = effect
		
		if (start) {
			// Use the QuestManager's startQuest method
			this.questManager.startQuest(start, client.id, client)
		}
	}

	/**
	 * Apply an affinity effect
	 */
	public applyAffinityEffect(effect: AffinityEffect, client: EventClient, npcId: string) {
		const { sentimentType, set, add } = effect
		
		if (set !== undefined) {
			this.affinityManager.setAffinityValue(client.id, npcId, sentimentType, set, client)
		} else if (add !== undefined) {
			this.affinityManager.changeAffinityValue(client.id, npcId, sentimentType, add, client)
		}
	}

	/**
	 * Apply a cutscene effect
	 */
	public applyCutsceneEffect(effect: CutsceneEffect, client: EventClient) {
		const { trigger } = effect
		
		if (trigger) {
			// Trigger the cutscene
			client.emit(Receiver.Sender, CutsceneEvents.SS.Trigger, { cutsceneId: trigger })
		}
	}

	/**
	 * Apply an event effect
	 */
	public applyEventEffect(effect: EventEffect, client: EventClient) {
		if (!effect) return

		// Emit the event through the event manager
		client.emit(Receiver.All, effect.type, effect.payload)
	}

	/**
	 * Apply an FX effect
	 */
	public applyFXEffect(effect: FXEffect, client: EventClient) {
		if (!effect) return

		client.emit(Receiver.Sender, FXEvents.SC.Play, effect)
	}

	/**
	 * Apply a chat effect
	 */
	public applyChatEffect(effect: ChatEffect, client: EventClient) {
		if (!effect) return

		// Handle regular chat message
		if (effect.message) {
			client.emit(Receiver.All, ChatEvents.SC.Receive, {
				message: effect.message,
				type: 'local'
			})
		}

		// Handle system message
		if (effect.system) {
			client.emit(Receiver.All, ChatEvents.SC.System, {
				message: effect.system,
				type: 'info'
			})
		}

		// Handle fullscreen message
		if (effect.fullscreen) {
			client.emit(Receiver.All, ChatEvents.SC.Fullscreen, {
				message: effect.fullscreen
			})
		}

		// Handle emoji message
		if (effect.emoji) {
			client.emit(Receiver.All, ChatEvents.SC.Emoji, {
				emoji: effect.emoji
			})
		}
	}

	/**
	 * Apply a general effect
	 */
	public applyEffect(effect: Effect, client: EventClient, npcId: string) {
		if (!effect) return
		
		if (effect.flag) {
			this.applyFlagEffect(effect.flag, client)
		}

		if (effect.event) {
			this.applyEventEffect(effect.event, client)
		}

		if (effect.quest) {
			this.applyQuestEffect(effect.quest, client)
		}

		if (effect.affinity) {
			this.applyAffinityEffect(effect.affinity, client, npcId)
		}

		if (effect.fx) {
			this.applyFXEffect(effect.fx, client)
		}

		if (effect.cutscene) {
			this.applyCutsceneEffect(effect.cutscene, client)
		}

		if (effect.chat) {
			this.applyChatEffect(effect.chat, client)
		}
	}

	/**
	 * Apply multiple effects
	 */
	public applyEffects(effects: Effect[], client: EventClient, npcId: string) {
		if (!effects || effects.length === 0) return
		
		effects.forEach(effect => {
			this.applyEffect(effect, client, npcId)
		})
	}

	/**
	 * Check if a flag condition is met
	 */
	public checkFlagCondition(condition: FlagCondition, client: EventClient): boolean {
		const { exists, notExists, scope, playerId, mapId } = condition
		
		// If playerId is not provided, use the client's ID
		const targetPlayerId = playerId || client.id
		
		if (exists) {
			return this.flagsManager.hasFlag(exists, scope, targetPlayerId, mapId)
		}
		
		if (notExists) {
			return !this.flagsManager.hasFlag(notExists, scope, targetPlayerId, mapId)
		}
		
		return true
	}

	/**
	 * Check if a quest condition is met
	 */
	public checkQuestCondition(condition: QuestCondition, client: EventClient): boolean {
		// Check with the Quest module if the player can start the quest
		return this.questManager.canStartQuest(condition.canStart, client.id)
	}

	/**
	 * Check if an affinity condition is met
	 */
	public checkAffinityCondition(condition: AffinityCondition, client: EventClient, npcId: string): boolean {
		const { sentimentType, min, max } = condition
		
		// Get the current affinity value
		const currentValue = this.affinityManager.getAffinityValue(client.id, npcId, sentimentType)
		
		// Check if the value is within the specified range
		if (min !== undefined && currentValue < min) {
			return false
		}
		
		if (max !== undefined && currentValue > max) {
			return false
		}
		
		return true
	}

	/**
	 * Check if an overall affinity condition is met
	 */
	public checkAffinityOverallCondition(condition: AffinityOverallCondition, client: EventClient, npcId: string): boolean {
		const { minScore, maxScore } = condition
		
		// Get the current overall affinity score
		const currentScore = this.affinityManager.calculateOverallScore(client.id, npcId)
		
		// Check if the score is within the specified range
		if (minScore !== undefined && currentScore < minScore) {
			return false
		}
		
		if (maxScore !== undefined && currentScore > maxScore) {
			return false
		}
		
		return true
	}

	/**
	 * Check if a condition is met
	 */
	public checkCondition(condition: Condition, client: EventClient, npcId: string): boolean {
		if (!condition) return true
		
		if (condition.flag) {
			return this.checkFlagCondition(condition.flag, client)
		}
		
		if (condition.quest) {
			return this.checkQuestCondition(condition.quest, client)
		}
		
		if (condition.affinity) {
			return this.checkAffinityCondition(condition.affinity, client, npcId)
		}
		
		if (condition.affinityOverall) {
			return this.checkAffinityOverallCondition(condition.affinityOverall, client, npcId)
		}
		
		return true
	}

	/**
	 * Check if multiple conditions are met
	 */
	public checkConditions(conditions: Condition[], client: EventClient, npcId: string): boolean {
		if (!conditions || conditions.length === 0) return true
		
		return conditions.every(condition => this.checkCondition(condition, client, npcId))
	}
} 