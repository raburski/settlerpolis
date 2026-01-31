import type { NeedMeter } from './NeedMeter'
import { NeedType } from './NeedTypes'

export interface NeedsState {
	hunger: NeedMeter
	fatigue: NeedMeter
}

const DEFAULT_URGENT_THRESHOLD = 0.35
const DEFAULT_CRITICAL_THRESHOLD = 0.15
const DEFAULT_SATISFIED_THRESHOLD = 0.8

const HUNGER_DECAY_PER_MS = 0.0000025
const FATIGUE_DECAY_PER_MS = 0.0000015

export const createDefaultNeedsState = (): NeedsState => ({
	hunger: {
		value: 1,
		decayRatePerMs: HUNGER_DECAY_PER_MS,
		urgentThreshold: DEFAULT_URGENT_THRESHOLD,
		criticalThreshold: DEFAULT_CRITICAL_THRESHOLD,
		satisfiedThreshold: DEFAULT_SATISFIED_THRESHOLD
	},
	fatigue: {
		value: 1,
		decayRatePerMs: FATIGUE_DECAY_PER_MS,
		urgentThreshold: DEFAULT_URGENT_THRESHOLD,
		criticalThreshold: DEFAULT_CRITICAL_THRESHOLD,
		satisfiedThreshold: DEFAULT_SATISFIED_THRESHOLD
	}
})

export const getNeedMeter = (state: NeedsState, needType: NeedType): NeedMeter => {
	return needType === NeedType.Hunger ? state.hunger : state.fatigue
}
