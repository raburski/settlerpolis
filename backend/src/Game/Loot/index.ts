import { EventManager, Event, EventClient } from '../../events'
import { PlayerJoinData, PlayerTransitionData, Position } from '../../types'
import { Receiver } from '../../Receiver'
import { Item } from "../Items/types"
import { DroppedItem } from "./types"

export class LootManager {
	private droppedItems = new Map<string, DroppedItem[]>()
	private itemIdToScene = new Map<string, string>()
	private readonly DROPPED_ITEM_LIFESPAN = 5 * 60 * 1000 // 5 minutes in milliseconds
	private readonly ITEM_CLEANUP_INTERVAL = 30 * 1000 // Check every 30 seconds

	constructor(private event: EventManager) {
		this.setupEventHandlers()
		this.startItemCleanupInterval()
	}

	private setupEventHandlers() {
		// Handle player join and scene transition to send items
		this.event.on<PlayerJoinData>(Event.Players.CS.Join, (data, client) => {
			const sceneDroppedItems = this.droppedItems.get(data.scene) || []
			if (sceneDroppedItems.length > 0) {
				client.emit(Receiver.Sender, Event.Loot.SC.Spawn, { items: sceneDroppedItems })
			}
		})

		this.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, (data, client) => {
			const sceneDroppedItems = this.droppedItems.get(data.scene) || []
			if (sceneDroppedItems.length > 0) {
				client.emit(Receiver.Sender, Event.Loot.SC.Spawn, { items: sceneDroppedItems })
			}
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
		client.emit(Receiver.Group, Event.Loot.SC.Spawn, { items: [droppedItem] })
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
		client.emit(Receiver.Group, Event.Loot.SC.Despawn, { itemIds: [itemId] })

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

			this.event.emit(Receiver.Group, Event.Loot.SC.Despawn, { itemIds: expiredItemIds }, scene)
		}
	}

	getItem(id: string): DroppedItem | undefined {
		const scene = this.itemIdToScene.get(id)
		if (!scene) return undefined

		const sceneItems = this.droppedItems.get(scene)
		return sceneItems?.find(item => item.id === id)
	}
} 