import express, { Request, Response } from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
import { Event } from './Event'
import { PlayerJoinData, PlayerMovedData, ChatMessageData, PlayerSourcedData, PlayerTransitionData, InventoryData, Item, Inventory, DroppedItem, DropItemData, PickUpItemData, ConsumeItemData } from './DataTypes'
import { Position } from './types'
import { PICKUP_RANGE } from './consts'
import { v4 as uuidv4 } from 'uuid'
import { ItemType } from './types'
import { NetworkManager } from './NetworkManager'
import { Receiver } from './Receiver'

const DEFAULT_INVENTORY_ITEM_NAME = 'Butelka mózgotrzepa'

// Function to create a new item with a random ID
function createItemWithRandomId(name: string, type: ItemType = ItemType.Consumable): Item {
	return {
		id: uuidv4(),
		name,
		type
	}
}

const DROPPED_ITEM_LIFESPAN = 5 * 60 * 1000 // 5 minutes in milliseconds
const ITEM_CLEANUP_INTERVAL = 30 * 1000 // Check every 30 seconds

dotenv.config()

const app = express()
const httpServer = createServer(app)

// Create Socket.IO server with path prefix
const io = new Server(httpServer, {
	cors: {
		origin: [
			process.env.CLIENT_URL || 'http://localhost:5173',
			'http://localhost:8080',
			'https://rugtopolis-production.up.railway.app'
		],
		methods: ['GET', 'POST']
	},
	path: '/api/socket.io' // Add path prefix for WebSocket
})

// Create network manager instance
const network = new NetworkManager(io)

// Add base path for API routes
const apiRouter = express.Router()

// Health check endpoint
apiRouter.get('/health', (req: Request, res: Response) => {
	res.json({ status: 'ok' })
})

// Use the API router with /api prefix
app.use('/api', apiRouter)

interface PlayerData extends PlayerJoinData {
	id: string
}

// Store connected players
const players = new Map<string, PlayerData>()

// Store player inventories
const inventories = new Map<string, Inventory>()

// Store dropped items per scene
const droppedItems = new Map<string, DroppedItem[]>()

// Function to remove expired items from a scene
function removeExpiredItems(scene: string, expiredItemIds: string[]) {
	if (expiredItemIds.length === 0) return

	const sceneItems = droppedItems.get(scene)
	if (sceneItems) {
		// Remove expired items
		droppedItems.set(
			scene,
			sceneItems.filter(item => !expiredItemIds.includes(item.id))
		)

		// Get any client from the scene to broadcast the message
		const sceneClient = Array.from(io.sockets.sockets.values())
			.find(socket => network.getClientsInGroup(scene).includes(socket.id))
		
		if (sceneClient) {
			const client = network.createNetworkClient(sceneClient)
			client.emit(Receiver.Group, Event.Scene.RemoveItems, { itemIds: expiredItemIds })
		}
	}
}

// Periodic check for expired items
setInterval(() => {
	const now = Date.now()
	droppedItems.forEach((items, scene) => {
		const expiredItemIds = items
			.filter(item => now - item.droppedAt > DROPPED_ITEM_LIFESPAN)
			.map(item => item.id)

		if (expiredItemIds.length > 0) {
			removeExpiredItems(scene, expiredItemIds)
		}
	})
}, ITEM_CLEANUP_INTERVAL)

// Register timeout handler
network.onClientTimeout((clientId) => {
	console.log('Client timed out:', clientId)
	const player = players.get(clientId)
	players.delete(clientId)
	inventories.delete(clientId)

	if (player) {
		// Get the socket to create a client instance for the final message
		const socket = io.sockets.sockets.get(clientId)
		if (socket) {
			const client = network.createNetworkClient(socket)
			client.emit(Receiver.NoSenderGroup, Event.Player.Left, {})
		}
	}
})

