import { EventManager, Event, EventClient } from '../Event'
import { PlayerJoinData, PlayerMovedData, PlayerTransitionData, InventoryData, Item, Inventory, DroppedItem, DropItemData, PickUpItemData, ConsumeItemData } from '../DataTypes'
import { Position } from '../types'
import { PICKUP_RANGE } from '../consts'
import { v4 as uuidv4 } from 'uuid'
import { ItemType } from '../types'
import { Receiver } from '../Receiver'
import { ChatManager } from './Chat'
import { SystemManager } from './System'

interface PlayerData extends PlayerJoinData {
	id: string
}

const DEFAULT_INVENTORY_ITEM_NAME = 'Butelka mózgotrzepa'

// Function to create a new item with a random ID
function createItemWithRandomId(name: string, type: ItemType = ItemType.Consumable): Item {
	return {
		id: uuidv4(),
		name,
		type
	}
}

export class GameManager {
	private players = new Map<string, PlayerData>()
	private inventories = new Map<string, Inventory>()
	private droppedItems = new Map<string, DroppedItem[]>()
	private readonly DROPPED_ITEM_LIFESPAN = 5 * 60 * 1000 // 5 minutes in milliseconds
	private readonly ITEM_CLEANUP_INTERVAL = 30 * 1000 // Check every 30 seconds
	private chatManager: ChatManager
	private systemManager: SystemManager

	constructor(private event: EventManager) {
		this.chatManager = new ChatManager(event)
		this.systemManager = new SystemManager(event)
		this.setupEventHandlers()
		this.startItemCleanupInterval()
	}

	private setupEventHandlers() {
		// Handle client lifecycle
		this.event.onJoined((client) => {
			// Create initial inventory with default item
			const initialInventory: Inventory = {
				items: [createItemWithRandomId(DEFAULT_INVENTORY_ITEM_NAME)]
			}
			this.inventories.set(client.id, initialInventory)
		})

		this.event.onLeft((client) => {
			console.log('Player left:', client.id)
			const player = this.players.get(client.id)
			this.players.delete(client.id)
			this.inventories.delete(client.id)
			if (player) {
				// Broadcast player left to all players in the same scene
				client.emit(Receiver.NoSenderGroup, Event.Player.Left, {})
			}
		})

		// Handle player join
		this.event.on<PlayerJoinData>(Event.Player.Join, (data, client) => {
			const playerId = client.id
			this.players.set(playerId, {
				id: playerId,
				...data,
			})

			// Set player's scene as their group
			client.setGroup(data.scene)

			// Send only players from the same scene
			const scenePlayers = Array.from(this.players.values())
				.filter(p => p.scene === data.scene && p.id !== client.id)
			client.emit(Receiver.Sender, Event.Players.List, scenePlayers)

			// Send existing dropped items in this scene to the joining player
			const sceneDroppedItems = this.droppedItems.get(data.scene) || []
			if (sceneDroppedItems.length > 0) {
				client.emit(Receiver.Sender, Event.Scene.AddItems, { items: sceneDroppedItems })
			}

			// Send initial inventory to the player
			const inventory = this.inventories.get(client.id)
			if (inventory) {
				client.emit(Receiver.Sender, Event.Inventory.Loaded, { inventory })
			}

			client.emit(Receiver.NoSenderGroup, Event.Player.Joined, data)
		})

		// Handle scene transition
		this.event.on<PlayerTransitionData>(Event.Player.TransitionTo, (data, client) => {
			const playerId = client.id
			const player = this.players.get(playerId)

			if (player) {
				// First, notify players in the current scene that this player is leaving
				client.emit(Receiver.NoSenderGroup, Event.Player.Left, {})

				// Update player data with new scene and position
				player.scene = data.scene
				player.position = data.position

				// Update player's group to new scene
				client.setGroup(data.scene)

				// Send the current players list for the new scene
				const scenePlayers = Array.from(this.players.values())
					.filter(p => p.scene === data.scene && p.id !== client.id)
				client.emit(Receiver.Sender, Event.Players.List, scenePlayers)

				// Notify players in the new scene that this player has joined
				client.emit(Receiver.NoSenderGroup, Event.Player.Joined, data)
			}
		})

		// Handle player movement
		this.event.on<PlayerMovedData>(Event.Player.Moved, (data, client) => {
			const player = this.players.get(client.id)
			if (player) {
				player.position = data
				client.emit(Receiver.NoSenderGroup, Event.Player.Moved, data)
			}
		})

		// Handle item drop
		this.event.on<DropItemData>(Event.Inventory.Drop, (data, client) => {
			const player = this.players.get(client.id)
			const inventory = this.inventories.get(client.id)

			if (player && inventory) {
				// Find the item in player's inventory
				const itemIndex = inventory.items.findIndex(item => item.id === data.itemId)
				
				if (itemIndex !== -1) {
					// Remove item from inventory
					const [droppedItem] = inventory.items.splice(itemIndex, 1)
					
					// Create dropped item with position and scene
					const newDroppedItem: DroppedItem = {
						...droppedItem,
						position: player.position,
						scene: player.scene,
						droppedAt: Date.now()
					}

					// Add to scene's dropped items
					const sceneDroppedItems = this.droppedItems.get(player.scene) || []
					sceneDroppedItems.push(newDroppedItem)
					this.droppedItems.set(player.scene, sceneDroppedItems)

					// Update player's inventory
					client.emit(Receiver.Sender, Event.Inventory.Loaded, { inventory })

					// Broadcast to all players in the scene that an item was dropped
					client.emit(Receiver.Group, Event.Scene.AddItems, { items: [newDroppedItem] })
				}
			}
		})

		// Handle item pickup
		this.event.on<PickUpItemData>(Event.Inventory.PickUp, (data, client) => {
			const player = this.players.get(client.id)
			const inventory = this.inventories.get(client.id)

			if (player && inventory) {
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
					inventory.items.push(inventoryItem)

					// Update player's inventory
					client.emit(Receiver.Sender, Event.Inventory.Loaded, { inventory })

					// Broadcast to all players in the scene that an item was picked up
					client.emit(Receiver.Group, Event.Scene.RemoveItems, { itemIds: [data.itemId] })
				}
			}
		})

		// Handle item consume
		this.event.on<ConsumeItemData>(Event.Inventory.Consume, (data, client) => {
			const inventory = this.inventories.get(client.id)

			if (inventory) {
				const itemIndex = inventory.items.findIndex(item => item.id === data.itemId)

				if (itemIndex !== -1) {
					// Check if item is consumable
					const item = inventory.items[itemIndex]
					if (item.type !== ItemType.Consumable) {
						return // Item is not consumable
					}

					// Remove item from inventory
					inventory.items.splice(itemIndex, 1)

					// Update player's inventory
					client.emit(Receiver.Sender, Event.Inventory.Loaded, { inventory })
				}
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