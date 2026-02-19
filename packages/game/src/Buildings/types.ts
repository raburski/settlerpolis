import { Position } from '../types'
import { ItemType } from '../Items/types'
import type { ProfessionType } from '../Population/types'
import type { ResourceNodeType } from '../ResourceNodes/types'
import type { GroundType } from '../Map/types'
import type { WorldMapLinkType } from '../WorldMap/types'
import type { BuildingId, BuildingInstanceId, MapId, PlayerId, ResourceNodeId } from '../ids'

export type { BuildingId, BuildingInstanceId } from '../ids'

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
	id?: string
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

export type ProductionPlan = Record<string, number>

export enum ProductionStatus {
	Idle = 'idle',
	NoInput = 'no_input',
	InProduction = 'in_production',
	NoWorker = 'no_worker', // Building requires worker but none assigned
	Paused = 'paused'
}

export interface BuildingProduction {
	buildingInstanceId: BuildingInstanceId
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
	Metalwork = 'metalwork',
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
	storageSlots?: import('../Storage/types').StorageSlotDefinition[]
	storagePreservation?: import('../Storage/types').StoragePreservation
	footprint: {
		width: number
		height: number
	}
	entryPoint?: {
		x: number
		y: number
	}
	centerPoint?: {
		x: number
		y: number
	}
	accessTiles?: Array<{
		x: number
		y: number
	}>
	blockedTiles?: Array<{
		x: number
		y: number
	}>
	allowedGroundTypes?: GroundType[]
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
	isTradingPost?: boolean // Marks building as a trading post
	tradeRouteType?: WorldMapLinkType // Marks building as a trade route hub (land or sea)
	blocksOutgoing?: boolean // If true, items cannot be transported out by logistics
	marketRoadBlockade?: boolean // If true, market vendor patrol routes stop expanding past this building tile
	requiresConstructedRoad?: boolean // If true, placement is only valid on already-built road tiles
	harvest?: {
		nodeType: ResourceNodeType
		radiusTiles?: number
		harvestTimeMs?: number
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
		harvestTimeMs?: number
	}
	fishing?: {
		nodeType: ResourceNodeType
		radiusTiles: number
		fishingTimeMs: number
		minCatch: number
		maxCatch: number
		nodesPerEfficiency?: number
		maxEfficiency?: number
	}
	hunting?: {
		wildlifeType: string
		radiusTiles: number
		huntTimeMs: number
		outputItemType: ItemType
		quantity?: number
	}
	consumes?: Array<{
		itemType: ItemType
		desiredQuantity: number
	}>
	marketDistribution?: {
		itemTypes?: ItemType[]
		deliveryTarget?: 'houses' | 'buildings'
		maxDistanceTiles?: number
		maxStops?: number
		roadSearchRadiusTiles?: number
		houseSearchRadiusTiles?: number
		carryQuantity?: number
		deliveryQuantity?: number
		patrolStrideTiles?: number
		patrolPauseMs?: number
		patrolSpeedMultiplier?: number
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
	productionRecipes?: ProductionRecipe[]
	productionPlanDefaults?: ProductionPlan
	autoProduction?: ProductionRecipe
}

export interface BuildingInstance {
	id: BuildingInstanceId
	buildingId: BuildingId
	playerId: PlayerId
	mapId: MapId
	position: Position
	rotation?: number
	workAreaCenter?: Position
	stage: ConstructionStage
	progress: number // 0-100 (construction progress, only advances during Constructing stage)
	startedAt: number // timestamp when construction started (when resources were collected)
	createdAt: number // timestamp when building was placed
	collectedResources: Map<ItemType, number> // itemType -> quantity collected (server-side only, client tracks via events)
	requiredResources: BuildingCost[] // Required resources (derived from definition.costs, server-side only)
	productionPaused?: boolean
	productionPlan?: ProductionPlan
	useGlobalProductionPlan?: boolean
	storageRequests?: ItemType[] // Item types to request for storage delivery (warehouses)
	pendingWorkers?: number // Queued worker requests awaiting assignment
	resourceNodeId?: ResourceNodeId
}

export interface PlaceBuildingData {
	buildingId: BuildingId
	position: Position
	rotation?: number
	resourceNodeId?: ResourceNodeId
}

export interface CancelBuildingData {
	buildingInstanceId: BuildingInstanceId
}

export interface SetProductionPausedData {
	buildingInstanceId: BuildingInstanceId
	paused: boolean
}

export interface SetProductionPlanData {
	buildingInstanceId: BuildingInstanceId
	plan?: ProductionPlan
	useGlobal?: boolean
}

export interface SetGlobalProductionPlanData {
	buildingId: BuildingId
	plan: ProductionPlan
}

export interface SetStorageRequestsData {
	buildingInstanceId: BuildingInstanceId
	itemTypes: ItemType[]
}

export interface SetWorkAreaData {
	buildingInstanceId: BuildingInstanceId
	center: Position
}

export interface BuildingPlacedData {
	building: BuildingInstance
}

export interface BuildingProgressData {
	buildingInstanceId: BuildingInstanceId
	progress: number
	stage: ConstructionStage
}

export interface BuildingCompletedData {
	building: BuildingInstance
}

export interface BuildingCancelledData {
	buildingInstanceId: BuildingInstanceId
	refundedItems: Array<{
		itemType: ItemType
		quantity: number
	}>
}

export interface BuildingWorkAreaUpdatedData {
	buildingInstanceId: BuildingInstanceId
	center: Position
}

export interface BuildingStorageRequestsUpdatedData {
	buildingInstanceId: BuildingInstanceId
	itemTypes: ItemType[]
}

export interface BuildingWorkerQueueUpdatedData {
	buildingInstanceId: BuildingInstanceId
	queuedCount: number
}

export interface BuildingCatalogData {
	buildings: BuildingDefinition[]
	globalProductionPlans?: Record<BuildingId, ProductionPlan>
}

export interface ProductionPlanUpdatedData {
	buildingInstanceId: BuildingInstanceId
	plan?: ProductionPlan
	useGlobal: boolean
}

export interface GlobalProductionPlanUpdatedData {
	buildingId: BuildingId
	plan: ProductionPlan
}
