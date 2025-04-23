import { EventManager, Event, EventClient } from '../../events'
import { Trigger, TriggerOption } from './types'
import { TriggerEvents } from './events'
import { Receiver } from '../../Receiver'
import { NPCManager } from '../NPC'
import { ConditionEffectManager } from '../ConditionEffect'
import { Position } from '../../types'
import { MapManager } from '../Map'
import { triggers } from './content'

const PROXIMITY_DEACTIVATION_BUFFER = 50 // pixels
const TO_FIX_HARDODED_MAP_ID = 'test1'

export class TriggerManager {
	private triggers: Map<string, Trigger> = new Map()
	private activeTriggers: Set<string> = new Set()
	private activeProximityTriggers: Set<string> = new Set()
	private _conditionEffectManager: ConditionEffectManager | null = null
	private usedTriggers: Set<string> = new Set()

	constructor(
		private event: EventManager,
		private npcManager: NPCManager,
		private mapManager: MapManager,
		triggersToLoad: Trigger[] = triggers
	) {
		this.initializeTriggers(triggersToLoad)
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

	private initializeTriggers(triggersToLoad: Trigger[]) {
		triggersToLoad.forEach(trigger => {
			this.triggers.set(trigger.id, trigger)
		})
	}

	private setupEventHandlers() {
		this.event.on<Position>(Event.Players.CS.Move, (position, client) => {
			this.checkTriggers(position, client)
		})
	}

	private checkTriggers(position: Position, client: EventClient) {
		// First check if any active proximity triggers should be cleared
		this.checkActiveProximityTriggers(position)

		// Check map triggers
		const mapId = TO_FIX_HARDODED_MAP_ID //client.currentGroup
		if (mapId) {
			const mapTriggers = this.mapManager.getTriggersAtPosition(mapId, position)
			for (const mapTrigger of mapTriggers) {
				const trigger = this.triggers.get(mapTrigger.id)
				if (!trigger) continue

				// For map triggers without conditions, we activate them directly
				if (!trigger.condition && !trigger.conditions && !trigger.npcProximity) {
					if (!this.shouldSkipTrigger(trigger, mapTrigger.id)) {
						this.handleTrigger(trigger, client)
					}
					continue
				}

				// For triggers with conditions, we check if they should be skipped and if they're valid
				if (!this.shouldSkipTrigger(trigger, mapTrigger.id) && this.isTriggerValid(trigger, position, client)) {
					this.handleTrigger(trigger, client)
				}
			}
		}

		// Then check for other triggers
		for (const [triggerId, trigger] of this.triggers) {
			if (this.shouldSkipTrigger(trigger, triggerId)) continue

			if (this.isTriggerValid(trigger, position, client)) {
				this.handleTrigger(trigger, client)
			}
		}
	}

	private checkActiveProximityTriggers(position: Position) {
		for (const triggerId of this.activeProximityTriggers) {
			const trigger = this.triggers.get(triggerId)
			if (!trigger || !trigger.npcProximity) continue

			const npc = this.npcManager.getNPC(trigger.npcProximity.npcId)
			if (!npc) continue

			const dx = position.x - npc.position.x
			const dy = position.y - npc.position.y
			const distance = Math.sqrt(dx * dx + dy * dy)

			if (distance > trigger.npcProximity.proximityRadius + PROXIMITY_DEACTIVATION_BUFFER) {
				this.clearTrigger(triggerId)
			}
		}
	}

	private clearTrigger(triggerId: string) {
		this.activeTriggers.delete(triggerId)
		this.activeProximityTriggers.delete(triggerId)
	}

	private shouldSkipTrigger(trigger: Trigger, triggerId: string): boolean {
		switch (trigger.option) {
			case TriggerOption.OneTime:
				return this.activeTriggers.has(triggerId)
			case TriggerOption.Random:
				return Math.random() > 0.5
			case TriggerOption.Always:
				return this.activeTriggers.has(triggerId)
			default:
				return false
		}
	}

	private isTriggerValid(trigger: Trigger, position: Position, client: EventClient): boolean {
		// If there are no conditions, return false by default
		if (!trigger.condition && !trigger.conditions && !trigger.npcProximity) {
			return false
		}

		if (trigger.npcProximity) {
			const npc = this.npcManager.getNPC(trigger.npcProximity.npcId)
			
			if (!npc) return false

			const dx = position.x - npc.position.x
			const dy = position.y - npc.position.y
			const distance = Math.sqrt(dx * dx + dy * dy)

			if (distance > trigger.npcProximity.proximityRadius) return false

			// Check conditions with npcId
			if (trigger.condition) {
				if (!this.conditionEffectManager.checkCondition(trigger.condition, client, trigger.npcProximity.npcId)) {
					return false
				}
			}
			if (trigger.conditions) {
				if (!trigger.conditions.every(condition => 
					this.conditionEffectManager.checkCondition(condition, client, trigger.npcProximity?.npcId)
				)) {
					return false
				}
			}
		} else {
			// Check conditions without npcId
			if (trigger.condition) {
				if (!this.conditionEffectManager.checkCondition(trigger.condition, client)) {
					return false
				}
			}
			if (trigger.conditions) {
				if (!trigger.conditions.every(condition => 
					this.conditionEffectManager.checkCondition(condition, client)
				)) {
					return false
				}
			}
		}

		return true
	}

	private handleTrigger(trigger: Trigger, client: EventClient) {
		if (this.shouldSkipTrigger(trigger, trigger.id)) return

		// Check conditions
		if (trigger.conditions) {
			const conditionsMet = this.conditionEffectManager.checkConditions(
				trigger.conditions,
				client,
				trigger.npcProximity?.npcId
			)
			if (!conditionsMet) return
		}

		// Apply effect
		if (trigger.effect) {
			this.conditionEffectManager.applyEffect(
				trigger.effect,
				client,
				trigger.npcProximity?.npcId
			)
		}

		// Apply additional effects
		if (trigger.effects) {
			trigger.effects.forEach(effect => {
				this.conditionEffectManager.applyEffect(
					effect,
					client,
					trigger.npcProximity?.npcId
				)
			})
		}

		// Mark trigger as used if it's one-time
		if (trigger.option === TriggerOption.OneTime) {
			this.usedTriggers.add(trigger.id)
		}

		client.emit(Receiver.Sender, TriggerEvents.SC.Triggered, {
			triggerId: trigger.id
		})
	}

	public cleanup() {
		this.activeTriggers.clear()
		this.activeProximityTriggers.clear()
		this.usedTriggers.clear()
	}
} 