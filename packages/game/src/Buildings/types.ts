import { Position } from '../types'
import { ItemType } from '../Items/types'

export type BuildingId = string

export enum ConstructionStage {
	Foundation = 'foundation',
	Constructing = 'constructing',
	Completed = 'completed',
	Cancelled = 'cancelled'
}

export interface BuildingCost {
	itemType: ItemType
	quantity: number
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
}

export interface BuildingInstance {
	id: string
	buildingId: BuildingId
	playerId: string
	mapName: string
	position: Position
	stage: ConstructionStage
	progress: number // 0-100
	startedAt: number // timestamp
	createdAt: number // timestamp
}

export interface PlaceBuildingData {
	buildingId: BuildingId
	position: Position
}

export interface CancelBuildingData {
	buildingInstanceId: string
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

export interface BuildingCatalogData {
	buildings: BuildingDefinition[]
}

