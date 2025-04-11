import { Event } from '../../events'

export type ScheduledEvent = {
	id: string
	eventType: Event
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
	eventType: Event
	payload: any
	schedule: {
		type: 'interval' | 'cron' | 'once'
		value: string | number
	}
}

export type SchedulerEvents = {
	SS: {
		Scheduled: 'ss:scheduler:scheduled'
		Triggered: 'ss:scheduler:triggered'
		Cancelled: 'ss:scheduler:cancelled'
		Schedule: 'ss:scheduler:schedule'
		Cancel: 'ss:scheduler:cancel'
	}
}
