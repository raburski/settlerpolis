import { guardShiftSchedules, innkeeperSchedules, shopSchedules } from './npcSchedules'
import { itemDropSchedules } from './itemDrops'
import {
	worldMaintenanceSchedules,
	specialEventSchedules,
	weatherSchedules
} from './worldSchedules'
import { ScheduleOptions } from '../types'

// Combine all schedules
export const defaultSchedules: ScheduleOptions[] = [
	...guardShiftSchedules,
	...innkeeperSchedules,
	...shopSchedules,
	...itemDropSchedules,
	...worldMaintenanceSchedules,
	...specialEventSchedules,
	...weatherSchedules
]

// Export individual schedule groups for more granular control
export {
	guardShiftSchedules,
	innkeeperSchedules,
	shopSchedules,
	itemDropSchedules,
	worldMaintenanceSchedules,
	specialEventSchedules,
	weatherSchedules
} 