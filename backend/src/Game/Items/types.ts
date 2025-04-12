import { Position } from '../../types'

export type ItemType = string

export enum ItemCategory {
	Tool = 'tool',
	Consumable = 'consumable',
	Material = 'material',
	Placeable = 'placeable'
}

export interface Item {
	id: string
	itemType: ItemType
}

export interface ItemMetadata {
	id: ItemType
	name: string
    emoji: string
	description: string
	category: ItemCategory
	stackable: boolean
	maxStackSize?: number
}

export interface ItemTypeRequest {
	itemType: string
}

export interface ItemTypeResponse {
	metadata: ItemMetadata | null
} 