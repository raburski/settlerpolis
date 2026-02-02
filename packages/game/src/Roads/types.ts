import type { Position } from '../types'
import type { MapId, PlayerId, RoadJobId } from '../ids'

export type { RoadJobId } from '../ids'

export enum RoadType {
	None = 0,
	Dirt = 1,
	Stone = 2
}

export const ROAD_SPEED_MULTIPLIERS: Record<RoadType, number> = {
	[RoadType.None]: 1,
	[RoadType.Dirt]: 1.5,
	[RoadType.Stone]: 2
}

export const ROAD_PATH_PREFERENCE_MULTIPLIER = 2

export interface RoadTile {
	x: number
	y: number
	roadType: RoadType
}

export interface RoadData {
	width: number
	height: number
	data: RoadType[]
}

export interface RoadBuildRequestData {
	tiles: Array<{ x: number, y: number }>
	roadType: RoadType
}

export interface RoadTilesSyncData {
	mapId: MapId
	tiles: RoadTile[]
}

export interface RoadTilesUpdatedData {
	mapId: MapId
	tiles: RoadTile[]
}

export interface RoadPendingSyncData {
	mapId: MapId
	tiles: RoadTile[]
}

export interface RoadPendingUpdatedData {
	mapId: MapId
	tiles: RoadTile[]
}

export interface RoadJobData {
	jobId: RoadJobId
	mapId: MapId
	playerId: PlayerId
	position: Position
	tile: { x: number, y: number }
	roadType: RoadType
	durationMs: number
}
