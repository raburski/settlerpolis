import type { ItemType } from '../Items/types'

export enum StorageReservationStatus {
	Pending = 'pending',
	InTransit = 'in_transit',
	Delivered = 'delivered',
	Cancelled = 'cancelled'
}

export interface StorageCapacity {
	// Record of itemType -> maximum capacity for that item type
	// If itemType is not in the record, that item type cannot be stored
	// Empty record = no storage capacity
	capacities: Record<ItemType, number> // itemType -> max capacity
	// Optional storage preservation modifiers (lower = slows spoilage)
	preservation?: {
		spoilageMultiplier: number
	}
	// Fixed storage slots (tile offsets relative to building origin)
	slots?: Array<{
		itemType: ItemType
		offset: { x: number, y: number }
		hidden?: boolean
		maxQuantity?: number
	}>
}

export interface StorageSlot {
	slotId: string
	buildingInstanceId: string
	itemType: ItemType
	position: import('../types').Position
	pileSize: number
	quantity: number
	batches: Array<{ quantity: number, storedAtMs: number }>
	reservedIncoming: number
	reservedOutgoing: number
	mapObjectId?: string
	hidden?: boolean
}

export interface BuildingStorage {
	buildingInstanceId: string
	slots: Map<string, StorageSlot>
	slotsByItem: Map<ItemType, string[]>
}

export interface StorageReservation {
	reservationId: string
	buildingInstanceId: string
	itemType: ItemType
	quantity: number
	reservedBy: string // carrierId or buildingInstanceId
	status: StorageReservationStatus
	createdAt: number
	isOutgoing?: boolean // true for outgoing reservations (items being transported away), false for incoming (space reserved for delivery)
	slotId?: string
}

export interface StorageReservationResult {
	reservationId: string
	slotId: string
	position: import('../types').Position
	quantity: number
}
