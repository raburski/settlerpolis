import { Position, MapId } from '../types'
import { Item, ItemType } from '../Items/types'
import type { LootItemId } from '../ids'

export interface DroppedItem extends Item {
	position: Position
	droppedAt: number
	quantity: number
	metadata?: Record<string, any>
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
	itemType: ItemType
	position: SpawnPosition
	mapId: MapId
	quantity?: number
}

export type LootSpawnEventPayload = {
	item: DroppedItem
}

export type LootDespawnEventPayload = {
	itemId: LootItemId
}

export type LootUpdateEventPayload = {
	item: DroppedItem
}