// Example of using NetworkManager with NetworkClient
network.on<PlayerJoinData>(Event.Player.Join, (data, client) => {
	const playerId = client.id
	players.set(playerId, {
		id: playerId,
		...data,
	})

	// Set player's scene as their group
	client.setGroup(data.scene)

	// Send only players from the same scene
	const scenePlayers = Array.from(players.values())
		.filter(p => p.scene === data.scene && p.id !== client.id)
	client.emit(Receiver.Sender, Event.Players.List, scenePlayers)

	// Send existing dropped items in this scene to the joining player
	const sceneDroppedItems = droppedItems.get(data.scene) || []
	if (sceneDroppedItems.length > 0) {
		client.emit(Receiver.Sender, Event.Scene.AddItems, { items: sceneDroppedItems })
	}

	client.emit(Receiver.NoSenderGroup, Event.Player.Joined, data)
})

// Handle scene transition
network.on<PlayerTransitionData>(Event.Player.TransitionTo, (data, client) => {
	const playerId = client.id
	const player = players.get(playerId)

	if (player) {
		// First, notify players in the current scene that this player is leaving
		client.emit(Receiver.NoSenderGroup, Event.Player.Left, {})

		// Update player data with new scene and position
		player.scene = data.scene
		player.position = data.position

		// Update player's group to new scene
		client.setGroup(data.scene)

		// Send the current players list for the new scene
		const scenePlayers = Array.from(players.values())
			.filter(p => p.scene === data.scene && p.id !== client.id)
		client.emit(Receiver.Sender, Event.Players.List, scenePlayers)

		// Notify players in the new scene that this player has joined
		client.emit(Receiver.NoSenderGroup, Event.Player.Joined, data)
	}
})

// Handle player movement
network.on<PlayerMovedData>(Event.Player.Moved, (data, client) => {
	const player = players.get(client.id)
	if (player) {
		player.position = data
		
		client.emit(Receiver.NoSenderGroup, Event.Player.Moved, data)
	}
})

// Handle chat messages
network.on<ChatMessageData>(Event.Chat.Message, (data, client) => {
	const player = players.get(client.id)
	if (player) {
		client.emit(Receiver.NoSenderGroup, Event.Chat.Message, data)
	}
})

// Handle system ping
network.on(Event.System.Ping, (_, client) => {
	client.emit(Receiver.Sender, Event.System.Ping, {})
})

// Handle item drop
network.on<DropItemData>(Event.Inventory.Drop, (data, client) => {
	const player = players.get(client.id)
	const inventory = inventories.get(client.id)

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
			const sceneDroppedItems = droppedItems.get(player.scene) || []
			sceneDroppedItems.push(newDroppedItem)
			droppedItems.set(player.scene, sceneDroppedItems)

			// Update player's inventory
			client.emit(Receiver.Sender, Event.Inventory.Loaded, { inventory })

			// Broadcast to all players in the scene that an item was dropped
			client.emit(Receiver.Group, Event.Scene.AddItems, { items: [newDroppedItem] })
		}
	}
})

// Handle item pickup
network.on<PickUpItemData>(Event.Inventory.PickUp, (data, client) => {
	const player = players.get(client.id)
	const inventory = inventories.get(client.id)

	if (player && inventory) {
		const sceneDroppedItems = droppedItems.get(player.scene) || []
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
			droppedItems.set(player.scene, sceneDroppedItems)

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
network.on<ConsumeItemData>(Event.Inventory.Consume, (data, client) => {
	const inventory = inventories.get(client.id)

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

// Handle disconnection
network.on('disconnect', (_, client) => {
	console.log('Player disconnected:', client.id)
	const player = players.get(client.id)
	players.delete(client.id)
	inventories.delete(client.id)
	if (player) {
		// Broadcast player left to all players in the same scene
		client.emit(Receiver.NoSenderGroup, Event.Player.Left, {})
	}
})

const PORT = process.env.PORT || 3000

httpServer.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`)
}) 