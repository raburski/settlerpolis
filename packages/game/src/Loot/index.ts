import { EventManager, Event, EventClient } from '../events'
import { PlayerJoinData, PlayerTransitionData, Position } from '../types'
import { Receiver } from '../Receiver'
import { Item } from "../Items/types"
import { DroppedItem, Range, SpawnPosition, LootSpawnPayload, LootSpawnEventPayload, LootDespawnEventPayload } from "./types"
import { LootEvents } from './events'
import { v4 as uuidv4 } from 'uuid'

export class LootManager {
	private droppedItems = new Map<string, DroppedItem[]>()
	private itemIdToScene = new Map<string, string>()
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
		// Handle player join and scene transition to send items
		this.event.on<PlayerJoinData>(Event.Players.CS.Join, (data, client) => {
			const sceneDroppedItems = this.droppedItems.get(data.scene) || []
			if (sceneDroppedItems.length > 0) {
				// Send each item individually
				sceneDroppedItems.forEach(item => {
					client.emit(Receiver.Sender, Event.Loot.SC.Spawn, { item } as LootSpawnEventPayload)
				})
			}
		})

		this.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, (data, client) => {
			const sceneDroppedItems = this.droppedItems.get(data.scene) || []
			if (sceneDroppedItems.length > 0) {
				// Send each item individually
				sceneDroppedItems.forEach(item => {
					client.emit(Receiver.Sender, Event.Loot.SC.Spawn, { item } as LootSpawnEventPayload)
				})
			}
		})

		// Handle scheduled item spawns
		this.event.on(LootEvents.SS.Spawn, (data: LootSpawnPayload) => {
			const item: Item = {
				id: uuidv4(),
				itemType: data.itemType
			}
			
			const droppedItem: DroppedItem = {
				...item,
				position: this.resolvePosition(data.position),
				droppedAt: Date.now()
			}

			const sceneDroppedItems = this.droppedItems.get(data.scene) || []
			sceneDroppedItems.push(droppedItem)
			this.droppedItems.set(data.scene, sceneDroppedItems)
			this.itemIdToScene.set(item.id, data.scene)

			// Broadcast to all players in the scene that an item was spawned
			this.event.emit(Receiver.Group, Event.Loot.SC.Spawn, { item: droppedItem } as LootSpawnEventPayload, data.scene)
		})
	}

	dropItem(item: Item, position: Position, client: EventClient) {
		const scene = client.currentGroup
		const sceneDroppedItems = this.droppedItems.get(scene) || []
		const droppedItem = {
			...item,
			position: position,
			droppedAt: Date.now()
		}
		sceneDroppedItems.push(droppedItem)
		this.droppedItems.set(scene, sceneDroppedItems)
		this.itemIdToScene.set(item.id, scene)

		// Broadcast to all players in the scene that an item was dropped
		client.emit(Receiver.Group, Event.Loot.SC.Spawn, { item: droppedItem } as LootSpawnEventPayload)
	}

	pickItem(itemId: string, client: EventClient): DroppedItem | undefined {
		const scene = client.currentGroup
		const sceneItems = this.getSceneItems(scene)
		const itemIndex = sceneItems.findIndex(item => item.id === itemId)
		
		if (itemIndex === -1) return undefined

		const [removedItem] = sceneItems.splice(itemIndex, 1)
		this.droppedItems.set(scene, sceneItems)
		this.itemIdToScene.delete(itemId)

		// Broadcast to all players in the scene that an item was picked up
		client.emit(Receiver.Group, Event.Loot.SC.Despawn, { itemId } as LootDespawnEventPayload)

		return removedItem
	}

	getSceneItems(scene: string): DroppedItem[] {
		return this.droppedItems.get(scene) || []
	}

	private startItemCleanupInterval() {
		setInterval(() => {
			const now = Date.now()
			this.droppedItems.forEach((items, scene) => {
				const expiredItemIds = items
					.filter(item => now - item.droppedAt > this.DROPPED_ITEM_LIFESPAN)
					.map(item => item.id)

				if (expiredItemIds.length > 0) {
					this.removeExpiredItems(scene, expiredItemIds)
				}
			})
		}, this.ITEM_CLEANUP_INTERVAL)
	}

	private removeExpiredItems(scene: string, expiredItemIds: string[]) {
		if (expiredItemIds.length === 0) return

		const sceneItems = this.droppedItems.get(scene)
		if (sceneItems) {
			// Remove expired items
			this.droppedItems.set(
				scene,
				sceneItems.filter(item => !expiredItemIds.includes(item.id))
			)

			// Clean up the itemIdToScene map
			expiredItemIds.forEach(id => this.itemIdToScene.delete(id))

			// Send individual despawn events for each expired item
			expiredItemIds.forEach(itemId => {
				this.event.emit(Receiver.Group, Event.Loot.SC.Despawn, { itemId } as LootDespawnEventPayload, scene)
			})
		}
	}

	getItem(id: string): DroppedItem | undefined {
		const scene = this.itemIdToScene.get(id)
		if (!scene) return undefined

		const sceneItems = this.droppedItems.get(scene)
		return sceneItems?.find(item => item.id === id)
	}
} 