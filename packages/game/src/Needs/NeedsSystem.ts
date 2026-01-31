import type { EventManager } from '../events'
import { Receiver } from '../Receiver'
import { SimulationEvents } from '../Simulation/events'
import type { SimulationTickData } from '../Simulation/types'
import type { PopulationManager } from '../Population'
import { NeedType, type NeedLevel } from './NeedTypes'
import { createDefaultNeedsState, getNeedMeter, type NeedsState } from './NeedsState'
import { NeedsEvents } from './events'

export interface NeedsSystemDeps {
	population: PopulationManager
}

const clamp = (value: number, min: number, max: number): number => {
	return Math.min(max, Math.max(min, value))
}

const createDefaultLevels = (): Record<NeedType, NeedLevel> => ({
	[NeedType.Hunger]: 'NONE',
	[NeedType.Fatigue]: 'NONE'
})

export class NeedsSystem {
	private needsBySettler = new Map<string, NeedsState>()
	private lastLevels = new Map<string, Record<NeedType, NeedLevel>>()
	private lastBroadcastAt = new Map<string, number>()
	private lastBroadcastValues = new Map<string, { hunger: number, fatigue: number }>()

	private readonly BROADCAST_INTERVAL_MS = 1000
	private readonly BROADCAST_MIN_DELTA = 0.02

	constructor(
		private managers: NeedsSystemDeps,
		private event: EventManager
	) {
		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		this.event.on(SimulationEvents.SS.Tick, (data: SimulationTickData) => {
			this.handleSimulationTick(data)
		})
	}

	private handleSimulationTick(data: SimulationTickData): void {
		const settlers = this.managers.population.getSettlers()
		for (const settler of settlers) {
			const state = this.ensureNeedsState(settler.id)
			this.updateNeed(settler.id, NeedType.Hunger, state, data.deltaMs)
			this.updateNeed(settler.id, NeedType.Fatigue, state, data.deltaMs)
			this.maybeBroadcastNeeds(settler.id, state, data.nowMs)
		}
	}

	public getNeeds(settlerId: string): NeedsState {
		return this.ensureNeedsState(settlerId)
	}

	public setNeedValue(settlerId: string, needType: NeedType, value: number): void {
		const state = this.ensureNeedsState(settlerId)
		const meter = getNeedMeter(state, needType)
		meter.value = clamp(value, 0, 1)
		this.evaluateNeedTransition(settlerId, needType, meter.value, meter)
		this.broadcastNeeds(settlerId, state)
	}

	public satisfyNeed(settlerId: string, needType: NeedType): void {
		const state = this.ensureNeedsState(settlerId)
		const meter = getNeedMeter(state, needType)
		meter.value = clamp(Math.max(meter.value, meter.satisfiedThreshold), 0, 1)
		this.evaluateNeedTransition(settlerId, needType, meter.value, meter)
		this.broadcastNeeds(settlerId, state)
	}

	private ensureNeedsState(settlerId: string): NeedsState {
		let state = this.needsBySettler.get(settlerId)
		if (!state) {
			state = createDefaultNeedsState()
			this.needsBySettler.set(settlerId, state)
			this.lastLevels.set(settlerId, createDefaultLevels())
		}
		return state
	}

	private updateNeed(settlerId: string, needType: NeedType, state: NeedsState, deltaMs: number): void {
		const meter = getNeedMeter(state, needType)
		const decay = meter.decayRatePerMs * deltaMs
		const modifier = meter.modifiers ?? 0
		const nextValue = clamp(meter.value - decay + modifier, 0, 1)
		meter.value = nextValue
		this.evaluateNeedTransition(settlerId, needType, nextValue, meter)
	}

	private maybeBroadcastNeeds(settlerId: string, state: NeedsState, nowMs: number): void {
		const lastAt = this.lastBroadcastAt.get(settlerId) || 0
		const lastValues = this.lastBroadcastValues.get(settlerId)
		const hunger = state.hunger.value
		const fatigue = state.fatigue.value
		const deltaHunger = lastValues ? Math.abs(hunger - lastValues.hunger) : 1
		const deltaFatigue = lastValues ? Math.abs(fatigue - lastValues.fatigue) : 1

		if (nowMs - lastAt < this.BROADCAST_INTERVAL_MS &&
			deltaHunger < this.BROADCAST_MIN_DELTA &&
			deltaFatigue < this.BROADCAST_MIN_DELTA) {
			return
		}

		this.broadcastNeeds(settlerId, state, nowMs)
	}

	private broadcastNeeds(settlerId: string, state: NeedsState, nowMs?: number): void {
		this.lastBroadcastAt.set(settlerId, nowMs ?? 0)
		this.lastBroadcastValues.set(settlerId, {
			hunger: state.hunger.value,
			fatigue: state.fatigue.value
		})
		this.managers.population.setSettlerNeeds(settlerId, {
			hunger: state.hunger.value,
			fatigue: state.fatigue.value
		})
	}

	private evaluateNeedTransition(settlerId: string, needType: NeedType, value: number, meter: { urgentThreshold: number, criticalThreshold: number, satisfiedThreshold: number }): void {
		const last = this.lastLevels.get(settlerId) ?? createDefaultLevels()
		let nextLevel: NeedLevel

		if (last[needType] !== 'NONE' && value < meter.satisfiedThreshold) {
			nextLevel = value <= meter.criticalThreshold ? 'CRITICAL' : last[needType]
		} else if (value <= meter.criticalThreshold) {
			nextLevel = 'CRITICAL'
		} else if (value <= meter.urgentThreshold) {
			nextLevel = 'URGENT'
		} else {
			nextLevel = 'NONE'
		}

		if (nextLevel === 'URGENT' && last[needType] !== 'URGENT') {
			this.event.emit(Receiver.All, NeedsEvents.SS.NeedBecameUrgent, {
				settlerId,
				needType,
				value
			})
		}

		if (nextLevel === 'CRITICAL' && last[needType] !== 'CRITICAL') {
			this.event.emit(Receiver.All, NeedsEvents.SS.NeedBecameCritical, {
				settlerId,
				needType,
				value
			})
		}

		if (last[needType] !== 'NONE' && nextLevel === 'NONE' && value >= meter.satisfiedThreshold) {
			this.event.emit(Receiver.All, NeedsEvents.SS.NeedSatisfied, {
				settlerId,
				needType,
				value
			})
		}

		last[needType] = nextLevel
		this.lastLevels.set(settlerId, last)
	}
}
