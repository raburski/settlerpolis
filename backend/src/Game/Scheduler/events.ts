import { SchedulerEvents } from './types'

export const SchedulerEvents = {
	SS: {
		// Server to Server events (internal)
		Scheduled: 'ss:scheduler:scheduled',
		Triggered: 'ss:scheduler:triggered',
		Cancelled: 'ss:scheduler:cancelled',
		Schedule: 'ss:scheduler:schedule',
		Cancel: 'ss:scheduler:cancel'
	}
} as const 