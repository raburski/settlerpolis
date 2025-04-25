import express, { Request, Response } from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
import { NetworkManager } from './NetworkManager'
import { GameManager } from './Game'
import { EventBusManager } from './EventBusManager'
import { cutscenes, flags, items, npcs, quests, schedules, triggers } from './content'
import { GameContent } from './Game/types'

process.on('uncaughtException', (err) => {
	console.error('Uncaught Exception:', err)
})
  
process.on('unhandledRejection', (reason) => {
	console.error('Unhandled Rejection:', reason)
})

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

// Create event bus manager instance that wraps network manager
const eventBus = new EventBusManager(network)

// Load content statically
const content: GameContent = {
	items,
	quests,
	npcs,
	cutscenes,
	flags,
	schedules,
	triggers
}

// Create game manager instance with event bus and content
const game = new GameManager(eventBus, content)

// Add base path for API routes
const apiRouter = express.Router()

// Health check endpoint
apiRouter.get('/health', (req: Request, res: Response) => {
	res.json({ status: 'ok' })
})

// Use the API router with /api prefix
app.use('/api', apiRouter)

const PORT = process.env.PORT || 3000

httpServer.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`)
}) 