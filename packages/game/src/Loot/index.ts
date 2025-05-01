import { EventManager, Event, EventClient } from '../events'
import { PlayerJoinData, PlayerTransitionData, Position } from '../types'
import { Receiver } from '../Receiver'
import { Item } from "../Items/types"
import { DroppedItem, Range, SpawnPosition, LootSpawnPayload, LootSpawnEventPayload, LootDespawnEventPayload } from "./types"
import { LootEvents } from './events'
import { v4 as uuidv4 } from 'uuid'

export class LootManager {
	private droppedItems = new Map<string, DroppedItem[]>()
	private itemIdToMapId = new Map<string, string>()
	private readonly DROPPED_ITEM_LIFESPAN = 5 * 60 * 1000 // 5 minutes in milliseconds
	private readonly ITEM_CLEANUP_INTERVAL = 30 * 1000 // Check every 30 seconds

	constructor(private event: EventManager) {
		this.setupEventHandlers()
		this.startItemCleanupInterval()
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

	private setupEventHandlers() {
		// Handle player join and map transition to send items
		this.event.on<PlayerJoinData>(Event.Players.CS.Join, (data, client) => {
			const mapId = data.mapId
			if (!mapId) {
				console.warn('[WARNING] Received Join event with undefined mapId. Ignoring event.')
				return
			}
			
			const mapDroppedItems = this.droppedItems.get(mapId) || []
			if (mapDroppedItems.length > 0) {
				// Send each item individually
				mapDroppedItems.forEach(item => {
					client.emit(Receiver.Sender, Event.Loot.SC.Spawn, { item } as LootSpawnEventPayload)
				})
			}
		})

		this.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, (data, client) => {
			const mapId = data.mapId
			if (!mapId) {
				console.warn('[WARNING] Received TransitionTo event with undefined mapId. Ignoring event.')
				return
			}
			
			const mapDroppedItems = this.droppedItems.get(mapId) || []
			if (mapDroppedItems.length > 0) {
				// Send each item individually
				mapDroppedItems.forEach(item => {
					client.emit(Receiver.Sender, Event.Loot.SC.Spawn, { item } as LootSpawnEventPayload)
				})
			}
		})

		// Handle scheduled item spawns
		this.event.on(LootEvents.SS.Spawn, (data: LootSpawnPayload) => {
			if (!data.mapId) {
				console.warn('[WARNING] Received SS.Spawn event with undefined mapId. Ignoring event.')
				return
			}
			
			const item: Item = {
				id: uuidv4(),
				itemType: data.itemType
			}
			
			const droppedItem: DroppedItem = {
				...item,
				position: this.resolvePosition(data.position),
				droppedAt: Date.now()
			}

			const mapDroppedItems = this.droppedItems.get(data.mapId) || []
			mapDroppedItems.push(droppedItem)
			this.droppedItems.set(data.mapId, mapDroppedItems)
			this.itemIdToMapId.set(item.id, data.mapId)

			// Broadcast to all players in the map that an item was spawned
			this.event.emit(Receiver.Group, Event.Loot.SC.Spawn, { item: droppedItem } as LootSpawnEventPayload, data.mapId)
		})
	}

	dropItem(item: Item, position: Position, client: EventClient) {
		const mapId = client.currentGroup
		
		// Handle undefined mapId
		if (!mapId || mapId === 'undefined') {
			console.warn('[WARNING] dropItem received undefined or invalid mapId. Ignoring drop request.')
			return
		}
		
		const mapDroppedItems = this.droppedItems.get(mapId) || []
		const droppedItem = {
			...item,
			position: position,
			droppedAt: Date.now()
		}
		mapDroppedItems.push(droppedItem)
		this.droppedItems.set(mapId, mapDroppedItems)
		this.itemIdToMapId.set(item.id, mapId)

		// Broadcast to all players in the map that an item was dropped
		client.emit(Receiver.Group, Event.Loot.SC.Spawn, { item: droppedItem } as LootSpawnEventPayload)
	}

	pickItem(itemId: string, client: EventClient): DroppedItem | undefined {
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

		const [removedItem] = mapItems.splice(itemIndex, 1)
		this.droppedItems.set(mapId, mapItems)
		this.itemIdToMapId.delete(itemId)

		// Broadcast to all players in the map that an item was picked up
		client.emit(Receiver.Group, Event.Loot.SC.Despawn, { itemId } as LootDespawnEventPayload)

		return removedItem
	}

	getMapItems(mapId: string): DroppedItem[] {
		return this.droppedItems.get(mapId) || []
	}

	private startItemCleanupInterval() {
		setInterval(() => {
			const now = Date.now()
			this.droppedItems.forEach((items, mapId) => {
				const expiredItemIds = items
					.filter(item => now - item.droppedAt > this.DROPPED_ITEM_LIFESPAN)
					.map(item => item.id)

				if (expiredItemIds.length > 0) {
					this.removeExpiredItems(mapId, expiredItemIds)
				}
			})
		}, this.ITEM_CLEANUP_INTERVAL)
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
			expiredItemIds.forEach(id => this.itemIdToMapId.delete(id))

			// Send individual despawn events for each expired item
			expiredItemIds.forEach(itemId => {
				this.event.emit(Receiver.Group, Event.Loot.SC.Despawn, { itemId } as LootDespawnEventPayload, mapId)
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
} 