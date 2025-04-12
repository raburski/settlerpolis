import { ScheduleOptions } from '../types'
import { LootEvents } from '../../Loot/events'

export const itemDropSchedules: ScheduleOptions[] = [
	{
		eventType: LootEvents.SS.Spawn,
		schedule: {
			type: 'interval',
			value: 10000
		},
		payload: {
			itemType: 'mozgotrzep',
			position: {
				x: { min: 100, max: 300 },
				y: { min: 300, max: 500 }
			},
			scene: 'FarmScene'
		}
	}
] 