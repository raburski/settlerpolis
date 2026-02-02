import { Position, MapId } from '../types'
import { ItemType } from '../Items/types'
import type { ProfessionType } from '../Population/types'
import type { ResourceNodeType } from '../ResourceNodes/types'

export type BuildingId = string

export enum ConstructionStage {
	CollectingResources = 'collecting_resources', // Building placed, resources being collected by carriers
	Constructing = 'constructing',                // Resources collected, builder working
	Completed = 'completed'
}

export interface BuildingCost {
	itemType: ItemType
	quantity: number
}

export interface ProductionRecipe {
	inputs: Array<{
		itemType: ItemType
		quantity: number
	}>
	outputs: Array<{
		itemType: ItemType
		quantity: number
	}>
	productionTime: number // Time in seconds to produce one batch
}

export enum ProductionStatus {
	Idle = 'idle',
	NoInput = 'no_input',
	InProduction = 'in_production',
	NoWorker = 'no_worker', // Building requires worker but none assigned
	Paused = 'paused'
}

export interface BuildingProduction {
	buildingInstanceId: string
	status: ProductionStatus
	progress: number // 0-100
	currentBatchStartTime?: number
	isProducing: boolean
	lastInputRequestAtMs?: number
}

export enum BuildingCategory {
	Civil = 'civil',
	Storage = 'storage',
	Food = 'food',
	Industry = 'industry',
	Infrastructure = 'infrastructure'
}

export interface BuildingDefinition {
	id: BuildingId
	name: string
	description: string
	category: BuildingCategory
	icon?: string
	sprite?: {
		foundation: string
		completed: string
	}
	footprint: {
		width: number
		height: number
	}
	constructionTime: number // in seconds
	costs: BuildingCost[]
	unlockFlags?: string[] // Optional flags that must be set to unlock this building
	spawnsSettlers?: boolean // If true, this building spawns settlers (house)
	maxOccupants?: number // Maximum number of settlers that can spawn from this house
	requiredProfession?: ProfessionType // ProfessionType required to work in this building (e.g., 'builder', 'woodcutter')
	spawnRate?: number // Seconds between settler spawns (default: 60)
	workerSlots?: number // Maximum number of workers that can be assigned to this building (for production/work)
	priority?: number // Optional priority for logistics and job assignment (higher = more urgent)
	isWarehouse?: boolean // Marks building as storage hub for overflow
	harvest?: {
		nodeType: ResourceNodeType
		radiusTiles?: number
	} // Optional resource node harvesting config
	farm?: {
		cropNodeType: ResourceNodeType
		plotRadiusTiles: number
		plantTimeMs: number
		growTimeMs: number
		maxPlots?: number
		allowHarvest?: boolean
		minSpacingTiles?: number
		postPlantReturnWaitMs?: number
		spoilTimeMs?: number
		despawnTimeMs?: number
	}
	consumes?: Array<{
		itemType: ItemType
		desiredQuantity: number
	}>
	marketDistribution?: {
		itemTypes?: ItemType[]
		maxDistanceTiles?: number
		maxStops?: number
		roadSearchRadiusTiles?: number
		houseSearchRadiusTiles?: number
		carryQuantity?: number
		deliveryQuantity?: number
		patrolStrideTiles?: number
	}
	amenitySlots?: {
		count: number
		offsets?: Array<{ x: number, y: number }>
	}
	amenityNeeds?: {
		hunger?: number
		fatigue?: number
	}
	// Phase C: Production and storage
	productionRecipe?: ProductionRecipe
	autoProduction?: ProductionRecipe
	storage?: import('../Storage/types').StorageCapacity
}

export interface BuildingInstance {
	id: string
	buildingId: BuildingId
	playerId: string
	mapName: MapId
	position: Position
	workAreaCenter?: Position
	stage: ConstructionStage
	progress: number // 0-100 (construction progress, only advances during Constructing stage)
	startedAt: number // timestamp when construction started (when resources were collected)
	createdAt: number // timestamp when building was placed
	collectedResources: Map<ItemType, number> // itemType -> quantity collected (server-side only, client tracks via events)
	requiredResources: BuildingCost[] // Required resources (derived from definition.costs, server-side only)
	productionPaused?: boolean
}

export interface PlaceBuildingData {
	buildingId: BuildingId
	position: Position
}

export interface CancelBuildingData {
	buildingInstanceId: string
}

export interface SetProductionPausedData {
	buildingInstanceId: string
	paused: boolean
}

export interface SetWorkAreaData {
	buildingInstanceId: string
	center: Position
}

export interface BuildingPlacedData {
	building: BuildingInstance
}

export interface BuildingProgressData {
	buildingInstanceId: string
	progress: number
	stage: ConstructionStage
}

export interface BuildingCompletedData {
	building: BuildingInstance
}

export interface BuildingCancelledData {
	buildingInstanceId: string
	refundedItems: Array<{
		itemType: ItemType
		quantity: number
	}>
}

export interface BuildingWorkAreaUpdatedData {
	buildingInstanceId: string
	center: Position
}

export interface BuildingCatalogData {
	buildings: BuildingDefinition[]
}
