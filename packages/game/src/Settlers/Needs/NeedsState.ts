import type { NeedMeter } from './NeedMeter'
import { NeedType } from './NeedTypes'

export interface NeedsState {
	hunger: NeedMeter
	fatigue: NeedMeter
}

export const NEED_URGENT_THRESHOLD = 0.35
export const NEED_CRITICAL_THRESHOLD = 0.15
export const NEED_SATISFIED_THRESHOLD = 0.8

const HUNGER_DECAY_PER_MS = 0.0000016
const FATIGUE_DECAY_PER_MS = 0.0000012

export const createDefaultNeedsState = (): NeedsState => ({
	hunger: {
		value: 1,
		decayRatePerMs: HUNGER_DECAY_PER_MS,
		urgentThreshold: NEED_URGENT_THRESHOLD,
		criticalThreshold: NEED_CRITICAL_THRESHOLD,
		satisfiedThreshold: NEED_SATISFIED_THRESHOLD
	},
	fatigue: {
		value: 1,
		decayRatePerMs: FATIGUE_DECAY_PER_MS,
		urgentThreshold: NEED_URGENT_THRESHOLD,
		criticalThreshold: NEED_CRITICAL_THRESHOLD,
		satisfiedThreshold: NEED_SATISFIED_THRESHOLD
	}
})

export const getNeedMeter = (state: NeedsState, needType: NeedType): NeedMeter => {
	return needType === NeedType.Hunger ? state.hunger : state.fatigue
}
