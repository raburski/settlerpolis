import { guardShiftSchedules, innkeeperSchedules, shopSchedules } from './npcSchedules'
import { itemDropSchedules } from './itemDrops'
import { timeSchedules } from './timeSchedules'
import { ScheduleOptions } from '../types'

// Combine all schedules
export const defaultSchedules: ScheduleOptions[] = [
	...guardShiftSchedules,
	...innkeeperSchedules,
	...shopSchedules,
	...itemDropSchedules,
	...timeSchedules
]

// Export individual schedule groups for more granular control
export {
	guardShiftSchedules,
	innkeeperSchedules,
	shopSchedules,
	itemDropSchedules,
	timeSchedules
} 