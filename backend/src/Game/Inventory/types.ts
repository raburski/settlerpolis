import { Item, ItemType } from '../Items/types'
import { PlayerSourcedData } from '../Players/types'

export interface Inventory {
	items: Item[]
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

export interface ItemMetadata {
	id: string
	name: string
	description: string
	type: ItemType
	rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
	stackable: boolean
	maxStackSize?: number
	consumable: boolean
	effects?: {
		type: string
		value: number
		duration?: number
	}[]
	requirements?: {
		level?: number
		quest?: string
	}
	value: number
	icon?: string
}

export interface ItemTypeRequest {
	itemType: string
}

export interface ItemMetaResponse {
	metadata: ItemMetadata | null
} 