import { Position } from '../types'
import { Item } from '../Items/types'

export interface MapObject {
	id: string
	item: Item
	position: Position
	rotation: number
	playerId: string
	mapName: string
	metadata?: Record<string, any>
}

export interface PlaceObjectData {
	position: Position
	rotation?: number
	metadata?: Record<string, any>
	item: Item
}

export interface RemoveObjectData {
	objectId: string
}

export interface SpawnObjectData {
	object: MapObject
}

export interface DespawnObjectData {
	objectId: string
} 