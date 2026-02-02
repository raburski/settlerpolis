import { Position as WorldPosition } from '../types'
import { Position as InventoryPosition } from '../Inventory/types'
import { Item } from '../Items/types'

export interface PlayerSourcedData {
	sourcePlayerId?: string
}

export const EquipmentSlot = {
	Hand: 'hand'
} as const

export type EquipmentSlotType = typeof EquipmentSlot[keyof typeof EquipmentSlot]

// Re-export the type as a value for runtime usage
export const EquipmentSlotType = EquipmentSlot

export interface EquipItemData extends PlayerSourcedData {
	itemId: string
	slotType: EquipmentSlotType
}

export interface UnequipItemData extends PlayerSourcedData {
	slotType: EquipmentSlotType
	targetPosition?: InventoryPosition
}

export interface Player {
	playerId: string
	position: WorldPosition
	mapId: string        // Changed from scene to mapId
	appearance?: any // TODO: Define appearance type
	equipment?: Record<EquipmentSlotType, Item | null> // Full item object or null for each slot
}

export interface PlayerJoinData extends PlayerSourcedData {
	position: WorldPosition
	mapId: string        // This is the primary property now
	appearance?: any
	skipStartingItems?: boolean
}

export interface PlayerTransitionData extends PlayerSourcedData {
	position: WorldPosition
	mapId: string        // Changed from scene to mapId
}

export interface PlayerMoveData extends PlayerSourcedData {
	x: number
	y: number
}

export interface PlayerAttackData extends PlayerSourcedData {
	position: WorldPosition
}

export interface PlayerPlaceData extends PlayerSourcedData {
	position: WorldPosition
	rotation?: number
	metadata?: Record<string, any>
} 
