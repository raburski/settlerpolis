import { EventManager, Event, EventClient } from '../events'
import { Trigger, TriggerOption } from './types'
import { TriggerEvents } from './events'
import { Receiver } from '../Receiver'
import type { ConditionEffectManager } from '../ConditionEffect'
import { Position } from '../types'
import type { MapManager } from '../Map'
import { Logger } from '../Logs'
import { BaseManager } from '../Managers'
import type { TriggersSnapshot } from '../state/types'
import { TriggerManagerState } from './TriggerManagerState'

const PROXIMITY_DEACTIVATION_BUFFER = 50 // pixels

export interface TriggerDeps {
	event: EventManager
	map: MapManager
	conditionEffect: ConditionEffectManager
}

export class TriggerManager extends BaseManager<TriggerDeps> {
	private readonly state = new TriggerManagerState()

	constructor(
		managers: TriggerDeps,
		private logger: Logger
	) {
		super(managers)
		this.setupEventHandlers()
	}

	public loadTriggers(triggers: Trigger[]): void {
		this.initializeTriggers(triggers)
	}


	private initializeTriggers(triggersToLoad: Trigger[]) {
		triggersToLoad.forEach(trigger => {
			this.state.triggers.set(trigger.id, trigger)
		})
	}

	private setupEventHandlers() {
		this.managers.event.on<Position>(Event.Players.CS.Move, this.handlePlayersCSMove)
	}

	/* EVENT HANDLERS */
	private readonly handlePlayersCSMove = (position: Position, client: EventClient): void => {
		this.checkTriggers(position, client)
	}

	/* METHODS */
	private getPlayerActiveTriggers(playerId: string): Set<string> {
		let triggers = this.state.playerActiveTriggers.get(playerId)
		if (!triggers) {
			triggers = new Set()
			this.state.playerActiveTriggers.set(playerId, triggers)
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
		let triggers = this.state.playerConditionTriggers.get(playerId)
		if (!triggers) {
			triggers = new Map()
			this.state.playerConditionTriggers.set(playerId, triggers)
		}
		return triggers
	}

	private checkTriggers(position: Position, client: EventClient) {
		const playerId = client.id
		const mapId = client.currentGroup
		
		if (mapId) {
			const mapTriggers = this.managers.map.getTriggersAtPosition(mapId, position)
			const activeTriggers = this.getPlayerActiveTriggers(playerId)

			// First check for triggers that should be deactivated
			for (const triggerId of activeTriggers) {
				const trigger = this.state.triggers.get(triggerId)
				if (!trigger) continue

				// Check if player is still in the trigger area
				const mapTrigger = this.managers.map.getTriggerById(mapId, triggerId)
				if (!mapTrigger) continue

				const isInArea = this.isPositionInTriggerArea(position, mapTrigger)
				
				if (!isInArea) {
					this.setTriggerActiveForPlayer(triggerId, playerId, false)
					// For OneTime triggers, mark them as used when player leaves
					if (trigger.option === TriggerOption.OneTime) {
						this.state.usedTriggers.add(triggerId)
					}
				}
			}

			// Then check for new triggers to activate
			for (const mapTrigger of mapTriggers) {
				const trigger = this.state.triggers.get(mapTrigger.id)
				if (!trigger) continue

				// Skip if trigger is already active for this player
				if (this.isTriggerActiveForPlayer(trigger.id, playerId)) continue

				// Skip if it's a OneTime trigger that has been used
				if (trigger.option === TriggerOption.OneTime && this.state.usedTriggers.has(trigger.id)) continue

				// Skip if it's a Random trigger and the random check fails
				if (trigger.option === TriggerOption.Random && Math.random() > 0.5) continue

				// For map triggers without conditions, we activate them directly
				if (!trigger.condition && !trigger.conditions) {
					this.handleTrigger(trigger, client, position)
					this.setTriggerActiveForPlayer(trigger.id, playerId, true)
					continue
				}

				// For triggers with conditions, we check if they're valid
				const isValid = this.isTriggerValid(trigger, position, client)
				if (isValid) {
					this.handleTrigger(trigger, client, position)
					this.setTriggerActiveForPlayer(trigger.id, playerId, true)
				}
			}
		}

		// Then check for non-map triggers only - these are triggers without a mapId property
		let nonMapTriggersCount = 0
		
		for (const [triggerId, trigger] of this.state.triggers) {
			// Skip map-bound triggers
			if (trigger.mapId) {
				continue
			}
			
			nonMapTriggersCount++

			// Skip if it's a OneTime trigger that has been used
			if (trigger.option === TriggerOption.OneTime && this.state.usedTriggers.has(triggerId)) {
				continue
			}

			// Skip if it's a Random trigger and the random check fails
			if (trigger.option === TriggerOption.Random && Math.random() > 0.5) {
				continue
			}

			const isTriggerValid = this.isTriggerValid(trigger, position, client)
			const conditionTriggers = this.getPlayerConditionTriggers(playerId)
			const wasValid = conditionTriggers.get(triggerId)

			// If trigger is valid and wasn't valid before, activate it
			if (isTriggerValid && wasValid === false) {
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
		this.state.activeTriggers.delete(triggerId)
		this.state.activeProximityTriggers.delete(triggerId)
	}

	private shouldSkipTrigger(trigger: Trigger, triggerId: string): boolean {
		switch (trigger.option) {
			case TriggerOption.OneTime:
				return this.state.activeTriggers.has(triggerId)
			case TriggerOption.Random:
				return Math.random() > 0.5
			case TriggerOption.Always:
				return this.state.activeTriggers.has(triggerId)
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
			if (!this.managers.conditionEffect.checkCondition(trigger.condition, client)) {
				return false
			}
		}
		if (trigger.conditions) {
			if (!trigger.conditions.every(condition => 
				this.managers.conditionEffect.checkCondition(condition, client)
			)) {
				return false
			}
		}

		return true
	}

	private handleTrigger(trigger: Trigger, client: EventClient, position: Position) {
		// Check conditions
		if (trigger.conditions) {
			const conditionsMet = this.managers.conditionEffect.checkConditions(
				trigger.conditions,
				client
			)
			if (!conditionsMet) return
		}

		// Apply effect
		if (trigger.effect) {
			this.managers.conditionEffect.applyEffect(
				trigger.effect,
				client
			)
		}

		// Apply additional effects
		if (trigger.effects) {
			trigger.effects.forEach(effect => {
				this.managers.conditionEffect.applyEffect(
					effect,
					client
				)
			})
		}

		// Mark trigger as used if it's one-time
		if (trigger.option === TriggerOption.OneTime) {
			this.state.usedTriggers.add(trigger.id)
		}

		client.emit(Receiver.Sender, TriggerEvents.SC.Triggered, {
			triggerId: trigger.id
		})
	}

	public cleanup() {
		this.state.activeTriggers.clear()
		this.state.activeProximityTriggers.clear()
		this.state.usedTriggers.clear()
		this.state.playerActiveTriggers.clear()
		this.state.playerConditionTriggers.clear()
	}

	serialize(): TriggersSnapshot {
		return this.state.serialize()
	}

	deserialize(state: TriggersSnapshot): void {
		this.state.deserialize(state)
	}

	reset(): void {
		this.state.reset()
	}
}

export * from './TriggerManagerState'
