import express, { Request, Response } from 'express'
import { createServer } from 'http'
import { Server, Socket } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
import { Event } from './Event'
import { PlayerJoinData, PlayerMovedData, ChatMessageData, PlayerSourcedData, PlayerTransitionData, InventoryData, Item, Inventory } from './DataTypes'
import { Position } from './types'

const DEFAULT_INVENTORY_ITEM = {
	id: 1,
	name: 'Butelka mózgotrzepa'
}

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

// Function to update player connection health
function playerConnectionHealthUpdate(playerId: string) {
	lastMessageTimestamps.set(playerId, Date.now())
}

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