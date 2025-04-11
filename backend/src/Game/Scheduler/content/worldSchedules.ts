import { Event } from '../../../events'
import { ScheduleOptions } from '../types'

// World maintenance and updates
export const worldMaintenanceSchedules: ScheduleOptions[] = [
	{
		id: 'npc-position-refresh',
		eventType: Event.NPC.SC.List,
		payload: {
			scene: 'farm-map',
			npcs: [] // Will be populated with current NPCs and randomized positions
		},
		schedule: {
			type: 'interval',
			value: 5 * 60 * 1000 // Every 5 minutes
		}
	},
	{
		id: 'daily-world-reset',
		eventType: Event.World.Reset,
		payload: {
			type: 'daily',
			timestamp: Date.now()
		},
		schedule: {
			type: 'cron',
			value: '0 0 * * *' // Every day at midnight
		}
	}
]

// Special events that occur at specific times
export const specialEventSchedules: ScheduleOptions[] = [
	{
		id: 'market-day-start',
		eventType: Event.World.SpecialEvent,
		payload: {
			eventType: 'market-day',
			status: 'start',
			location: 'town-square',
			duration: 8 * 60 * 60 * 1000 // 8 hours
		},
		schedule: {
			type: 'cron',
			value: '0 9 * * 6' // Every Saturday at 9 AM
		}
	},
	{
		id: 'night-festival',
		eventType: Event.World.SpecialEvent,
		payload: {
			eventType: 'night-festival',
			status: 'start',
			location: 'town-square',
			duration: 4 * 60 * 60 * 1000 // 4 hours
		},
		schedule: {
			type: 'cron',
			value: '0 20 15 * *' // 15th of each month at 8 PM
		}
	}
]

// Weather changes
export const weatherSchedules: ScheduleOptions[] = [
	{
		id: 'weather-update',
		eventType: Event.World.Weather,
		payload: {
			scene: 'farm-map',
			weather: 'random' // Will be processed to a random weather type
		},
		schedule: {
			type: 'interval',
			value: 30 * 60 * 1000 // Every 30 minutes
		}
	}
] 