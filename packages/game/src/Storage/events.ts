export const StorageEvents = {
	SC: {
		StorageUpdated: 'sc:storage:storage-updated',      // Building storage updated (includes itemType, quantity)
		ReservationCreated: 'sc:storage:reservation-created',
		ReservationCancelled: 'sc:storage:reservation-cancelled'
	},
	SS: {
		StorageTick: 'ss:storage:storage-tick',            // Internal storage management tick
		InputRequested: 'ss:storage:input-requested'       // Building requested input (itemType, quantity)
	}
} as const

