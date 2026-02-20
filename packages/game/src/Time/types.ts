export interface Time {
	hours: number
	minutes: number
	day: number
	month: number
	year: number
}

export const DAY_PHASES = ['morning', 'midday', 'evening', 'night'] as const
export type DayPhase = (typeof DAY_PHASES)[number]

export interface DayPhaseSpeeds {
	morning: number
	midday: number
	evening: number
	night: number
}

export const DEFAULT_DAY_PHASE_SPEEDS: DayPhaseSpeeds = {
	morning: 1000,
	midday: 1000,
	evening: 850,
	night: 650
}

export const isDayPhase = (value: unknown): value is DayPhase => {
	return typeof value === 'string' && DAY_PHASES.includes(value as DayPhase)
}

export const getDayPhaseFromHour = (hour: number): DayPhase => {
	const normalizedHour = ((Math.floor(hour) % 24) + 24) % 24
	if (normalizedHour >= 6 && normalizedHour < 12) return 'morning'
	if (normalizedHour >= 12 && normalizedHour < 17) return 'midday'
	if (normalizedHour >= 17 && normalizedHour < 21) return 'evening'
	return 'night'
}

export interface TimeData {
	time: Time
	isPaused: boolean
	timeSpeed: number // real ms to ingame minute (legacy global speed)
	dayPhaseSpeeds: DayPhaseSpeeds // real ms to ingame minute by phase
}

export interface TimeUpdateEventData {
	time: Time
}

export interface TimeSpeedUpdateEventData {
	timeSpeed: number
}

export interface TimePauseEventData {
	isPaused: boolean
}

export interface TimeSyncEventData {
	time: Time
	isPaused: boolean
	timeSpeed: number
	dayPhase: DayPhase
	dayPhaseTimeSpeed: number
	dayPhaseSpeeds: DayPhaseSpeeds
}

export interface TimeDayPhaseSyncEventData {
	time: Time
	isPaused: boolean
	dayPhase: DayPhase
	dayPhaseTimeSpeed: number
	dayPhaseSpeeds: DayPhaseSpeeds
}

export interface TimeFastForwardToPhaseEventData {
	dayPhase: DayPhase
}

export const MONTHS_IN_YEAR = 12
export const DAYS_IN_MONTH = 30 // Simplified calendar with fixed month length 
