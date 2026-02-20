import { DAY_PHASES, type DayPhase } from '@rugged/game'

export const DAY_MOMENTS = DAY_PHASES

export type DayMoment = DayPhase

export const DEFAULT_DAY_MOMENT: DayMoment = 'midday'

export const isDayMoment = (value: unknown): value is DayMoment => {
	return typeof value === 'string' && DAY_MOMENTS.includes(value as DayMoment)
}
