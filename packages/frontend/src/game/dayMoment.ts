export const DAY_MOMENTS = ['dawn', 'midday', 'dusk', 'night'] as const

export type DayMoment = (typeof DAY_MOMENTS)[number]

export const DEFAULT_DAY_MOMENT: DayMoment = 'midday'

export const isDayMoment = (value: unknown): value is DayMoment => {
	return typeof value === 'string' && DAY_MOMENTS.includes(value as DayMoment)
}
