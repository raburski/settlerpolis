import { EventManager, Event, EventClient } from '../../events'
import { Trigger, TriggerOption } from './types'
import { TriggerEvents } from './events'
import { Receiver } from '../../Receiver'
import { NPCManager } from '../NPC'
import { ConditionEffectManager } from '../ConditionEffect'
import { Position } from '../../types'
import { MapManager } from '../Map'

const PROXIMITY_DEACTIVATION_BUFFER = 50 // pixels
const TO_FIX_HARDODED_MAP_ID = 'test1'

export class TriggerManager {
	private triggers: Map<string, Trigger> = new Map()
	private activeTriggers: Set<string> = new Set()
	private activeProximityTriggers: Set<string> = new Set()
	private _conditionEffectManager: ConditionEffectManager | null = null
	private usedTriggers: Set<string> = new Set()
	private playerActiveTriggers: Map<string, Set<string>> = new Map() // playerId -> Set<triggerId>
	private playerConditionTriggers: Map<string, Map<string, boolean>> = new Map() // playerId -> Map<triggerId, wasValid>

	constructor(
		private event: EventManager,
		private npcManager: NPCManager,
		private mapManager: MapManager
	) {
		this.setupEventHandlers()
	}

	public loadTriggers(triggers: Trigger[]): void {
		this.initializeTriggers(triggers)
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

	private getPlayerActiveTriggers(playerId: string): Set<string> {
		let triggers = this.playerActiveTriggers.get(playerId)
		if (!triggers) {
			triggers = new Set()
			this.playerActiveTriggers.set(playerId, triggers)
		}
		return triggers
	}

	private isTriggerActiveForPlayer(triggerId: string, playerId: string): boolean {
		return this.getPlayerActiveTriggers(playerId).has(triggerId)
	}

	private setTriggerActiveForPlayer(triggerId: string, playerId: string, active: boolean) {
		const triggers = this.getPlayerActiveTriggers(playerId)
		if (active) {
			triggers.add(triggerId)
		} else {
			triggers.delete(triggerId)
		}
	}

	private getPlayerConditionTriggers(playerId: string): Map<string, boolean> {
		let triggers = this.playerConditionTriggers.get(playerId)
		if (!triggers) {
			triggers = new Map()
			this.playerConditionTriggers.set(playerId, triggers)
		}
		return triggers
	}

	private checkTriggers(position: Position, client: EventClient) {
		const playerId = client.id
		const mapId = TO_FIX_HARDODED_MAP_ID //client.currentGroup
		
		if (mapId) {
			const mapTriggers = this.mapManager.getTriggersAtPosition(mapId, position)
			const activeTriggers = this.getPlayerActiveTriggers(playerId)

			// First check for triggers that should be deactivated
			for (const triggerId of activeTriggers) {
				const trigger = this.triggers.get(triggerId)
				if (!trigger) continue

				// Check if player is still in the trigger area
				const mapTrigger = this.mapManager.getTriggerById(mapId, triggerId)
				if (!mapTrigger) continue

				const isInArea = this.isPositionInTriggerArea(position, mapTrigger)
				if (!isInArea) {
					this.setTriggerActiveForPlayer(triggerId, playerId, false)
					// For OneTime triggers, mark them as used when player leaves
					if (trigger.option === TriggerOption.OneTime) {
						this.usedTriggers.add(triggerId)
					}
				}
			}

			// Then check for new triggers to activate
			for (const mapTrigger of mapTriggers) {
				const trigger = this.triggers.get(mapTrigger.id)
				if (!trigger) continue

				// Skip if trigger is already active for this player
				if (this.isTriggerActiveForPlayer(trigger.id, playerId)) continue

				// Skip if it's a OneTime trigger that has been used
				if (trigger.option === TriggerOption.OneTime && this.usedTriggers.has(trigger.id)) continue

				// Skip if it's a Random trigger and the random check fails
				if (trigger.option === TriggerOption.Random && Math.random() > 0.5) continue

				// For map triggers without conditions, we activate them directly
				if (!trigger.condition && !trigger.conditions) {
					this.handleTrigger(trigger, client, position)
					this.setTriggerActiveForPlayer(trigger.id, playerId, true)
					continue
				}

				// For triggers with conditions, we check if they're valid
				if (this.isTriggerValid(trigger, position, client)) {
					this.handleTrigger(trigger, client, position)
					this.setTriggerActiveForPlayer(trigger.id, playerId, true)
				}
			}
		}

		// Then check for other triggers (non-map triggers)
		for (const [triggerId, trigger] of this.triggers) {
			// Skip if it's a OneTime trigger that has been used
			if (trigger.option === TriggerOption.OneTime && this.usedTriggers.has(triggerId)) continue

			// Skip if it's a Random trigger and the random check fails
			if (trigger.option === TriggerOption.Random && Math.random() > 0.5) continue

			const isTriggerValid = this.isTriggerValid(trigger, position, client)
			const conditionTriggers = this.getPlayerConditionTriggers(playerId)
			const wasValid = conditionTriggers.get(triggerId)

			// If trigger is valid and wasn't valid before, activate it
			if (isTriggerValid && !wasValid) {
				this.handleTrigger(trigger, client, position)
				this.setTriggerActiveForPlayer(triggerId, playerId, true)
			}

			// Update the condition state
			conditionTriggers.set(triggerId, isTriggerValid)

			// If trigger is no longer valid, deactivate it
			if (!isTriggerValid && wasValid) {
				this.setTriggerActiveForPlayer(triggerId, playerId, false)
			}
		}
	}

	private isPositionInTriggerArea(position: Position, mapTrigger: any): boolean {
		return (
			position.x >= mapTrigger.position.x &&
			position.x <= mapTrigger.position.x + mapTrigger.width &&
			position.y >= mapTrigger.position.y &&
			position.y <= mapTrigger.position.y + mapTrigger.height
		)
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
		if (!trigger.condition && !trigger.conditions) {
			return false
		}

		// Check conditions
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

		return true
	}

	private handleTrigger(trigger: Trigger, client: EventClient, position: Position) {
		// Check conditions
		if (trigger.conditions) {
			const conditionsMet = this.conditionEffectManager.checkConditions(
				trigger.conditions,
				client
			)
			if (!conditionsMet) return
		}

		// Apply effect
		if (trigger.effect) {
			this.conditionEffectManager.applyEffect(
				trigger.effect,
				client
			)
		}

		// Apply additional effects
		if (trigger.effects) {
			trigger.effects.forEach(effect => {
				this.conditionEffectManager.applyEffect(
					effect,
					client
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
		this.playerActiveTriggers.clear()
		this.playerConditionTriggers.clear()
	}
} 