import { Position } from '../types'
import { ItemType } from '../Items/types'

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
		itemType: string
		quantity: number
	}>
	outputs: Array<{
		itemType: string
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

export interface BuildingDefinition {
	id: BuildingId
	name: string
	description: string
	category: string
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
	requiredProfession?: string // ProfessionType required to work in this building (e.g., 'builder', 'woodcutter')
	spawnRate?: number // Seconds between settler spawns (default: 60)
	workerSlots?: number // Maximum number of workers that can be assigned to this building (for production/work)
	priority?: number // Optional priority for logistics and job assignment (higher = more urgent)
	isWarehouse?: boolean // Marks building as storage hub for overflow
	harvest?: {
		nodeType: string
		radiusTiles?: number
	} // Optional resource node harvesting config
	farm?: {
		cropNodeType: string
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
		itemType: string
		desiredQuantity: number
	}>
	// Phase C: Production and storage
	productionRecipe?: ProductionRecipe
	autoProduction?: ProductionRecipe
	storage?: import('../Storage/types').StorageCapacity
}

export interface BuildingInstance {
	id: string
	buildingId: BuildingId
	playerId: string
	mapName: string
	position: Position
	workAreaCenter?: Position
	stage: ConstructionStage
	progress: number // 0-100 (construction progress, only advances during Constructing stage)
	startedAt: number // timestamp when construction started (when resources were collected)
	createdAt: number // timestamp when building was placed
	collectedResources: Map<string, number> // itemType -> quantity collected (server-side only, client tracks via events)
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
