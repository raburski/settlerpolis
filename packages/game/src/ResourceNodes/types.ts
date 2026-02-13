import { Position } from '../types'
import { ItemType } from '../Items/types'
import type { MapId, ResourceNodeId, MapObjectId } from '../ids'
import type { MapObject } from '../MapObjects/types'

export type { ResourceNodeId } from '../ids'

export type ResourceNodeType = string

export type ResourceDepositType = 'coal' | 'iron' | 'gold' | 'stone' | 'empty'

export interface ResourceNodeDefinition {
	id: ResourceNodeType
	name: string
	nodeItemType: ItemType // Item type used for map object rendering
	outputItemType: ItemType // Item type produced by harvesting
	harvestQuantity: number
	maxHarvests: number // Number of harvest actions before depletion
	regenTimeMs?: number // Time in ms before depleted nodes regenerate
	blocksMovement?: boolean
	footprint?: {
		width: number
		height?: number
	}
}

export interface ResourceNodeRenderDefinition {
	id: ResourceNodeType
	footprint?: {
		width: number
		height?: number
		length?: number
	}
	render?: {
		modelSrc: string
		transform?: {
			rotation?: { x: number; y: number; z: number }
			scale?: { x: number; y: number; z: number }
			elevation?: number
			offset?: { x: number; y: number; z: number }
		}
	}
	renders?: Array<{
		modelSrc: string
		weight?: number
		transform?: {
			rotation?: { x: number; y: number; z: number }
			scale?: { x: number; y: number; z: number }
			elevation?: number
			offset?: { x: number; y: number; z: number }
		}
	}>
}

export interface ResourceNodeSpawn {
	nodeType: ResourceNodeType
	mapId: MapId
	position: Position
	quantity?: number // Overrides definition.maxHarvests if provided
	tileBased?: boolean // If true, position is in tiles (default: true)
	depositType?: ResourceDepositType
}

export interface ResourceNodeInstance {
	id: ResourceNodeId
	nodeType: ResourceNodeType
	mapId: MapId
	position: Position
	remainingHarvests: number
	reservedBy?: string
	mapObjectId?: MapObjectId
	claimedByBuildingId?: string
	matureAtMs?: number
	plantedAtMs?: number
	spoilAtMs?: number
	despawnAtMs?: number
	isSpoiled?: boolean
	depositType?: ResourceDepositType
	depositDiscovered?: boolean
	prospectingStatus?: 'queued' | 'in_progress'
	prospectingJobId?: string
	prospectingSettlerId?: string
}

export interface ResourceNodeBounds {
	minX: number
	minY: number
	maxX: number
	maxY: number
}

export interface ResourceNodesQueryData {
	mapId: MapId
	bounds: ResourceNodeBounds
	requestId?: number
	chunkKey?: string
}

export interface ResourceNodesSyncData {
	mapId: MapId
	nodes: MapObject[]
	requestId?: number
	chunkKey?: string
}

export interface ResourceNodeProspectRequestData {
	nodeId: ResourceNodeId
}
