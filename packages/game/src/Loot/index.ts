import { EventManager, Event, EventClient } from '../events'
import { PlayerJoinData, PlayerTransitionData, Position } from '../types'
import { Receiver } from '../Receiver'
import { Item } from "../Items/types"
import type { ItemsManager } from '../Items'
import { DroppedItem, Range, SpawnPosition, LootSpawnPayload, LootSpawnEventPayload, LootDespawnEventPayload, LootUpdateEventPayload } from "./types"
import { LootEvents } from './events'
import { v4 as uuidv4 } from 'uuid'
import { Logger } from '../Logs'
import { BaseManager } from '../Managers'
import { SimulationEvents } from '../Simulation/events'
import type { SimulationTickData } from '../Simulation/types'
import type { LootSnapshot } from '../state/types'

export interface LootDeps {
	event: EventManager
	items: ItemsManager
}

export class LootManager extends BaseManager<LootDeps> {
	private droppedItems = new Map<string, DroppedItem[]>()
	private itemIdToMapId = new Map<string, string>()
	private itemReservations = new Map<string, string>()
	private readonly DROPPED_ITEM_LIFESPAN = Number.POSITIVE_INFINITY
	private readonly ITEM_CLEANUP_INTERVAL = 30 * 1000 // Check every 30 seconds
	private simulationTimeMs = 0
	private cleanupAccumulatorMs = 0

	constructor(
		managers: LootDeps,
		private logger: Logger
	) {
		super(managers)
		this.setupEventHandlers()
	}

	private getRandomInRange(range: Range | number): number {
		if (typeof range === 'number') {
			return range
		}
		return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min
	}

	private resolvePosition(spawnPosition: SpawnPosition): Position {
		return {
			x: this.getRandomInRange(spawnPosition.x),
			y: this.getRandomInRange(spawnPosition.y)
		}
	}

	private getMaxStackSize(itemType: string): number {
		const metadata = this.managers.items.getItemMetadata(itemType)
		if (!metadata || !metadata.stackable) {
			return 1
		}
		return Math.max(1, metadata.maxStackSize || 1)
	}

	private canStack(itemType: string): boolean {
		const metadata = this.managers.items.getItemMetadata(itemType)
		return !!metadata?.stackable
	}

