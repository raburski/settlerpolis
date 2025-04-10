import { EventManager, Event, EventClient } from '../Event'
import { DroppedItem, PlayerJoinData, PlayerTransitionData } from '../DataTypes'
import { Receiver } from '../Receiver'

export class LootManager {
	private droppedItems = new Map<string, DroppedItem[]>()
	private readonly DROPPED_ITEM_LIFESPAN = 5 * 60 * 1000 // 5 minutes in milliseconds
	private readonly ITEM_CLEANUP_INTERVAL = 30 * 1000 // Check every 30 seconds

	constructor(private event: EventManager) {
		this.setupEventHandlers()
		this.startItemCleanupInterval()
	}

	private setupEventHandlers() {
		// Handle player join and scene transition to send items
		this.event.on<PlayerJoinData>(Event.Player.Join, (data, client) => {
			const sceneDroppedItems = this.droppedItems.get(client.currentGroup) || []
			if (sceneDroppedItems.length > 0) {
				client.emit(Receiver.Sender, Event.Scene.AddItems, { items: sceneDroppedItems })
			}
		})

		this.event.on<PlayerTransitionData>(Event.Player.TransitionTo, (data, client) => {
			const sceneDroppedItems = this.droppedItems.get(client.currentGroup) || []
			if (sceneDroppedItems.length > 0) {
				client.emit(Receiver.Sender, Event.Scene.AddItems, { items: sceneDroppedItems })
			}
		})
	}

	dropItem(item: DroppedItem, client: EventClient) {
		const sceneDroppedItems = this.droppedItems.get(client.currentGroup) || []
		sceneDroppedItems.push(item)
		this.droppedItems.set(client.currentGroup, sceneDroppedItems)

		// Broadcast to all players in the scene that an item was dropped
		client.emit(Receiver.Group, Event.Scene.AddItems, { items: [item] })
	}

	pickItem(itemId: string, client: EventClient): DroppedItem | undefined {
		const sceneItems = this.getSceneItems(client.currentGroup)
		const itemIndex = sceneItems.findIndex(item => item.id === itemId)
		
		if (itemIndex === -1) return undefined

		const [removedItem] = sceneItems.splice(itemIndex, 1)
		this.droppedItems.set(client.currentGroup, sceneItems)

		// Broadcast to all players in the scene that an item was picked up
		client.emit(Receiver.Group, Event.Scene.RemoveItems, { itemIds: [itemId] })

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

			this.event.emit(Receiver.Group, Event.Scene.RemoveItems, { itemIds: expiredItemIds }, scene)
		}
	}
} 