import { ScheduleOptions } from '../types'
import { LootEvents } from '../../Loot/events'

export const itemDropSchedules: ScheduleOptions[] = [
	{
		eventType: LootEvents.SS.Spawn,
		schedule: {
			type: 'interval',
			value: 6000 // every minute
		},
		payload: {
			itemType: 'mozgotrzep',
			position: { x: 400, y: 100 },
			scene: 'FarmScene'
		}
	}
] 