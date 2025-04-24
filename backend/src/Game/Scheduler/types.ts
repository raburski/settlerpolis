import { Time } from '../Time/types'

export enum ScheduleType {
	Interval = 'interval',
	Cron = 'cron',
	Once = 'once',
	GameTime = 'game-time'
}

export type ScheduledEvent = {
	id: string
	eventType: string
	payload: any
	schedule: {
		type: ScheduleType
		value: string | number // Interval in ms, cron expression, timestamp, or game time string (HH:MM)
		day?: number // Optional day of month for game-time
		month?: number // Optional month for game-time
		year?: number // Optional year for game-time
	}
	lastRun?: Date
	nextRun?: Date
	isActive: boolean
	createdAt: Time
}

export type ScheduleOptions = {
	id?: string // Optional - will be auto-generated if not provided
	eventType: string
	payload: any
	schedule: {
		type: ScheduleType
		value: string | number
		day?: number
		month?: number
		year?: number
	}
}
