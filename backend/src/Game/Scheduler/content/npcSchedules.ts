import { Event } from '../../../events'
import { ScheduleOptions } from '../types'

// Guard shift changes throughout the day
export const guardShiftSchedules: ScheduleOptions[] = [
	{
		id: 'guard-morning-shift',
		eventType: Event.NPC.SC.Message,
		payload: {
			npcId: 'guard',
			message: "Good morning! The town is starting to wake up. Stay safe!"
		},
		schedule: {
			type: 'cron',
			value: '0 6 * * *' // Every day at 6 AM
		}
	},
	{
		id: 'guard-afternoon-shift',
		eventType: Event.NPC.SC.Message,
		payload: {
			npcId: 'guard',
			message: "Afternoon patrol. All seems quiet in town."
		},
		schedule: {
			type: 'cron',
			value: '0 14 * * *' // Every day at 2 PM
		}
	},
	{
		id: 'guard-night-shift',
		eventType: Event.NPC.SC.Message,
		payload: {
			npcId: 'guard',
			message: "It's getting dark. Be careful on the streets at night!"
		},
		schedule: {
			type: 'cron',
			value: '0 20 * * *' // Every day at 8 PM
		}
	}
]

// Innkeeper's routine
export const innkeeperSchedules: ScheduleOptions[] = [
	{
		id: 'innkeeper-open',
		eventType: Event.NPC.SC.Message,
		payload: {
			npcId: 'innkeeper',
			message: "Welcome! The inn is now open. Would you like a room?"
		},
		schedule: {
			type: 'cron',
			value: '0 7 * * *' // Every day at 7 AM
		}
	},
	{
		id: 'innkeeper-closing',
		eventType: Event.NPC.SC.Message,
		payload: {
			npcId: 'innkeeper',
			message: "The inn will be closing soon. Last call for rooms!"
		},
		schedule: {
			type: 'cron',
			value: '0 22 * * *' // Every day at 10 PM
		}
	}
] 