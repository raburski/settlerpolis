import { guardShiftSchedules, innkeeperSchedules } from './npcSchedules'
// import {
// 	worldMaintenanceSchedules,
// 	specialEventSchedules,
// 	weatherSchedules
// } from './worldSchedules'
import { ScheduleOptions } from '../types'

// Combine all schedules
export const defaultSchedules: ScheduleOptions[] = [
	...guardShiftSchedules,
	...innkeeperSchedules,
	// ...worldMaintenanceSchedules,
	// ...specialEventSchedules,
	// ...weatherSchedules
]

// Export individual schedule groups for more granular control
export {
	guardShiftSchedules,
	innkeeperSchedules,
	// worldMaintenanceSchedules,
	// specialEventSchedules,
	// weatherSchedules
} 