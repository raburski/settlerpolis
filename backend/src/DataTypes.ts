import { Position } from "./types"

export interface PlayerSourcedData {
    sourcePlayerId?: string
}

export interface Item {
	id: string
	name: string
}

export interface Inventory {
	items: Item[]
}

export interface InventoryData extends PlayerSourcedData {
	inventory: Inventory
}

export interface PlayerJoinData extends PlayerSourcedData {
    position: Position
    scene: string
}

export interface PlayerTransitionData extends PlayerSourcedData {
	position: Position
	scene: string
}

export interface PlayerMovedData extends PlayerSourcedData {
    x: number
    y: number
}

export interface ChatMessageData extends PlayerSourcedData {
    message: string
}