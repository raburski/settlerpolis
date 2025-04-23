export interface WorldTime {
	hours: number
	minutes: number
	day: number
	month: number
	year: number
}

export interface WorldTimeData {
	time: WorldTime
	isPaused: boolean
	timeSpeed: number // real ms to ingame minute
}

export interface WorldTimeUpdateEventData {
	time: WorldTime
}

export interface WorldTimeSpeedUpdateEventData {
	timeSpeed: number
}

export interface WorldTimePauseEventData {
	isPaused: boolean
}

export interface WorldTimeSyncEventData {
	time: WorldTime
	isPaused: boolean
	timeSpeed: number
}

export const MONTHS_IN_YEAR = 12
export const DAYS_IN_MONTH = 30 // Simplified calendar with fixed month length 