import { EventManager, Event, EventClient } from '../Event'
import { Item, DroppedItem, DropItemData, PickUpItemData, PlayerJoinData, PlayerTransitionData } from '../DataTypes'
import { PICKUP_RANGE } from '../consts'
import { Receiver } from '../Receiver'
import { ChatManager } from './Chat'
import { SystemManager } from './System'
import { InventoryManager } from './Inventory'
import { PlayersManager } from './Players'

export class GameManager {
	private droppedItems = new Map<string, DroppedItem[]>()
	private readonly DROPPED_ITEM_LIFESPAN = 5 * 60 * 1000 // 5 minutes in milliseconds
	private readonly ITEM_CLEANUP_INTERVAL = 30 * 1000 // Check every 30 seconds
	private chatManager: ChatManager
	private systemManager: SystemManager
	private inventoryManager: InventoryManager
	private playersManager: PlayersManager

	constructor(private event: EventManager) {
		this.chatManager = new ChatManager(event)
		this.systemManager = new SystemManager(event)
		this.inventoryManager = new InventoryManager(event)
		this.playersManager = new PlayersManager(event)
		this.setupEventHandlers()
		this.startItemCleanupInterval()
	}

	private setupEventHandlers() {
		// Handle player join and scene transition to send items
		this.event.on<PlayerJoinData>(Event.Player.Join, (data, client) => {
			const sceneDroppedItems = this.droppedItems.get(data.scene) || []
			if (sceneDroppedItems.length > 0) {
				client.emit(Receiver.Sender, Event.Scene.AddItems, { items: sceneDroppedItems })
			}
		})

		this.event.on<PlayerTransitionData>(Event.Player.TransitionTo, (data, client) => {
			const sceneDroppedItems = this.droppedItems.get(data.scene) || []
			if (sceneDroppedItems.length > 0) {
				client.emit(Receiver.Sender, Event.Scene.AddItems, { items: sceneDroppedItems })
			}
		})

		// Handle item drop
		this.event.on<DropItemData>(Event.Inventory.Drop, (data, client) => {
			const player = this.playersManager.getPlayer(client.id)
			if (!player) return

			const removedItem = this.inventoryManager.removeItem(client, data.itemId)
			if (!removedItem) return

			// Create dropped item with position and scene
			const newDroppedItem: DroppedItem = {
				...removedItem,
				position: player.position,
				scene: player.scene,
				droppedAt: Date.now()
			}

			// Add to scene's dropped items
			const sceneDroppedItems = this.droppedItems.get(player.scene) || []
			sceneDroppedItems.push(newDroppedItem)
			this.droppedItems.set(player.scene, sceneDroppedItems)

			// Broadcast to all players in the scene that an item was dropped
			client.emit(Receiver.Group, Event.Scene.AddItems, { items: [newDroppedItem] })
		})

		// Handle item pickup
		this.event.on<PickUpItemData>(Event.Inventory.PickUp, (data, client) => {
			const player = this.playersManager.getPlayer(client.id)
			if (!player) return

			const sceneDroppedItems = this.droppedItems.get(player.scene) || []
			const itemIndex = sceneDroppedItems.findIndex(item => item.id === data.itemId)

			if (itemIndex !== -1) {
				const item = sceneDroppedItems[itemIndex]
				
				// Calculate distance between player and item
				const distance = Math.sqrt(
					Math.pow(player.position.x - item.position.x, 2) + 
					Math.pow(player.position.y - item.position.y, 2)
				)

				// Check if player is within pickup range
				if (distance > PICKUP_RANGE) {
					return // Player is too far to pick up the item
				}

				// Remove item from dropped items
				const [pickedItem] = sceneDroppedItems.splice(itemIndex, 1)
				this.droppedItems.set(player.scene, sceneDroppedItems)

				// Add item to player's inventory
				const inventoryItem: Item = {
					id: pickedItem.id,
					name: pickedItem.name,
					type: pickedItem.type
				}
				this.inventoryManager.addItem(client, inventoryItem)

				// Broadcast to all players in the scene that an item was picked up
				client.emit(Receiver.Group, Event.Scene.RemoveItems, { itemIds: [data.itemId] })
			}
		})
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