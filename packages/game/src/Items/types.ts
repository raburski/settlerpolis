import { Position } from '../types'
import type { ProfessionType } from '../Population/types'

export type ItemType = string

export enum ItemCategory {
	Tool = 'tool',
	Consumable = 'consumable',
	Material = 'material',
	Placeable = 'placeable',
	Quest = 'quest'
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
	spoilage?: {
		shelfLifeDays: number
		baseRatePerDay: number
		lossMinPct: number
		lossMaxPct: number
	}
	placement?: {
		size: {
			width: number
			height: number
		}
		blocksMovement: boolean
		blocksPlacement: boolean
	}
	changesProfession?: ProfessionType // ProfessionType that this item grants when picked up (e.g., 'builder', 'woodcutter')
	changesProfessions?: ProfessionType[] // Multiple professions this item can grant (e.g., builders and metallurgists)
}

export interface ItemTypeRequest {
	itemType: ItemType
}

export interface ItemTypeResponse {
	itemType: ItemType
	meta: ItemMetadata | null
} 
