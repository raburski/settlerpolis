import express, { Request, Response } from 'express'
import { createServer } from 'http'
import { Server, Socket } from 'socket.io'
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
apiRouter.get('/health', (req: Request, res: Response) => {
	res.json({ status: 'ok' })
})

// Use the API router with /api prefix
app.use('/api', apiRouter)

// Store connected players
const players = new Map<string, PlayerData>()

interface Position {
	x: number
	y: number
}

interface PlayerAppearance {
	bodyColor: string
	hairStyle: string
	clothingStyle: string
}

interface PlayerData {
	id: string
	position: Position
	scene: string
	appearance: PlayerAppearance
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
 * @param sourcePlayerId The ID of the player sending the message
 */
function broadcastToScene(scene: string, event: string, data: any, sourcePlayerId?: string) {
	const scenePlayers = Array.from(players.values()).filter(p => p.scene === scene)
	
	scenePlayers.forEach(player => {
		if (player.id !== sourcePlayerId) {
			io.to(player.id).emit(event, data)
		}
	})
}

// Socket.IO connection handling
io.on('connection', (socket: Socket) => {
	console.log('Player connected:', socket.id)

	// Initialize last message timestamp
	lastMessageTimestamps.set(socket.id, Date.now())

	// Handle player joining a scene
	socket.on(Event.Player.Join, (data: { position: Position, scene: string, appearance: PlayerAppearance }) => {
		const playerId = socket.id
		players.set(playerId, {
			id: playerId,
			position: data.position,
			scene: data.scene,
			appearance: data.appearance
		})

		// Send the complete list of players to the new player
		socket.emit(Event.Players.List, Array.from(players.values()))

		// Broadcast the new player to all other players in the scene
		broadcastToScene(data.scene, Event.Player.Joined, players.get(playerId), playerId)
	})

	// Handle player movement
	socket.on(Event.Player.Moved, (data: { position: Position, scene: string }) => {
		const player = players.get(socket.id)
		if (player) {
			player.position = data.position
			player.scene = data.scene
			broadcastToScene(data.scene, Event.Player.Moved, player, socket.id)
		}
	})

	// Handle chat messages
	socket.on(Event.Chat.Message, (message: string) => {
		const player = players.get(socket.id)
		if (player) {
			broadcastToScene(player.scene, Event.Chat.Message, {
				playerId: socket.id,
				message
			}, socket.id)
		}
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