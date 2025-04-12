export type ScheduledEvent = {
	id: string
	eventType: string
	payload: any
	schedule: {
		type: 'interval' | 'cron' | 'once'
		value: string | number // Interval in ms, cron expression, or timestamp
	}
	lastRun?: Date
	nextRun?: Date
	isActive: boolean
}

export type ScheduleOptions = {
	id?: string // Optional - will be auto-generated if not provided
	eventType: string
	payload: any
	schedule: {
		type: 'interval' | 'cron' | 'once'
		value: string | number
	}
}
