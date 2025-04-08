import { io, Socket } from 'socket.io-client'
import { EventBus } from '../EventBus'

export interface PlayerData {
	id: string
	x: number
	y: number
	scene: string
}

export interface ChatMessage {
	playerId: string
	playerName?: string
	message: string
	scene: string
	timestamp: number
}

export class MultiplayerService {
	private static instance: MultiplayerService
	private socket: Socket | null = null
	private players: Map<string, PlayerData> = new Map()
	private currentScene: string | null = null
	private playerName: string = 'Player'

	private constructor() {}

	static getInstance(): MultiplayerService {
		if (!MultiplayerService.instance) {
			MultiplayerService.instance = new MultiplayerService()
		}
		return MultiplayerService.instance
	}

	setPlayerName(name: string) {
		this.playerName = name
	}

	connect(serverUrl: string = 'https://hearty-rejoicing-production.up.railway.app') {
		if (this.socket) return

		this.socket = io(serverUrl, {
			path: '/api/socket.io'
		})

		this.socket.on('connect', () => {
			console.log('Connected to multiplayer server')
		})

		this.socket.on('players:list', (players: PlayerData[]) => {
			players.forEach(player => {
				if (player.id !== this.socket?.id) {
					this.players.set(player.id, player)
					EventBus.emit('player:joined', player)
				}
			})
		})

		this.socket.on('player:joined', (player: PlayerData) => {
			this.players.set(player.id, player)
			EventBus.emit('player:joined', player)
		})

		this.socket.on('player:moved', (player: PlayerData) => {
			this.players.set(player.id, player)
			EventBus.emit('player:moved', player)
		})

		this.socket.on('player:left', (playerId: string) => {
			this.players.delete(playerId)
			EventBus.emit('player:left', playerId)
		})

		// Chat events
		this.socket.on('chat:message', (message: ChatMessage) => {
			EventBus.emit('chat:message', message)
		})
	}

	joinGame(x: number, y: number, scene: string) {
		if (!this.socket) return

		this.currentScene = scene
		this.socket.emit('player:join', { x, y, scene })
	}

	updatePosition(x: number, y: number, scene: string) {
		if (!this.socket || !this.currentScene) return

		this.currentScene = scene
		this.socket.emit('player:move', { x, y, scene })
	}

	getPlayers(): PlayerData[] {
		return Array.from(this.players.values())
	}

	disconnect() {
		if (this.socket) {
			this.socket.disconnect()
			this.socket = null
		}
		this.players.clear()
		this.currentScene = null
	}

	sendChatMessage(message: string) {
		if (!this.socket || !this.currentScene) return

		const chatMessage: ChatMessage = {
			playerId: this.socket.id,
			playerName: this.playerName,
			message,
			scene: this.currentScene,
			timestamp: Date.now()
		}

		this.socket.emit('chat:message', chatMessage)
	}
} 