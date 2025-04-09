import { io, Socket } from 'socket.io-client'
import { EventBus } from '../EventBus'
import { Event } from '../../../backend/src/Event'
import { PlayerJoinData, PlayerMovedData, ChatMessageData, PlayerSourcedData } from '../../../backend/src/DataTypes'

export enum Gender {
	Male = 'Male',
	Female = 'Female'
}

export interface PlayerAppearance {
	gender: Gender
}

export interface PlayerData extends PlayerSourcedData {
	id: string
	x: number
	y: number
	scene: string
	appearance: PlayerAppearance
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

	private constructor() {
		// Listen for player:sendMessage events
		EventBus.on('player:sendMessage', this.handleSendMessage, this)
	}

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
            alert('Disconnected from multiplayer server')
			// Clean up resources or notify the application about the disconnection
			EventBus.emit(Event.Player.Disconnected)
			this.stopPingInterval()
		})

		this.socket.on(Event.Players.List, (players: PlayerData[]) => {
			players.forEach(player => {
				if (player.id !== this.socket?.id) {
					this.players.set(player.id, player)
					EventBus.emit(Event.Player.Joined, { ...player, sourcePlayerId: player.id } as PlayerJoinData)
				}
			})
		})

		this.socket.on(Event.Player.Joined, (player: PlayerJoinData) => {
			this.players.set(player.sourcePlayerId, player)
			EventBus.emit(Event.Player.Joined, player)
		})

		this.socket.on(Event.Player.Moved, (data: PlayerMovedData) => {
			const player = this.players.get(data.sourcePlayerId)
            if (player) {
                player.x = data.x
                player.y = data.y
            }
			EventBus.emit(Event.Player.Moved, data)
		})

		this.socket.on(Event.Player.Left, (data: PlayerSourcedData) => {
			this.players.delete(data.sourcePlayerId)
			EventBus.emit(Event.Player.Left, data)
		})

		// Chat events
		this.socket.on(Event.Chat.Message, (message: ChatMessageData) => {
			EventBus.emit(Event.Chat.Message, message)
		})
	}

	private startPingInterval() {
		this.stopPingInterval() // Clear any existing interval
		this.pingInterval = window.setInterval(() => {
			const now = Date.now()
			if (now - this.lastMessageTime >= this.PING_INTERVAL) {
				this.send(Event.System.Ping)
			}
		}, 1000) // Check every second
	}

	private stopPingInterval() {
		if (this.pingInterval !== null) {
			clearInterval(this.pingInterval)
			this.pingInterval = null
		}
	}

	private send(event: string, data: any) {
		if (this.socket) {
            console.log('send', event)
			this.socket.emit(event, data)
			this.lastMessageTime = Date.now()
		}
	}

	joinGame(x: number, y: number, scene: string, appearance: PlayerAppearance = DEFAULT_APPEARANCE) {
		if (!this.socket) return

		this.currentScene = scene
		console.log(`Joining game in scene: ${scene}`)
		this.send(Event.Player.Join, { position: { x, y }, scene, appearance })
	}

	updatePosition(x: number, y: number) {
		if (!this.socket || !this.currentScene) return
		
		this.send(Event.Player.Moved, { x, y })
	}

	transitionToScene(x: number, y: number, scene: string) {
		if (!this.socket) return

		// Send transition event
		this.send(Event.Player.TransitionTo, {
			position: { x, y },
			scene
		})

		// Update current scene
		this.currentScene = scene
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

		const chatMessage: ChatMessageData = {
			message
		}

		this.send(Event.Chat.Message, chatMessage)
	}

	private handleSendMessage(message: string) {
		this.sendChatMessage(message)
	}

	public destroy(): void {
		// Remove event listeners
		EventBus.off('player:sendMessage', this.handleSendMessage, this)
		
		// Stop ping interval
		this.stopPingInterval()
		
		// Disconnect socket
		if (this.socket) {
			this.socket.disconnect()
			this.socket = null
		}
	}
} 