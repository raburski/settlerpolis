export interface Time {
	hours: number
	minutes: number
	day: number
	month: number
	year: number
}

export interface TimeData {
	time: Time
	isPaused: boolean
	timeSpeed: number // real ms to ingame minute
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
}

export const MONTHS_IN_YEAR = 12
export const DAYS_IN_MONTH = 30 // Simplified calendar with fixed month length 