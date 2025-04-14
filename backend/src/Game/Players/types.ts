import { Position as WorldPosition } from '../../types'
import { Position as InventoryPosition } from '../Inventory/types'
import { Item } from '../Items/types'

export interface PlayerSourcedData {
	sourcePlayerId?: string
}

export enum EquipmentSlotType {
	Hand = 'hand'
}

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
	scene: string
	appearance?: any // TODO: Define appearance type
	equipment?: Record<EquipmentSlotType, Item | null> // Full item object or null for each slot
}

export interface PlayerJoinData extends PlayerSourcedData {
	position: WorldPosition
	scene: string
	appearance?: any
}

export interface PlayerTransitionData extends PlayerSourcedData {
	position: WorldPosition
	scene: string
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