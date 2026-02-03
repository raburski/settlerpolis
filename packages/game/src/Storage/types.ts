import type { ItemType } from '../Items/types'
import type { BuildingInstanceId, MapObjectId, SettlerId, StorageReservationId, StorageSlotId } from '../ids'

export type { StorageReservationId, StorageSlotId } from '../ids'

export enum StorageReservationStatus {
	Pending = 'pending',
	InTransit = 'in_transit',
	Delivered = 'delivered',
	Cancelled = 'cancelled'
}

export type StorageSlotRole = 'incoming' | 'outgoing' | 'any'

export interface StorageSlotDefinition {
	itemType: ItemType | '*'
	offset?: { x: number, y: number }
	hidden?: boolean
	maxQuantity?: number
	role?: StorageSlotRole
}

export interface StoragePreservation {
	// Lower multiplier slows spoilage. 1 = normal spoilage.
	spoilageMultiplier: number
}

export interface StorageSlot {
	slotId: StorageSlotId
	buildingInstanceId: BuildingInstanceId
	itemType: ItemType | '*'
	position: import('../types').Position
	pileSize: number
	quantity: number
	batches: Array<{ quantity: number, storedAtMs: number }>
	reservedIncoming: number
	reservedOutgoing: number
	mapObjectId?: MapObjectId
	hidden?: boolean
	role?: StorageSlotRole
	isWildcard?: boolean
}

export interface BuildingStorage {
	buildingInstanceId: BuildingInstanceId
	slots: Map<StorageSlotId, StorageSlot>
	slotsByItem: Map<string, StorageSlotId[]>
}

export interface StorageReservation {
	reservationId: StorageReservationId
	buildingInstanceId: BuildingInstanceId
	itemType: ItemType
	quantity: number
	reservedBy: SettlerId | BuildingInstanceId // carrierId or buildingInstanceId
	status: StorageReservationStatus
	createdAt: number
	isOutgoing?: boolean // true for outgoing reservations (items being transported away), false for incoming (space reserved for delivery)
	slotId?: StorageSlotId
}

export interface StorageReservationResult {
	reservationId: StorageReservationId
	slotId: StorageSlotId
	position: import('../types').Position
	quantity: number
}
