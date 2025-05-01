import { Event, ScheduleOptions, ScheduleType } from "@rugged/game"

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
			type: ScheduleType.Cron,
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
			type: ScheduleType.Cron,
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
			type: ScheduleType.Cron,
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
			type: ScheduleType.Cron,
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
			type: ScheduleType.Cron,
			value: '0 22 * * *' // Every day at 10 PM
		}
	}
]

// Shop schedules
export const shopSchedules: ScheduleOptions[] = [
	{
		id: 'general-store-open',
		eventType: Event.NPC.SC.Message,
		payload: {
			npcId: 'shopkeeper',
			message: "The general store is now open! Come on in and browse our wares."
		},
		schedule: {
			type: ScheduleType.GameTime,
			value: '09:00' // 9:00 AM in-game time
		}
	},
	{
		id: 'general-store-close',
		eventType: Event.NPC.SC.Message,
		payload: {
			npcId: 'shopkeeper',
			message: "We're closing up for the day. Please come back tomorrow!"
		},
		schedule: {
			type: ScheduleType.GameTime,
			value: '17:00' // 5:00 PM in-game time
		}
	}
]

export const itemDropSchedules: ScheduleOptions[] = [
	{
		eventType: Event.Loot.SS.Spawn,
		schedule: {
			type: ScheduleType.Interval,
			value: 10000
		},
		payload: {
			itemType: 'mozgotrzep',
			position: {
				x: { min: 100, max: 300 },
				y: { min: 300, max: 500 }
			},
			mapId: 'test1'
		}
	}
] 


// Time-based schedules
export const timeSchedules: ScheduleOptions[] = [
	{
		id: 'day-night-cycle',
		eventType: Event.Time.SC.Updated,
		payload: {
			time: {
				hours: 0,
				minutes: 0
			}
		},
		schedule: {
			type: ScheduleType.GameTime,
			value: '00:00' // Midnight in-game time
		}
	}
]

// Combine all schedules
export const schedules: ScheduleOptions[] = [
	...guardShiftSchedules,
	...innkeeperSchedules,
	...shopSchedules,
	...itemDropSchedules,
	...timeSchedules
]
