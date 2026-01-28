import { Position } from '../types'
import { ItemType } from '../Items/types'

export type ResourceNodeType = string

export interface ResourceNodeDefinition {
	id: ResourceNodeType
	name: string
	nodeItemType: ItemType // Item type used for map object rendering
	outputItemType: ItemType // Item type produced by harvesting
	harvestQuantity: number
	maxHarvests: number // Number of harvest actions before depletion
}

export interface ResourceNodeSpawn {
	nodeType: ResourceNodeType
	mapName: string
	position: Position
	quantity?: number // Overrides definition.maxHarvests if provided
	tileBased?: boolean // If true, position is in tiles (default: true)
}

export interface ResourceNodeInstance {
	id: string
	nodeType: ResourceNodeType
	mapName: string
	position: Position
	remainingHarvests: number
	reservedBy?: string
	mapObjectId?: string
}
