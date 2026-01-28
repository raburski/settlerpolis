export interface StorageCapacity {
	// Record of itemType -> maximum capacity for that item type
	// If itemType is not in the record, that item type cannot be stored
	// Empty record = no storage capacity
	capacities: Record<string, number> // itemType -> max capacity
}

export interface BuildingStorage {
	buildingInstanceId: string
	buffer: Map<string, number>  // itemType -> quantity (runtime only)
	reserved: Map<string, number>  // itemType -> reserved quantity (for incoming/outgoing deliveries) (runtime only)
	// Note: Storage capacities are defined in BuildingDefinition, not stored here
	// StorageManager reads capacities from BuildingDefinition when needed
}

export interface StorageReservation {
	reservationId: string
	buildingInstanceId: string
	itemType: string
	quantity: number
	reservedBy: string // carrierId or buildingInstanceId
	status: 'pending' | 'in_transit' | 'delivered' | 'cancelled'
	createdAt: number
	isOutgoing?: boolean // true for outgoing reservations (items being transported away), false for incoming (space reserved for delivery)
}

