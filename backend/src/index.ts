import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
import { Event } from './Event'

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
apiRouter.get('/health', (req, res) => {
	res.json({ status: 'ok' })
})

// Use the API router with /api prefix
app.use('/api', apiRouter)

// Store connected players
const players = new Map<string, PlayerData>()

interface PlayerData {
	id: string
	x: number
	y: number
	scene: string
	appearance: {
		bodyColor: string
		hairStyle: string
		clothingStyle: string
	}
}

interface ChatMessage {
	playerId: string
	playerName?: string
	message: string
	scene: string
	timestamp: number
}

// Track last message timestamp for each player
const lastMessageTimestamps = new Map<string, number>()

/**
 * Broadcasts a message to all players in a specific scene
 * @param scene The scene to broadcast to
 * @param event The event name to emit
 * @param data The data to send
 */
function broadcastToScene(scene: string, event: string, data: any) {
	// Get all players in the specified scene
	const playersInScene = Array.from(players.values()).filter(player => player.scene === scene)
	
	// Get the socket IDs for these players
	const socketIds = playersInScene.map(player => player.id)
	
	// Broadcast to all sockets in the scene
	socketIds.forEach(socketId => {
		const socket = io.sockets.sockets.get(socketId)
		if (socket) {
			socket.emit(event, data)
		}
	})
}

// Socket.IO connection handling
io.on('connection', (socket) => {
	console.log('Player connected:', socket.id)

	// Initialize last message timestamp
	lastMessageTimestamps.set(socket.id, Date.now())

	// Handle player joining a scene
	socket.on(Event.Player.Join, (data: { x: number, y: number, scene: string, appearance: PlayerData['appearance'] }) => {
		// Add or update player in the list
		players.set(socket.id, {
			id: socket.id,
			x: data.x,
			y: data.y,
			scene: data.scene,
			appearance: data.appearance
		})
		
		lastMessageTimestamps.set(socket.id, Date.now())
		
		// Send list of players to the new player
		socket.emit(Event.Players.List, Array.from(players.values()))
		
		// Broadcast new player to all other players in the same scene
		broadcastToScene(data.scene, Event.Player.Joined, players.get(socket.id))
	})

	// Handle player movement
	socket.on(Event.Player.Moved, (data: { x: number, y: number, scene: string }) => {
		const player = players.get(socket.id)
		if (player) {
			player.x = data.x
			player.y = data.y
			player.scene = data.scene
			lastMessageTimestamps.set(socket.id, Date.now())
			// Broadcast only x, y, and player id to players in the same scene
			broadcastToScene(data.scene, Event.Player.Moved, { id: player.id, x: player.x, y: player.y })
		}
	})

	// Handle chat messages
	socket.on(Event.Chat.Message, (message: ChatMessage) => {
		lastMessageTimestamps.set(socket.id, Date.now())
		// Broadcast the message to all players in the same scene
		broadcastToScene(message.scene, Event.Chat.Message, message)
	})

	// Handle system ping
	socket.on(Event.System.Ping, () => {
		lastMessageTimestamps.set(socket.id, Date.now())
	})

	// Handle disconnection
	socket.on('disconnect', () => {
		console.log('Player disconnected:', socket.id)
		const player = players.get(socket.id)
		if (player) {
			// Broadcast player left to all players in the same scene
			broadcastToScene(player.scene, Event.Player.Left, socket.id)
		}
		players.delete(socket.id)
		lastMessageTimestamps.delete(socket.id)
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
					broadcastToScene(player.scene, Event.Player.Left, playerId)
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