import { io, Socket } from 'socket.io-client'
import { EventBus } from '../EventBus'

export enum Gender {
	Male = 'Male',
	Female = 'Female'
}

export interface PlayerAppearance {
	gender: Gender
}

export interface PlayerData {
	id: string
	x: number
	y: number
	scene: string
	appearance: PlayerAppearance
}

export interface ChatMessage {
	playerId: string
	playerName?: string
	message: string
	scene: string
	timestamp: number
}

const DEFAULT_APPEARANCE: PlayerAppearance = {
	gender: Gender.Male
}

export class MultiplayerService {
	private static instance: MultiplayerService
	private socket: Socket | null = null
	private players: Map<string, PlayerData> = new Map()
	private currentScene: string | null = null
	private playerName: string = 'Player'
	private lastMessageTime: number = 0
	private pingInterval: number | null = null
	private readonly PING_INTERVAL = 3000 // 3 seconds

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
			this.lastMessageTime = Date.now()
			this.startPingInterval()
		})

		this.socket.on('disconnect', () => {
			console.log('Disconnected from multiplayer server')
			// Clean up resources or notify the application about the disconnection
			EventBus.emit('player:disconnected')
			this.stopPingInterval()
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

	private startPingInterval() {
		this.stopPingInterval() // Clear any existing interval
		this.pingInterval = window.setInterval(() => {
			const now = Date.now()
			if (now - this.lastMessageTime >= this.PING_INTERVAL) {
				this.sendPing()
			}
		}, 1000) // Check every second
	}

	private stopPingInterval() {
		if (this.pingInterval !== null) {
			clearInterval(this.pingInterval)
			this.pingInterval = null
		}
	}

	private sendPing() {
		if (this.socket) {
			this.socket.emit('system:ping')
			this.lastMessageTime = Date.now()
		}
	}

	private send(event: string, data: any) {
		if (this.socket) {
			this.socket.emit(event, data)
			this.lastMessageTime = Date.now()
		}
	}

	joinGame(x: number, y: number, scene: string, appearance: PlayerAppearance = DEFAULT_APPEARANCE) {
		if (!this.socket) return

		this.currentScene = scene
		this.send('player:join', { x, y, scene, appearance })
	}

	updatePosition(x: number, y: number, scene: string) {
		if (!this.socket || !this.currentScene) return

		this.currentScene = scene
		this.send('player:move', { x, y, scene })
	}

	getPlayers(): PlayerData[] {
		return Array.from(this.players.values())
	}

	disconnect() {
		this.stopPingInterval()
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

		this.send('chat:message', chatMessage)
	}
} 