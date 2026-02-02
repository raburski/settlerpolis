import { Time } from '../Time/types'
import { Condition, Effect } from '../ConditionEffect/types'

export enum ScheduleType {
	Interval = 'interval',
	Cron = 'cron',
	Once = 'once',
	GameTime = 'game-time'
}

export type ScheduleOptions = {
	id?: string // Optional - will be auto-generated if not provided
	schedule: {
		type: ScheduleType
		value: string | number
		day?: number
		month?: number
		year?: number
	}
	condition?: Condition
	conditions?: Condition[]
	effect?: Effect
	effects?: Effect[]
	isActive?: boolean // Optional - defaults to true if not specified
}

export type ScheduledEvent = ScheduleOptions & {
	id: string // Make id required for ScheduledEvent
	lastRunAtSimMs?: number
	nextRunAtSimMs?: number
	lastRunAtGameTimeKey?: string
	isActive: boolean // Required in ScheduledEvent (will be set to true if not specified in options)
	createdAt: Time
}
