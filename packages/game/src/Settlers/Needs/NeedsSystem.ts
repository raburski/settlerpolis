import type { EventManager } from '../../events'
import { Receiver } from '../../Receiver'
import { SimulationEvents } from '../../Simulation/events'
import type { SimulationTickData } from '../../Simulation/types'
import type { PopulationManager } from '../../Population'
import { SettlerState } from '../../Population/types'
import { PopulationEvents } from '../../Population/events'
import { MovementEvents } from '../../Movement/events'
import { NeedType, NeedLevel } from './NeedTypes'
import { createDefaultNeedsState, getNeedMeter, type NeedsState } from './NeedsState'
import { NeedsEvents } from './events'
import type { NeedsSystemSnapshot } from '../../state/types'

export interface NeedsSystemDeps {
	population: PopulationManager
}

const clamp = (value: number, min: number, max: number): number => {
	return Math.min(max, Math.max(min, value))
}

const TILE_SIZE_PX = 32
const FATIGUE_CARRY_BASE_PER_TILE = 0.0006
const FATIGUE_CARRY_DISTANCE_EXPONENT = 1.3
const HEALTH_DECAY_PER_MS = 0.0000007

const createDefaultLevels = (): Record<NeedType, NeedLevel> => ({
	[NeedType.Hunger]: NeedLevel.None,
	[NeedType.Fatigue]: NeedLevel.None
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
		this.event.on(SimulationEvents.SS.SlowTick, (data: SimulationTickData) => {
			this.handleSimulationTick(data)
		})
		this.event.on(MovementEvents.SS.SegmentComplete, (data: { entityId: string, segmentDistance: number, totalDistance: number }) => {
			this.handleMovementSegment(data)
		})
		this.event.on(PopulationEvents.SS.SettlerDied, (data: { settlerId: string }) => {
			this.clearSettlerNeeds(data.settlerId)
		})
	}

	private handleSimulationTick(data: SimulationTickData): void {
		const settlers = this.managers.population.getSettlers()
		for (const settler of settlers) {
			const state = this.ensureNeedsState(settler.id)
			this.updateNeed(settler.id, NeedType.Hunger, state, data.deltaMs)
			this.updateNeed(settler.id, NeedType.Fatigue, state, data.deltaMs)
			const hungerCritical = state.hunger.value <= state.hunger.criticalThreshold
			const fatigueCritical = state.fatigue.value <= state.fatigue.criticalThreshold
			const hungerEmpty = state.hunger.value <= 0
			const fatigueEmpty = state.fatigue.value <= 0
			const unmetCount = (hungerCritical ? 1 : 0) + (fatigueCritical ? 1 : 0)
			const emptyCount = (hungerEmpty ? 1 : 0) + (fatigueEmpty ? 1 : 0)
			const healthWeight = unmetCount + emptyCount
			if (healthWeight > 0) {
				const healthDelta = -HEALTH_DECAY_PER_MS * data.deltaMs * healthWeight
				const alive = this.managers.population.addSettlerHealthDelta(settler.id, healthDelta)
				if (!alive) {
					this.clearSettlerNeeds(settler.id)
					continue
				}
			}
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

	public addNeedDelta(settlerId: string, needType: NeedType, delta: number): void {
		const state = this.ensureNeedsState(settlerId)
		const meter = getNeedMeter(state, needType)
		meter.value = clamp(meter.value + delta, 0, 1)
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

	public resolveNeed(settlerId: string, needType: NeedType, value: number): void {
		const state = this.ensureNeedsState(settlerId)
		const meter = getNeedMeter(state, needType)
		meter.value = clamp(value, 0, 1)

		const levels = this.lastLevels.get(settlerId) ?? createDefaultLevels()
		levels[needType] = NeedLevel.None
		this.lastLevels.set(settlerId, levels)

		this.event.emit(Receiver.All, NeedsEvents.SS.NeedSatisfied, {
			settlerId,
			needType,
			value: meter.value
		})

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

	private clearSettlerNeeds(settlerId: string): void {
		this.needsBySettler.delete(settlerId)
		this.lastLevels.delete(settlerId)
		this.lastBroadcastAt.delete(settlerId)
		this.lastBroadcastValues.delete(settlerId)
	}

	private updateNeed(settlerId: string, needType: NeedType, state: NeedsState, deltaMs: number): void {
		const meter = getNeedMeter(state, needType)
		const decay = meter.decayRatePerMs * deltaMs
		const modifier = meter.modifiers ?? 0
		const nextValue = clamp(meter.value - decay + modifier, 0, 1)
		meter.value = nextValue
		this.evaluateNeedTransition(settlerId, needType, nextValue, meter)
	}

	private handleMovementSegment(data: { entityId: string, segmentDistance: number, totalDistance: number }): void {
		if (data.segmentDistance <= 0 || data.totalDistance <= 0) {
			return
		}

		const settler = this.managers.population.getSettler(data.entityId)
		if (!settler) {
			return
		}

		const isCarrying = Boolean(settler.stateContext.carryingItemType) || settler.state === SettlerState.CarryingItem
		if (!isCarrying) {
			return
		}

		const totalTiles = Math.max(0.001, data.totalDistance / TILE_SIZE_PX)
		const fatigueBudget = FATIGUE_CARRY_BASE_PER_TILE * Math.pow(totalTiles, FATIGUE_CARRY_DISTANCE_EXPONENT)
		const segmentShare = data.segmentDistance / data.totalDistance
		const fatigueDelta = -fatigueBudget * segmentShare

		this.addNeedDelta(settler.id, NeedType.Fatigue, fatigueDelta)
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

		if (last[needType] !== NeedLevel.None && value < meter.satisfiedThreshold) {
			nextLevel = value <= meter.criticalThreshold ? NeedLevel.Critical : last[needType]
		} else if (value <= meter.criticalThreshold) {
			nextLevel = NeedLevel.Critical
		} else if (value <= meter.urgentThreshold) {
			nextLevel = NeedLevel.Urgent
		} else {
			nextLevel = NeedLevel.None
		}

		if (nextLevel === NeedLevel.Urgent && last[needType] !== NeedLevel.Urgent) {
			this.event.emit(Receiver.All, NeedsEvents.SS.NeedBecameUrgent, {
				settlerId,
				needType,
				value
			})
		}

		if (nextLevel === NeedLevel.Critical && last[needType] !== NeedLevel.Critical) {
			this.event.emit(Receiver.All, NeedsEvents.SS.NeedBecameCritical, {
				settlerId,
				needType,
				value
			})
		}

		if (last[needType] !== NeedLevel.None && nextLevel === NeedLevel.None && value >= meter.satisfiedThreshold) {
			this.event.emit(Receiver.All, NeedsEvents.SS.NeedSatisfied, {
				settlerId,
				needType,
				value
			})
		}

		last[needType] = nextLevel
		this.lastLevels.set(settlerId, last)
	}

	serialize(): NeedsSystemSnapshot {
		return {
			needsBySettler: Array.from(this.needsBySettler.entries()).map(([settlerId, state]) => ([
				settlerId,
				{
					hunger: { ...state.hunger },
					fatigue: { ...state.fatigue }
				}
			])),
			lastLevels: Array.from(this.lastLevels.entries()).map(([settlerId, levels]) => ([
				settlerId,
				{ ...levels }
			]))
		}
	}

	deserialize(state: NeedsSystemSnapshot): void {
		this.needsBySettler.clear()
		this.lastLevels.clear()
		this.lastBroadcastAt.clear()
		this.lastBroadcastValues.clear()

		for (const [settlerId, needs] of state.needsBySettler) {
			this.needsBySettler.set(settlerId, {
				hunger: { ...needs.hunger },
				fatigue: { ...needs.fatigue }
			})
		}

		for (const [settlerId, levels] of state.lastLevels) {
			this.lastLevels.set(settlerId, { ...levels })
		}
	}

	reset(): void {
		this.needsBySettler.clear()
		this.lastLevels.clear()
		this.lastBroadcastAt.clear()
		this.lastBroadcastValues.clear()
	}
}
