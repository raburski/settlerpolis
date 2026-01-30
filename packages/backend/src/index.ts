import express, { Request, Response } from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
import { NetworkManager } from './NetworkManager'
import { GameManager, GameContent } from '@rugged/game'
import { EventBusManager } from './EventBusManager'
import path from 'path'
import fs from 'fs'
import { BackendMapUrlService } from './services/MapUrlService'

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

// Load content based on environment variable
const CONTENT_FOLDER = process.env.GAME_CONTENT || 'settlerpolis'
const contentPath = path.join(__dirname, '..', '..', '..', 'content', CONTENT_FOLDER)

if (!fs.existsSync(contentPath)) {
	console.error(`Content folder "${CONTENT_FOLDER}" not found at path: ${contentPath}`)
	console.error('Please make sure the content folder exists and GAME_CONTENT environment variable is set correctly')
	process.exit(1)
}

const content: GameContent = require(path.join(contentPath, 'index.ts'))

// Debug: Log content structure
console.log('[Backend] Content loaded:', {
	hasBuildings: !!content.buildings,
	buildingsCount: content.buildings?.length || 0,
	buildings: content.buildings?.map(b => ({ id: b.id, name: b.name })) || []
})

// Create game manager instance with event bus, content, and map URL service
const HOST_URL = process.env.PUBLIC_URL || process.env.RAILWAY_PUBLIC_URL || 'http://localhost:3000'
const mapUrlService = new BackendMapUrlService('/api/maps/', HOST_URL)
const logAllowlist = (process.env.GAME_LOG_ALLOWLIST || 'WorkProviderManager')
	.split(',')
	.map(entry => entry.trim())
	.filter(Boolean)
const game = new GameManager(eventBus, content, mapUrlService, { logAllowlist })

// Add base path for API routes
const apiRouter = express.Router()

// Health check endpoint
apiRouter.get('/health', (req: Request, res: Response) => {
	res.json({ status: 'ok' })
})

// Map JSON endpoint
apiRouter.get('/maps/:mapName.json', (req: Request, res: Response) => {
	const { mapName } = req.params
	const mapData = content.maps[mapName]
	
	if (!mapData) {
		res.status(404).json({ error: 'Map not found' })
		return
	}
	
	try {
		// Ensure the response is properly formatted JSON
		res.setHeader('Content-Type', 'application/json')
		res.json(mapData)
	} catch (error) {
		console.error(`Error serving map ${mapName}:`, error)
		res.status(500).json({ error: 'Failed to serve map data' })
	}
})

// Use the API router with /api prefix
app.use('/api', apiRouter)

const PORT = process.env.PORT || 3000

httpServer.listen(PORT, () => {
	console.log(`Server running on port ${PORT}`)
}) 
