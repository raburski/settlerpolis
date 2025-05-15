import { EventClient, EventManager } from '../events'
import { Condition, Effect, FlagCondition, QuestCondition, FlagEffect, QuestEffect, AffinityEffect, FXEffect, CutsceneEffect, EventEffect, ChatEffect, NPCCondition, NPCAffinityCondition, NPCAffinityOverallCondition, TimeRange, DateRange, NPCAttributeCondition, NPCAttributeEffect, ScheduleEffect } from './types'
import { QuestManager } from "../Quest"
import { FlagsManager } from "../Flags"
import { AffinityManager } from "../Affinity"
import { FXEvents } from "../FX/events"
import { CutsceneEvents } from "../Cutscene/events"
import { ChatEvents } from "../Chat/events"
import { NPCEvents } from '../NPC/events'
import { NPCManager } from '../NPC'
import { Receiver, Position } from '../types'
import { PlayersManager } from '../Players'
import { TimeManager } from '../Time'
import { Time } from '../Time/types'
import { SchedulerEvents } from '../Scheduler/events'

export class ConditionEffectManager {
	constructor(
		private event: EventManager,
		private questManager: QuestManager,
		private flagsManager: FlagsManager,
		private affinityManager: AffinityManager,
		private npcManager: NPCManager,
		private playersManager: PlayersManager,
		private timeManager: TimeManager
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
	 * Apply a schedule effect
	 */
	public applyScheduleEffect(effect: ScheduleEffect, client: EventClient) {
		if (!effect || !effect.id) return

		// Determine which scheduler event to emit based on the enabled property
		const eventType = effect.enabled 
			? SchedulerEvents.SS.Enable 
			: SchedulerEvents.SS.Disable

		// Emit the event to enable or disable the scheduled event
		client.emit(Receiver.All, eventType, { id: effect.id })
	}

	/**
	 * Apply a general effect
	 */
	public applyEffect(effect: Effect, client: EventClient) {
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

		if (effect.fx) {
			this.applyFXEffect(effect.fx, client)
		}

		if (effect.cutscene) {
			this.applyCutsceneEffect(effect.cutscene, client)
		}

		if (effect.chat) {
			this.applyChatEffect(effect.chat, client)
		}

		if (effect.npc) {
			this.handleNPCEffect(effect.npc, client)
		}
		
		if (effect.schedule) {
			this.applyScheduleEffect(effect.schedule, client)
		}
	}

	/**
	 * Apply multiple effects
	 */
	public applyEffects(effects: Effect[], client: EventClient) {
		if (!effects || effects.length === 0) return
		
		effects.forEach(effect => {
			this.applyEffect(effect, client)
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
		// Check if quest can be started
		if (condition.canStart) {
			return this.questManager.canStartQuest(condition.canStart, client.id)
		}
		
		// Check if quest is in progress
		if (condition.inProgress) {
			return this.questManager.hasActiveQuest(condition.inProgress, client.id)
		}
		
		// Check if quest has been completed
		if (condition.completed) {
			return this.questManager.hasCompletedQuest(condition.completed, client.id)
		}
		
		return false
	}

	/**
	 * Check if an affinity condition is met
	 */
	public checkAffinityCondition(condition: NPCAffinityCondition, client: EventClient, npcId: string): boolean {
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
	public checkAffinityOverallCondition(condition: NPCAffinityOverallCondition, client: EventClient, npcId: string): boolean {
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
	 * Check if an NPC affinity condition is met
	 */
	public checkNPCAffinityCondition(condition: NPCAffinityCondition, client: EventClient, npcId: string): boolean {
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
	 * Check if an NPC affinity overall condition is met
	 */
	public checkNPCAffinityOverallCondition(condition: NPCAffinityOverallCondition, client: EventClient, npcId: string): boolean {
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
	 * Check NPC attribute conditions
	 */
	public checkNPCAttributeCondition(attributes: NPCCondition['attributes'], npcId: string): boolean {
		// Add a null/undefined check for both parameters
		if (!attributes || !npcId) {
			console.warn('Missing attributes or NPC ID in checkNPCAttributeCondition')
			return false
		}
		
		// Get the NPC
		if (!this.npcManager) {
			console.warn('NPCManager not initialized')
			return false
		}

		// Check each attribute condition
		for (const [attrName, condition] of Object.entries(attributes)) {
			const value = this.npcManager.getNPCAttribute(npcId, attrName)
			
			// Check if attribute exists when required
			if (condition.exists !== undefined) {
				const exists = value !== undefined
				if (condition.exists !== exists) return false
			}
			
			// Skip other checks if attribute doesn't exist
			if (value === undefined) return false
			
			// Check min value
			if (condition.min !== undefined && typeof value === 'number') {
				if (value < condition.min) return false
			}
			
			// Check max value
			if (condition.max !== undefined && typeof value === 'number') {
				if (value > condition.max) return false
			}
			
			// Check equals value
			if (condition.equals !== undefined) {
				if (value !== condition.equals) return false
			}
		}
		
		return true
	}

	/**
	 * Check if an NPC condition is met
	 */
	public checkNPCCondition(condition: NPCCondition, client: EventClient): boolean {
		// Ensure condition is provided
		if (!condition) return false;
		
		const { id, proximity, affinity, affinityOverall, attributes } = condition
		
		// Ensure id is provided
		if (!id) {
			console.warn('NPC condition missing required id property')
			return false
		}
		
		// Check attributes first - this doesn't require a client
		if (attributes) {
			if (!this.checkNPCAttributeCondition(attributes, id)) {
				return false
			}
		}
		
		// If we only needed to check attributes, we're done
		if (!proximity && !affinity && !affinityOverall) {
			return true
		}
		
		// For the rest of the checks, we need a client
		if (!client) {
			console.warn('Client required for NPC proximity or affinity conditions')
			return false
		}
		
		// Check proximity if specified
		if (proximity !== undefined) {
			if (!this.npcManager) {
				console.warn('NPCManager not initialized')
				return false
			}

			const npc = this.npcManager.getNPC(id)
			if (!npc) return false

			const player = this.playersManager.getPlayer(client.id)
			if (!player) return false

			const dx = player.position.x - npc.position.x
			const dy = player.position.y - npc.position.y
			const distance = Math.sqrt(dx * dx + dy * dy)

			if (distance > proximity) return false
		}

		// Check affinity if specified
		if (affinity) {
			if (!this.checkNPCAffinityCondition(affinity, client, id)) {
				return false
			}
		}

		// Check affinity overall if specified
		if (affinityOverall) {
			if (!this.checkNPCAffinityOverallCondition(affinityOverall, client, id)) {
				return false
			}
		}

		return true
	}

	/**
	 * Check if a time condition is met
	 */
	public checkTimeCondition(condition: TimeRange): boolean {
		const { before, after } = condition
		const currentTime = this.timeManager.getCurrentTime()
		const currentTimeString = `${currentTime.hours.toString().padStart(2, '0')}:${currentTime.minutes.toString().padStart(2, '0')}`

		if (before && currentTimeString >= before) {
			return false
		}

		if (after && currentTimeString <= after) {
			return false
		}

		return true
	}

	/**
	 * Check if a date condition is met
	 */
	public checkDateCondition(condition: DateRange): boolean {
		const { day, month, year, before, after } = condition
		const currentTime = this.timeManager.getCurrentTime()

		// Check exact date match
		if (day !== undefined && currentTime.day !== day) {
			return false
		}
		if (month !== undefined && currentTime.month !== month) {
			return false
		}
		if (year !== undefined && currentTime.year !== year) {
			return false
		}

		// Check before date
		if (before) {
			if (before.year !== undefined && currentTime.year >= before.year) {
				return false
			}
			if (before.month !== undefined && currentTime.month >= before.month) {
				return false
			}
			if (before.day !== undefined && currentTime.day >= before.day) {
				return false
			}
		}

		// Check after date
		if (after) {
			if (after.year !== undefined && currentTime.year <= after.year) {
				return false
			}
			if (after.month !== undefined && currentTime.month <= after.month) {
				return false
			}
			if (after.day !== undefined && currentTime.day <= after.day) {
				return false
			}
		}

		return true
	}

	/**
	 * Check if a condition is met
	 */
	public checkCondition(condition: Condition, client: EventClient): boolean {
		// Return true if condition is null/undefined
		if (!condition) return true
		
		// Check if flag condition requires client
		if (condition.flag) {
			if (!client) {
				console.warn('Client required for flag conditions')
				return false
			}
			if (!this.checkFlagCondition(condition.flag, client)) {
				return false
			}
		}

		// Check if quest condition requires client
		if (condition.quest) {
			if (!client) {
				console.warn('Client required for quest conditions')
				return false
			}
			if (!this.checkQuestCondition(condition.quest, client)) {
				return false
			}
		}

		// NPC condition may not require client (for attribute-only checks)
		if (condition.npc) {
			if (!this.checkNPCCondition(condition.npc, client)) {
				return false
			}
		}

		// Time and date conditions don't require client
		if (condition.time && !this.checkTimeCondition(condition.time)) {
			return false
		}

		if (condition.date && !this.checkDateCondition(condition.date)) {
			return false
		}

		return true
	}

	/**
	 * Check if multiple conditions are met
	 */
	public checkConditions(conditions: Condition[], client: EventClient): boolean {
		if (!conditions || conditions.length === 0) return true
		
		return conditions.every(condition => this.checkCondition(condition, client))
	}

	/**
	 * Apply NPC attribute effect
	 */
	public applyNPCAttributeEffect(npcId: string, attributeEffect: NPCAttributeEffect) {
		if (!attributeEffect || !this.npcManager) return
		
		// Apply each attribute effect
		for (const [attrName, effect] of Object.entries(attributeEffect)) {
			// Remove attribute if specified
			if (effect.remove) {
				this.npcManager.removeNPCAttribute(npcId, attrName)
				continue
			}
			
			// Set value if specified
			if (effect.set !== undefined) {
				this.npcManager.setNPCAttribute(npcId, attrName, effect.set)
				continue
			}
			
			// Get current value for numeric operations
			const currentValue = this.npcManager.getNPCAttribute(npcId, attrName)
			
			// Handle numeric operations
			if (typeof currentValue === 'number' || currentValue === undefined) {
				const numValue = typeof currentValue === 'number' ? currentValue : 0
				
				// Add to value if specified
				if (effect.add !== undefined) {
					this.npcManager.setNPCAttribute(npcId, attrName, numValue + effect.add)
				}
				
				// Subtract from value if specified
				if (effect.subtract !== undefined) {
					this.npcManager.setNPCAttribute(npcId, attrName, numValue - effect.subtract)
				}
			}
		}
	}

	private handleNPCEffect(effect: Effect['npc'], client: EventClient) {
		if (!effect) return

		// Handle NPC movement if goTo is provided
		if (effect.goTo) {
			let payload;
			
			if (typeof effect.goTo === 'string') {
				// Single spot name
				payload = { npcId: effect.id, spotName: effect.goTo }
			} else if (Array.isArray(effect.goTo)) {
				// Array of spot names - randomly select one
				if (effect.goTo.length > 0) {
					const randomIndex = Math.floor(Math.random() * effect.goTo.length)
					const randomSpot = effect.goTo[randomIndex]
					payload = { npcId: effect.id, spotName: randomSpot }
				} else {
					// Empty array, don't move
					payload = null
				}
			} else {
				// Position object
				payload = { npcId: effect.id, position: effect.goTo }
			}

			if (payload) {
				client.emit(Receiver.Group, NPCEvents.SS.Go, payload)
			}
		}

		// Handle NPC message if present
		if (effect.message) {
			client.emit(Receiver.Group, NPCEvents.SC.Message, {
				npcId: effect.id,
				message: effect.message,
				emoji: effect.emoji
			})
		} else if (effect.emoji) {
			client.emit(Receiver.Group, NPCEvents.SC.Message, {
				npcId: effect.id,
				emoji: effect.emoji
			})
		}

		// Handle NPC affinity if present
		if (effect.affinity) {
			this.applyAffinityEffect(effect.affinity, client, effect.id)
		}
		
		// Handle NPC attributes if present
		if (effect.attributes) {
			this.applyNPCAttributeEffect(effect.id, effect.attributes)
		}
	}
} 