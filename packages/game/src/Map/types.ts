import { Position, MapId } from '../types'
import { Trigger } from '../Triggers/types'

export interface TiledMap {
	width: number
	height: number
	tilewidth: number
	tileheight: number
	layers: TiledLayer[]
	tilesets?: TiledTileset[]
}

export interface TiledTileset {
	firstgid: number
	columns: number
	tilewidth: number
	tileheight: number
	tilecount: number
	name?: string
	image?: string
	imagewidth?: number
	imageheight?: number
	margin?: number
	spacing?: number
}

export interface TiledLayer {
	id: number
	name: string
	type: 'tilelayer' | 'objectgroup'
	visible: boolean
	opacity: number
	x: number
	y: number
	data?: number[]
	objects?: TiledObject[]
	properties?: TiledProperty[]
}

export interface TiledObject {
	id: number
	name: string
	type: string
	visible: boolean
	x: number
	y: number
	width: number
	height: number
	properties?: TiledProperty[]
}

export interface TiledProperty {
	name: string
	type: string
	value: any
}

export interface CollisionData {
	width: number
	height: number
	data: number[]
}

export interface NPCSpot {
	position: Position
	properties: TiledProperty[]
}

export interface NPCSpots {
	[npcId: string]: {
		[spotName: string]: NPCSpot
	}
}

export interface MapTrigger {
	id: string
	position: Position
	width: number
	height: number
}

export interface MapData {
	id: MapId
	name: string
	tiledMap: TiledMap
	spawnPoints: Position[]
	collision: CollisionData
	npcSpots: NPCSpots
	paths: PathData
	triggers: MapTrigger[]
}

export interface MapLayer {
	name: string
	data: number[]
	visible: boolean
	opacity: number
}

export interface MapObjectLayer {
	name: string
	objects: TiledObject[]
	visible: boolean
	opacity: number
}

export interface MapLoadData {
	mapId: MapId
}

export interface MapLoadResponseData {
	mapId: MapId
	name: string
	tileLayers: MapLayer[]
	objectLayers: MapObjectLayer[]
	spawnPoints: Position[]
	collision: CollisionData
	npcSpots: NPCSpots
	paths: PathData
	triggers: MapTrigger[]
	mapUrl?: string
	position?: Position
	suppressAutoJoin?: boolean
}

export interface MapTransitionData {
	toMapId: MapId
	position: Position
}

export interface MapTransitionResponseData {
	toMapId: MapId
	position: Position
	tileLayers: MapLayer[]
	objectLayers: MapObjectLayer[]
	spawnPoints: Position[]
	collision: CollisionData
	npcSpots: NPCSpots
	paths: PathData
	triggers: MapTrigger[]
	mapUrl?: string
}

export interface PathData {
	width: number
	height: number
	data: number[]
}

export enum GroundType {
	Grass = 'grass',
	Dirt = 'dirt',
	Sand = 'sand',
	Rock = 'rock',
	Mountain = 'mountain',
	WaterShallow = 'water_shallow',
	WaterDeep = 'water_deep',
	Mud = 'mud'
}

/**
 * Interface for generating map URLs based on map names
 */
export interface MapUrlService {
	/**
	 * Generate a URL for a given map id
	 * @param mapId The id of the map
	 * @returns The complete URL to the map
	 */
	getMapUrl(mapId: MapId): string
} 
