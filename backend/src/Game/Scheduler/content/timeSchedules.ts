import { Event } from '../../../events'
import { ScheduleOptions, ScheduleType } from '../types'

// World maintenance and updates
export const worldMaintenanceSchedules: ScheduleOptions[] = [
	{
		id: 'quest-check-new',
		eventType: Event.Quest.SC.List,
		payload: {},
		schedule: {
			type: ScheduleType.Interval,
			value: 5 * 60 * 1000 // Every 5 minutes
		}
	},
	{
		id: 'quest-reset-daily',
		eventType: Event.Quest.SC.List,
		payload: {},
		schedule: {
			type: ScheduleType.Cron,
			value: '0 0 * * *' // Every day at midnight
		}
	}
]

// Special events that occur at specific times
export const specialEventSchedules: ScheduleOptions[] = [
	{
		id: 'monthly-market',
		eventType: Event.Time.SS.Update,
		payload: {
			eventType: 'monthly-market',
			status: 'start',
			location: 'town-square',
			duration: 8 * 60 * 60 * 1000 // 8 hours
		},
		schedule: {
			type: ScheduleType.GameTime,
			value: '10:00',
			day: 15 // Every 15th of the month
		}
	},
	{
		id: 'spring-festival',
		eventType: Event.Time.SS.Update,
		payload: {
			eventType: 'spring-festival',
			status: 'start',
			location: 'town-square',
			duration: 24 * 60 * 60 * 1000 // 24 hours
		},
		schedule: {
			type: ScheduleType.GameTime,
			value: '12:00',
			month: 3 // March (spring)
		}
	},
	{
		id: 'game-anniversary',
		eventType: Event.Time.SS.Update,
		payload: {
			eventType: 'anniversary',
			status: 'start',
			location: 'town-square',
			duration: 24 * 60 * 60 * 1000 // 24 hours
		},
		schedule: {
			type: ScheduleType.GameTime,
			value: '00:00',
			day: 1,
			month: 1,
			year: 2024 // January 1st, 2024
		}
	}
]

// Weather changes
export const weatherSchedules: ScheduleOptions[] = [
	{
		id: 'weather-update',
		eventType: Event.Time.SS.Update,
		payload: {
			scene: 'farm-map',
			weather: 'random' // Will be processed to a random weather type
		},
		schedule: {
			type: ScheduleType.Interval,
			value: 30 * 60 * 1000 // Every 30 minutes
		}
	}
]

export const timeSchedules: ScheduleOptions[] = [
	{
		id: 'morning-update',
		eventType: Event.Time.SS.Update,
		payload: {
			time: {
				hours: 6,
				minutes: 0,
				day: 1,
				month: 1,
				year: 1
			}
		},
		schedule: {
			type: ScheduleType.GameTime,
			value: '06:00'
		}
	},
	{
		id: 'noon-update',
		eventType: Event.Time.SS.Update,
		payload: {
			time: {
				hours: 12,
				minutes: 0,
				day: 1,
				month: 1,
				year: 1
			}
		},
		schedule: {
			type: ScheduleType.GameTime,
			value: '12:00'
		}
	},
	{
		id: 'evening-update',
		eventType: Event.Time.SS.Update,
		payload: {
			time: {
				hours: 18,
				minutes: 0,
				day: 1,
				month: 1,
				year: 1
			}
		},
		schedule: {
			type: ScheduleType.GameTime,
			value: '18:00'
		}
	},
	{
		id: 'midnight-update',
		eventType: Event.Time.SS.Update,
		payload: {
			time: {
				hours: 0,
				minutes: 0,
				day: 1,
				month: 1,
				year: 1
			}
		},
		schedule: {
			type: ScheduleType.GameTime,
			value: '00:00'
		}
	}
] 