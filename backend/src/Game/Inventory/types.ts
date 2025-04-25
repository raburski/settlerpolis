import { Item, ItemMetadata, ItemType } from '../Items/types'
import { PlayerSourcedData } from '../Players/types'

export interface Position {
	row: number
	column: number
}

export interface InventorySlot {
	position: Position
	item: Item | null
}

export interface Inventory {
	slots: InventorySlot[]
}

export interface InventoryData extends PlayerSourcedData {
	inventory: Inventory
}

export interface DropItemData extends PlayerSourcedData {
	itemId: string
}

export interface PickUpItemData extends PlayerSourcedData {
	itemId: string
}

export interface ConsumeItemData extends PlayerSourcedData {
	itemId: string
}

export interface MoveItemData extends PlayerSourcedData {
	itemId: string
	sourcePosition: Position
	targetPosition: Position
}

export interface AddItemData {
	item: Item
	position: Position
}
