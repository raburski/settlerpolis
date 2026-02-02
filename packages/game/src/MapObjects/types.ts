import { Position } from '../types'
import { Item } from '../Items/types'
import type { MapId, MapObjectId, PlayerId } from '../ids'

export type { MapObjectId } from '../ids'

export interface MapObject {
	id: MapObjectId
	item: Item
	position: Position
	rotation: number
	playerId: PlayerId
	mapId: MapId
	metadata?: Record<string, any>
}

export interface PlaceObjectData {
	position: Position
	rotation?: number
	metadata?: Record<string, any>
	item: Item
}

export interface RemoveObjectData {
	objectId: MapObjectId
}

export interface SpawnObjectData {
	object: MapObject
}

export interface DespawnObjectData {
	objectId: MapObjectId
} 
