import { Position, ItemType } from "./types"

export { ItemType }

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

export enum ChatMessageType {
	Local = 'local',
	System = 'system'
}

export interface ChatMessageData {
	message: string
	type: ChatMessageType
	sourcePlayerId?: string
}

export interface ChatSystemMessageData {
	message: string
	type: 'warning' | 'info' | 'success' | 'error'
}

export interface NPCMessageCondition {
	check: () => boolean
	message: string
}

export interface NPCMessages {
	default: string
	conditions?: NPCMessageCondition[]
}

export interface NPC {
	id: string
	name: string
	position: Position
	scene: string
	dialog: NPCDialog[]
	messages?: NPCMessages
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

export interface ItemMetadata {
	id: string
	name: string
	description: string
	type: ItemType
	rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'
	stackable: boolean
	maxStackSize?: number
	consumable: boolean
	effects?: {
		type: string
		value: number
		duration?: number
	}[]
	requirements?: {
		level?: number
		quest?: string
	}
	value: number
	icon?: string
}

export interface ItemMetaRequest {
	itemId: string
}

export interface ItemMetaResponse {
	metadata: ItemMetadata | null
}