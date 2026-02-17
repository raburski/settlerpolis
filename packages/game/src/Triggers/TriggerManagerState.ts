import type { Trigger } from './types'
import type { TriggersSnapshot } from '../state/types'

export class TriggerManagerState {
	public triggers: Map<string, Trigger> = new Map()
	public activeTriggers: Set<string> = new Set()
	public activeProximityTriggers: Set<string> = new Set()
	public usedTriggers: Set<string> = new Set()
	public playerActiveTriggers: Map<string, Set<string>> = new Map()
	public playerConditionTriggers: Map<string, Map<string, boolean>> = new Map()

	public serialize(): TriggersSnapshot {
		return {
			triggers: Array.from(this.triggers.values()).map(trigger => ({ ...trigger })),
			activeTriggers: Array.from(this.activeTriggers.values()),
			activeProximityTriggers: Array.from(this.activeProximityTriggers.values()),
			usedTriggers: Array.from(this.usedTriggers.values()),
			playerActiveTriggers: Array.from(this.playerActiveTriggers.entries()).map(([playerId, triggers]) => ([
				playerId,
				Array.from(triggers.values())
			])),
			playerConditionTriggers: Array.from(this.playerConditionTriggers.entries()).map(([playerId, triggers]) => ([
				playerId,
				Array.from(triggers.entries())
			]))
		}
	}

	public deserialize(state: TriggersSnapshot): void {
		this.triggers.clear()
		this.activeTriggers.clear()
		this.activeProximityTriggers.clear()
		this.usedTriggers.clear()
		this.playerActiveTriggers.clear()
		this.playerConditionTriggers.clear()

		for (const trigger of state.triggers) {
			this.triggers.set(trigger.id, { ...trigger })
		}
		for (const triggerId of state.activeTriggers) {
			this.activeTriggers.add(triggerId)
		}
		for (const triggerId of state.activeProximityTriggers) {
			this.activeProximityTriggers.add(triggerId)
		}
		for (const triggerId of state.usedTriggers) {
			this.usedTriggers.add(triggerId)
		}
		for (const [playerId, triggers] of state.playerActiveTriggers) {
			this.playerActiveTriggers.set(playerId, new Set(triggers))
		}
		for (const [playerId, triggers] of state.playerConditionTriggers) {
			this.playerConditionTriggers.set(playerId, new Map(triggers))
		}
	}

	public reset(): void {
		this.triggers.clear()
		this.activeTriggers.clear()
		this.activeProximityTriggers.clear()
		this.usedTriggers.clear()
		this.playerActiveTriggers.clear()
		this.playerConditionTriggers.clear()
	}
}
