import express, { Request, Response } from 'express'
import { createServer } from 'http'
import { Server, Socket } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
import { Event } from './Event'
import { PlayerJoinData, PlayerMovedData, ChatMessageData, PlayerSourcedData, PlayerTransitionData, InventoryData, Item, Inventory, DroppedItem, DropItemData, PickUpItemData } from './DataTypes'
import { Position } from './types'
import { PICKUP_RANGE } from './consts'

const DEFAULT_INVENTORY_ITEM = {
	id: '1',
	name: 'Butelka mózgotrzepa'
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

// Track last message timestamp for each player
const lastMessageTimestamps = new Map<string, number>()

/**
 * Broadcasts a message from a player to all other players in a specific scene
 * @param scene The scene to broadcast to
 * @param event The event name to emit
 * @param data The data to send
 * @param sourcePlayerId The ID of the player sending the message
 */
function broadcastFromPlayerToScene<T extends PlayerSourcedData>(scene: string, event: string, data: T, sourcePlayerId: string) {
	const scenePlayers = Array.from(players.values()).filter(p => p.scene === scene)
	
	scenePlayers.forEach(player => {
		if (player.id !== sourcePlayerId) {
			io.to(player.id).emit(event, { ...data, sourcePlayerId })
		}
	})
}

/**
 * Broadcasts a message from the system to all players in a specific scene
 * @param scene The scene to broadcast to
 * @param event The event name to emit
 * @param data The data to send
 */
function broadcastFromSystemToScene<T>(scene: string, event: string, data: T) {
	const scenePlayers = Array.from(players.values()).filter(p => p.scene === scene)
	
	scenePlayers.forEach(player => {
		io.to(player.id).emit(event, data)
	})
}

// Function to update player connection health
function playerConnectionHealthUpdate(playerId: string) {
	lastMessageTimestamps.set(playerId, Date.now())
}

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

		// Notify all players in the scene about removed items
		broadcastFromSystemToScene(scene, Event.Scene.RemoveItems, { itemIds: expiredItemIds })
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

// Socket.IO connection handling
io.on('connection', (socket: Socket) => {
	console.log('Player connected:', socket.id)

	// Initialize last message timestamp
	lastMessageTimestamps.set(socket.id, Date.now())
	
	// Initialize empty inventory for new player
	const newInventory: Inventory = { items: [DEFAULT_INVENTORY_ITEM] }
	inventories.set(socket.id, newInventory)
	
	// Send initial inventory data
	socket.emit(Event.Inventory.Loaded, { inventory: newInventory })

	// Function to send current players list filtered by scene
	function sendCurrentPlayersList(scene: string) {
		const scenePlayers = Array.from(players.values())
			.filter(p => p.scene === scene && p.id !== socket.id)
		socket.emit(Event.Players.List, scenePlayers)
	}

	// Handle player joining a scene
	socket.on(Event.Player.Join, (data: PlayerJoinData) => {
		const playerId = socket.id
		players.set(playerId, {
			id: playerId,
			...data,
		})

		// Update player connection health
		playerConnectionHealthUpdate(playerId)

		// Send only players from the same scene
		sendCurrentPlayersList(data.scene)

		// Send existing dropped items in this scene to the joining player
		const sceneDroppedItems = droppedItems.get(data.scene) || []
		if (sceneDroppedItems.length > 0) {
			socket.emit(Event.Scene.AddItems, { items: sceneDroppedItems })
		}

		broadcastFromPlayerToScene<PlayerJoinData>(data.scene, Event.Player.Joined, data, playerId)
	})

	// Handle scene transition
	socket.on(Event.Player.TransitionTo, (data: PlayerTransitionData) => {
		const playerId = socket.id
		const player = players.get(playerId)

		if (player) {
			// First, notify players in the current scene that this player is leaving
			broadcastFromPlayerToScene<PlayerSourcedData>(player.scene, Event.Player.Left, {}, playerId)

			// Update player data with new scene and position
			player.scene = data.scene
			player.position = data.position

			// Update player connection health
			playerConnectionHealthUpdate(playerId)

			// Send the current players list for the new scene
			sendCurrentPlayersList(data.scene)

			// Notify players in the new scene that this player has joined
			broadcastFromPlayerToScene<PlayerJoinData>(
				data.scene,
				Event.Player.Joined,
				data,
				playerId
			)
		}
	})

	// Handle player movement
	socket.on(Event.Player.Moved, (data: PlayerMovedData) => {
		const player = players.get(socket.id)
		if (player) {
			player.position = data
			
			// Update player connection health
			playerConnectionHealthUpdate(socket.id)
			
			broadcastFromPlayerToScene<PlayerMovedData>(player.scene, Event.Player.Moved, data, socket.id)
		}
	})

	// Handle chat messages
	socket.on(Event.Chat.Message, (data: ChatMessageData) => {
		const player = players.get(socket.id)
		if (player) {
			// Update player connection health
			playerConnectionHealthUpdate(socket.id)
			
			broadcastFromPlayerToScene<ChatMessageData>(player.scene, Event.Chat.Message, data, socket.id)
		}
	})

	// Handle system ping
	socket.on(Event.System.Ping, () => {
		// Update player connection health
		playerConnectionHealthUpdate(socket.id)
		
		socket.emit(Event.System.Ping)
	})

	// Handle item drop
	socket.on(Event.Inventory.Drop, (data: DropItemData) => {
		const player = players.get(socket.id)
		const inventory = inventories.get(socket.id)

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
				socket.emit(Event.Inventory.Loaded, { inventory })

				// Broadcast to all players in the scene that an item was dropped
				broadcastFromSystemToScene(player.scene, Event.Scene.AddItems, { items: [newDroppedItem] })
			}
		}
	})

	// Handle item pickup
	socket.on(Event.Inventory.PickUp, (data: PickUpItemData) => {
		const player = players.get(socket.id)
		const inventory = inventories.get(socket.id)

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
					name: pickedItem.name
				}
				inventory.items.push(inventoryItem)

				// Update player's inventory
				socket.emit(Event.Inventory.Loaded, { inventory })

				// Broadcast to all players in the scene that an item was picked up
				broadcastFromSystemToScene(player.scene, Event.Scene.RemoveItems, { itemIds: [data.itemId] })
			}
		}
	})

	// Handle disconnection
	socket.on('disconnect', () => {
		console.log('Player disconnected:', socket.id)
		const player = players.get(socket.id)
		players.delete(socket.id)
		inventories.delete(socket.id)
		lastMessageTimestamps.delete(socket.id)
		if (player) {
			// Broadcast player left to all players in the same scene
			broadcastFromPlayerToScene<PlayerSourcedData>(player.scene, Event.Player.Left, {}, socket.id)
		}
	})
})

const TIMEOUT_CHECK_INTERVAL = 5000 // 5 seconds
const MAX_INACTIVE_TIME = 6000 // 6 seconds

// Periodic check for inactive players
setInterval(() => {
	const now = Date.now()
	for (const [playerId, lastMessageTime] of lastMessageTimestamps.entries()) {
		if (now - lastMessageTime > MAX_INACTIVE_TIME) {
			const socket = io.sockets.sockets.get(playerId)
			const player = players.get(playerId)
			if (socket) {
				if (player) {
					// Broadcast player left to all players in the same scene
					broadcastFromPlayerToScene<PlayerSourcedData>(player.scene, Event.Player.Left, {}, playerId)
				}
				socket.disconnect()
			}
			lastMessageTimestamps.delete(playerId)
		}
	}
}, TIMEOUT_CHECK_INTERVAL)

const PORT = process.env.PORT || 3000

httpServer.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`)
}) 