import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'

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

// Socket.IO connection handling
io.on('connection', (socket) => {
	console.log('Player connected:', socket.id)

	// Initialize last message timestamp
	lastMessageTimestamps.set(socket.id, Date.now())

	// Handle player joining a scene
	socket.on('player:join', (data: { x: number, y: number, scene: string, appearance: PlayerData['appearance'] }) => {
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
		socket.emit('players:list', Array.from(players.values()))
		
		// Broadcast new player to all other players
		socket.broadcast.emit('player:joined', players.get(socket.id))
	})

	// Handle player movement
	socket.on('player:move', (data: { x: number, y: number, scene: string }) => {
		const player = players.get(socket.id)
		if (player) {
			player.x = data.x
			player.y = data.y
			player.scene = data.scene
			lastMessageTimestamps.set(socket.id, Date.now())
			// Broadcast only x, y, and player id
			socket.broadcast.emit('player:moved', { id: player.id, x: player.x, y: player.y })
		}
	})

	// Handle chat messages
	socket.on('chat:message', (message: ChatMessage) => {
		lastMessageTimestamps.set(socket.id, Date.now())
		// Broadcast the message to all players in the same scene
		socket.broadcast.emit('chat:message', message)
	})

	// Handle system ping
	socket.on('system:ping', () => {
		lastMessageTimestamps.set(socket.id, Date.now())
	})

	// Handle disconnection
	socket.on('disconnect', () => {
		console.log('Player disconnected:', socket.id)
		players.delete(socket.id)
		lastMessageTimestamps.delete(socket.id)
		socket.broadcast.emit('player:left', socket.id)
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
			if (socket) {
				socket.disconnect()
				io.emit('player:left', playerId)
			}
			lastMessageTimestamps.delete(playerId)
		}
	}
}, TIMEOUT_CHECK_INTERVAL)

const PORT = process.env.PORT || 3000

httpServer.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`)
}) 