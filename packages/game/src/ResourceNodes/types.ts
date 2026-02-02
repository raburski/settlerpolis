import { Position } from '../types'
import { ItemType } from '../Items/types'
import type { MapId, ResourceNodeId, MapObjectId } from '../ids'

export type { ResourceNodeId } from '../ids'

export type ResourceNodeType = string

export interface ResourceNodeDefinition {
	id: ResourceNodeType
	name: string
	nodeItemType: ItemType // Item type used for map object rendering
	outputItemType: ItemType // Item type produced by harvesting
	harvestQuantity: number
	harvestTimeMs?: number
	maxHarvests: number // Number of harvest actions before depletion
	blocksMovement?: boolean
}

export interface ResourceNodeSpawn {
	nodeType: ResourceNodeType
	mapId: MapId
	position: Position
	quantity?: number // Overrides definition.maxHarvests if provided
	tileBased?: boolean // If true, position is in tiles (default: true)
}

export interface ResourceNodeInstance {
	id: ResourceNodeId
	nodeType: ResourceNodeType
	mapId: MapId
	position: Position
	remainingHarvests: number
	reservedBy?: string
	mapObjectId?: MapObjectId
	matureAtMs?: number
	spoilAtMs?: number
	despawnAtMs?: number
	isSpoiled?: boolean
}
