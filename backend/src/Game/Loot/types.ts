import { Position } from '../../types'
import { Item } from '../Items/types'

export interface DroppedItem extends Item {
	position: Position
	droppedAt: number
}

export type Range = {
	min: number
	max: number
}

export type SpawnPosition = {
	x: number | Range
	y: number | Range
}

export type LootSpawnPayload = {
	itemType: string
	position: SpawnPosition
	scene: string
} 