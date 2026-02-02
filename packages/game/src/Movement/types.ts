import { Position, MapId } from '../types'

export enum MoveTargetType {
	AmenitySlot = 'amenity_slot',
	Building = 'building',
	House = 'house',
	Item = 'item',
	Plot = 'plot',
	Resource = 'resource',
	Road = 'road',
	RoadTile = 'road_tile',
	Spot = 'spot',
	StorageSlot = 'storage_slot',
	Tool = 'tool'
}

export interface MovementEntity {
	id: string
	position: Position
	mapName: MapId
	speed: number // pixels per second
}

export interface MovementTask {
	entityId: string
	path: Position[]
	currentStep: number
	targetType?: MoveTargetType
	targetId?: string
	totalDistance?: number
	traveledDistance?: number
	segmentRemainingMs?: number
	pendingCompletion?: boolean
	onStepComplete?: (task: MovementTask, position: Position) => void
	onPathComplete?: (task: MovementTask) => void
	onCancelled?: (task: MovementTask) => void
	createdAt: number
	lastProcessed: number
}

export interface MovementCallbacks {
	onStepComplete?: (position: Position) => void
	onPathComplete?: (task: MovementTask) => void
	onCancelled?: () => void
}

export interface MoveToPositionOptions {
	callbacks?: MovementCallbacks
	targetType?: MoveTargetType
	targetId?: string
}