	private setupEventHandlers() {
		this.managers.event.on(SimulationEvents.SS.Tick, this.handleSimulationSSTick)
		this.managers.event.on<PlayerJoinData>(Event.Players.CS.Join, this.handlePlayersCSJoin)
		this.managers.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, this.handlePlayersCSTransitionTo)
		this.managers.event.on(LootEvents.SS.Spawn, this.handleLootSSSpawn)
	}

	/* EVENT HANDLERS */
	private readonly handleSimulationSSTick = (data: SimulationTickData): void => {
		this.handleSimulationTick(data)
	}

	private readonly handlePlayersCSJoin = (data: PlayerJoinData, client: EventClient): void => {
		this.sendMapDroppedItemsToClient(data.mapId, client, 'Join')
	}

	private readonly handlePlayersCSTransitionTo = (data: PlayerTransitionData, client: EventClient): void => {
		this.sendMapDroppedItemsToClient(data.mapId, client, 'TransitionTo')
	}

	private readonly handleLootSSSpawn = (data: LootSpawnPayload): void => {
		if (!data.mapId) {
			this.logger.warn('Received SS.Spawn event with undefined mapId. Ignoring event.')
			return
		}

		const quantity = data.quantity ?? 1
		const position = this.resolvePosition(data.position)
		this.addOrMergeDroppedItem(data.mapId, data.itemType, position, quantity, (payload) => {
			this.managers.event.emit(Receiver.Group, Event.Loot.SC.Spawn, payload, data.mapId)
		}, (payload) => {
			this.managers.event.emit(Receiver.Group, Event.Loot.SC.Update, payload, data.mapId)
		})
	}

	/* METHODS */
	private sendMapDroppedItemsToClient(mapId: string | undefined, client: EventClient, sourceEvent: 'Join' | 'TransitionTo'): void {
		if (!mapId) {
			this.logger.warn(`Received ${sourceEvent} event with undefined mapId. Ignoring event.`)
			return
		}

		const mapDroppedItems = this.droppedItems.get(mapId) || []
		if (mapDroppedItems.length > 0) {
			mapDroppedItems.forEach(item => {
				client.emit(Receiver.Sender, Event.Loot.SC.Spawn, { item } as LootSpawnEventPayload)
			})
		}
	}

	private handleSimulationTick(data: SimulationTickData): void {
		this.simulationTimeMs = data.nowMs
		this.cleanupAccumulatorMs += data.deltaMs
		if (this.cleanupAccumulatorMs < this.ITEM_CLEANUP_INTERVAL) {
			return
		}
		this.cleanupAccumulatorMs -= this.ITEM_CLEANUP_INTERVAL
		this.cleanupExpiredItems()
	}

	public reserveItem(itemId: string, ownerId: string): boolean {
		const item = this.getItem(itemId)
		if (!item) {
			return false
		}

		const existingOwner = this.itemReservations.get(itemId)
		if (existingOwner && existingOwner !== ownerId) {
			return false
		}

		this.itemReservations.set(itemId, ownerId)
		return true
	}

	public releaseReservation(itemId: string, ownerId?: string): void {
		if (!this.itemReservations.has(itemId)) {
			return
		}

		if (ownerId && this.itemReservations.get(itemId) !== ownerId) {
			return
		}

		this.itemReservations.delete(itemId)
	}

	public isReservationValid(itemId: string, ownerId: string): boolean {
		if (!this.getItem(itemId)) {
			return false
		}

		return this.itemReservations.get(itemId) === ownerId
	}

	public isItemAvailable(itemId: string): boolean {
		if (!this.getItem(itemId)) {
			return false
		}

		return !this.itemReservations.has(itemId)
	}

	public getAvailableItemByType(mapId: string, itemType: string): DroppedItem | undefined {
		const mapItems = this.droppedItems.get(mapId)
		if (!mapItems || mapItems.length === 0) {
			return undefined
		}

		return mapItems.find(item => item.itemType === itemType && this.isItemAvailable(item.id))
	}

	dropItem(item: Item, position: Position, client: EventClient, quantity: number = 1, metadata?: Record<string, any>) {
		const mapId = client.currentGroup
		
		// Handle undefined mapId
		if (!mapId || mapId === 'undefined') {
			this.logger.warn('dropItem received undefined or invalid mapId. Ignoring drop request.')
			return
		}
		
		this.addOrMergeDroppedItem(mapId, item.itemType, position, quantity, (payload) => {
			client.emit(Receiver.Group, Event.Loot.SC.Spawn, payload)
		}, (payload) => {
			client.emit(Receiver.Group, Event.Loot.SC.Update, payload)
		}, item.id, metadata)
	}

	pickItem(itemId: string, client: EventClient): Item | undefined {
		// Get the correct mapId from our mapping, not from client's current group
		const mapId = this.itemIdToMapId.get(itemId)
		
		if (!mapId) {
			return undefined
		}
		
		const mapItems = this.getMapItems(mapId)
		const itemIndex = mapItems.findIndex(item => item.id === itemId)
		
		if (itemIndex === -1) {
			return undefined
		}

		this.releaseReservation(itemId)

		const targetItem = mapItems[itemIndex]
		if (targetItem.quantity > 1) {
			targetItem.quantity -= 1
			this.droppedItems.set(mapId, mapItems)

			// Broadcast quantity update
			client.emit(Receiver.Group, Event.Loot.SC.Update, { item: targetItem } as LootUpdateEventPayload)
		} else {
			mapItems.splice(itemIndex, 1)
			this.droppedItems.set(mapId, mapItems)
			this.itemIdToMapId.delete(itemId)

			// Broadcast to all players in the map that an item was picked up
			client.emit(Receiver.Group, Event.Loot.SC.Despawn, { itemId } as LootDespawnEventPayload)
		}

		return {
			id: uuidv4(),
			itemType: targetItem.itemType
		}
	}

	getMapItems(mapId: string): DroppedItem[] {
		return this.droppedItems.get(mapId) || []
	}

	private addOrMergeDroppedItem(
		mapId: string,
		itemType: string,
		position: Position,
		quantity: number,
		emitSpawn: (payload: LootSpawnEventPayload) => void,
		emitUpdate: (payload: LootUpdateEventPayload) => void,
		preferredItemId?: string,
		metadata?: Record<string, any>
	): void {
		if (quantity <= 0) return

		const mapDroppedItems = this.droppedItems.get(mapId) || []
		const maxStackSize = this.getMaxStackSize(itemType)
		const stackable = this.canStack(itemType)

		let remaining = quantity

		if (stackable && !metadata) {
			const existingPile = mapDroppedItems.find(item =>
				item.itemType === itemType &&
				item.position.x === position.x &&
				item.position.y === position.y &&
				item.quantity < maxStackSize &&
				!item.metadata
			)

			if (existingPile) {
				const addAmount = Math.min(maxStackSize - existingPile.quantity, remaining)
				existingPile.quantity += addAmount
				remaining -= addAmount
				emitUpdate({ item: existingPile })
			}
		}

		while (remaining > 0) {
			if (!stackable) {
				const item: DroppedItem = {
					id: preferredItemId || uuidv4(),
					itemType,
					position,
					droppedAt: this.simulationTimeMs,
					quantity: 1,
					metadata: metadata ? { ...metadata } : undefined
				}
				mapDroppedItems.push(item)
				this.itemIdToMapId.set(item.id, mapId)
				emitSpawn({ item })
				remaining -= 1
				preferredItemId = undefined
				continue
			}

			const stackQuantity = Math.min(maxStackSize, remaining)
			const item: DroppedItem = {
				id: preferredItemId || uuidv4(),
				itemType,
				position,
				droppedAt: this.simulationTimeMs,
				quantity: stackQuantity,
				metadata: metadata ? { ...metadata } : undefined
			}
			mapDroppedItems.push(item)
			this.itemIdToMapId.set(item.id, mapId)
			emitSpawn({ item })
			remaining -= stackQuantity
			preferredItemId = undefined
		}

		this.droppedItems.set(mapId, mapDroppedItems)
	}

	private cleanupExpiredItems() {
		if (!Number.isFinite(this.DROPPED_ITEM_LIFESPAN)) {
			return
		}
		const now = this.simulationTimeMs
		this.droppedItems.forEach((items, mapId) => {
			const expiredItemIds = items
				.filter(item => now - item.droppedAt > this.DROPPED_ITEM_LIFESPAN)
				.map(item => item.id)

			if (expiredItemIds.length > 0) {
				this.removeExpiredItems(mapId, expiredItemIds)
			}
		})
	}

	private removeExpiredItems(mapId: string, expiredItemIds: string[]) {
		if (expiredItemIds.length === 0) return

		const mapItems = this.droppedItems.get(mapId)
		if (mapItems) {
			// Remove expired items
			this.droppedItems.set(
				mapId,
				mapItems.filter(item => !expiredItemIds.includes(item.id))
			)

			// Clean up the itemIdToMapId map
			expiredItemIds.forEach(id => {
				this.itemIdToMapId.delete(id)
				this.itemReservations.delete(id)
			})

			// Send individual despawn events for each expired item
			expiredItemIds.forEach(itemId => {
				this.managers.event.emit(Receiver.Group, Event.Loot.SC.Despawn, { itemId } as LootDespawnEventPayload, mapId)
			})
		}
	}

	getItem(id: string): DroppedItem | undefined {
		let mapId = this.itemIdToMapId.get(id)
		
		// Fix for "undefined" mapId
		if (mapId === 'undefined') {
			this.itemIdToMapId.delete(id)
			mapId = undefined
		}
		
		// If we don't have the map ID, try to find the item in all maps
		if (!mapId) {
			for (const [currentMapId, items] of this.droppedItems.entries()) {
				const item = items.find(item => item.id === id)
				if (item) {
					this.itemIdToMapId.set(id, currentMapId)
					mapId = currentMapId
					break
				}
			}
			
			if (!mapId) {
				return undefined
			}
		}

		const mapItems = this.droppedItems.get(mapId)
		const foundItem = mapItems?.find(item => item.id === id)
		return foundItem
	}

	serialize(): LootSnapshot {
		return {
			droppedItems: Array.from(this.droppedItems.entries()).map(([mapId, items]) => ([
				mapId,
				items.map(item => ({
					...item,
					position: { ...item.position }
				}))
			])),
			itemReservations: Array.from(this.itemReservations.entries()),
			cleanupAccumulatorMs: this.cleanupAccumulatorMs
		}
	}

	deserialize(state: LootSnapshot): void {
		this.droppedItems.clear()
		this.itemIdToMapId.clear()
		this.itemReservations.clear()
		this.cleanupAccumulatorMs = state.cleanupAccumulatorMs
		for (const [mapId, items] of state.droppedItems) {
			const nextItems = items.map(item => ({
				...item,
				position: { ...item.position }
			}))
			this.droppedItems.set(mapId, nextItems)
			for (const item of nextItems) {
				this.itemIdToMapId.set(item.id, mapId)
			}
		}
		for (const [itemId, ownerId] of state.itemReservations) {
			this.itemReservations.set(itemId, ownerId)
		}
	}

	reset(): void {
		this.droppedItems.clear()
		this.itemIdToMapId.clear()
		this.itemReservations.clear()
		this.cleanupAccumulatorMs = 0
	}
}
