import { Position, ItemType } from "./types"

export interface PlayerSourcedData {
    sourcePlayerId?: string
}

export interface Item {
	id: string
	name: string
	type: ItemType
}

export interface DroppedItem extends Item {
	position: Position
	scene: string
	droppedAt: number
}

export interface Inventory {
	items: Item[]
}

export interface InventoryData extends PlayerSourcedData {
	inventory: Inventory
}

export interface DropItemData extends PlayerSourcedData {
	itemId: string
}

export interface PickUpItemData extends PlayerSourcedData {
	itemId: string
}

export interface ConsumeItemData extends PlayerSourcedData {
	itemId: string
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

export interface NPC {
	id: string
	name: string
	position: Position
	scene: string
	dialog: NPCDialog[]
}

export interface NPCDialog {
	id: string
	text: string
	responses?: NPCResponse[]
}

export interface NPCResponse {
	id: string
	text: string
	nextDialogId?: string
	action?: string
}

export interface NPCInteractData extends PlayerSourcedData {
	npcId: string
}

export interface NPCDialogData extends PlayerSourcedData {
	npcId: string
	dialogId: string
	responseId?: string
}