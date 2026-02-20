import type { ItemType } from '../Items/types'
import type { ProfessionType } from '../Population/types'
import type { Position } from '../types'
import type { ReservationHandlerContext } from './handlerContext'
import type {
	BuildingInstanceId,
	LootItemId,
	NPCId,
	ResourceNodeId,
	ReservationId,
	SettlerId,
	StorageReservationId
} from '../ids'

export enum ReservationKind {
	Storage = 'storage',
	Loot = 'loot',
	Tool = 'tool',
	Node = 'node',
	Amenity = 'amenity',
	House = 'house',
	Npc = 'npc'
}

export interface AmenitySlotReservationResult {
	reservationId: string
	slotIndex: number
	position: Position
}

export type ReservationRef =
	| { kind: ReservationKind.Storage, reservationId: StorageReservationId }
	| { kind: ReservationKind.Loot, itemId: LootItemId, ownerId?: string }
	| { kind: ReservationKind.Tool, itemId: LootItemId }
	| { kind: ReservationKind.Node, nodeId: ResourceNodeId, ownerId?: string }
	| { kind: ReservationKind.Amenity, reservationId: ReservationId }
	| { kind: ReservationKind.House, reservationId: ReservationId }
	| { kind: ReservationKind.Npc, npcId: NPCId, ownerId: SettlerId | string }

export type ReservationRequest =
	| {
		kind: ReservationKind.Storage
		direction: 'incoming' | 'outgoing'
		buildingInstanceId: BuildingInstanceId
		itemType: ItemType
		quantity: number
		ownerId: string
		allowInternal?: boolean
	}
	| {
		kind: ReservationKind.Tool
		mapId: string
		profession: ProfessionType
		ownerId: SettlerId
	}
	| {
		kind: ReservationKind.Loot
		itemId: LootItemId
		ownerId: string
	}
	| {
		kind: ReservationKind.Node
		nodeId: ResourceNodeId
		ownerId: string
	}
	| {
		kind: ReservationKind.Amenity
		buildingInstanceId: BuildingInstanceId
		settlerId: SettlerId
	}
	| {
		kind: ReservationKind.House
		houseId: BuildingInstanceId
		settlerId: SettlerId
	}
	| {
		kind: ReservationKind.Npc
		npcId: NPCId
		ownerId: SettlerId
	}

export type ReservationAcquireResult =
	| {
		kind: ReservationKind.Storage
		ref: Extract<ReservationRef, { kind: ReservationKind.Storage }>
		reservationId: StorageReservationId
		slotId: string
		position: Position
		quantity: number
	}
	| {
		kind: ReservationKind.Tool
		ref: Extract<ReservationRef, { kind: ReservationKind.Tool }>
		itemId: LootItemId
		position: Position
	}
	| {
		kind: ReservationKind.Loot
		ref: Extract<ReservationRef, { kind: ReservationKind.Loot }>
	}
	| {
		kind: ReservationKind.Node
		ref: Extract<ReservationRef, { kind: ReservationKind.Node }>
	}
	| {
		kind: ReservationKind.Amenity
		ref: Extract<ReservationRef, { kind: ReservationKind.Amenity }>
		reservationId: ReservationId
		slotIndex: number
		position: Position
	}
	| {
		kind: ReservationKind.House
		ref: Extract<ReservationRef, { kind: ReservationKind.House }>
		reservationId: ReservationId
	}
	| {
		kind: ReservationKind.Npc
		ref: Extract<ReservationRef, { kind: ReservationKind.Npc }>
	}

export type ReservationCommitRequest = {
	kind: ReservationKind.House
	reservationId: ReservationId
	expectedHouseId?: BuildingInstanceId
}

export type ReservationReserveHandler = (
	request: ReservationRequest,
	context: ReservationHandlerContext
) => ReservationAcquireResult | null

export type ReservationReleaseHandler = (
	reservation: ReservationRef,
	context: ReservationHandlerContext
) => void

export type ReservationCommitHandler = (
	request: ReservationCommitRequest,
	context: ReservationHandlerContext
) => boolean
