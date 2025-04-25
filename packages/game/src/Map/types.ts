import { Position } from '../types'
import { Trigger } from '../Triggers/types'

export interface TiledMap {
	width: number
	height: number
	tilewidth: number
	tileheight: number
	layers: TiledLayer[]
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
	id: string
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
	mapId: string
}

export interface MapTransitionData {
	fromMapId: string
	toMapId: string
	position: Position
}

export interface PathData {
	width: number
	height: number
	data: number[]
} 