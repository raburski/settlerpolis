import { EventManager, Event, EventClient, Receiver } from '../../../backend/src/Event'
import { Socket, io } from 'socket.io-client'

export class NetworkClient implements EventClient {
	private _currentGroup: string = 'GLOBAL'

	constructor(
		public readonly id: string,
		private socket: Socket
	) {}

	get currentGroup(): string {
		return this._currentGroup
	}

	setCurrentGroup(group: string) {
		this._currentGroup = group
	}

	emit(receiver: Receiver, event: string, data: any) {
		this.socket.emit(event, data)
	}
}

export class NetworkManager implements EventManager {
	private client: NetworkClient | null = null
	private socket: Socket | null = null
	private lastMessageTime: number = 0
	private pingInterval: number | null = null
	private readonly PING_INTERVAL = 3000 // 3 seconds
	private handlers: Map<string, Array<(data: any, client: EventClient) => void>> = new Map()

	constructor(private readonly serverUrl: string) {}

	connect() {
		if (this.socket) return

		this.socket = io(this.serverUrl, {
			path: '/api/socket.io'
		})

		this.socket.on('connect', () => {
			console.log('Connected to multiplayer server')
			this.client = new NetworkClient(this.socket.id, this.socket)
			this.lastMessageTime = Date.now()
			this.startPingInterval()
			this.setupSocketHandlers()
		})

		this.socket.on('disconnect', () => {
			console.log('Disconnected from multiplayer server')
			this.client = null
			this.stopPingInterval()
		})
	}

	disconnect() {
		this.stopPingInterval()
		if (this.socket) {
			this.socket.disconnect()
			this.socket = null
		}
		this.client = null
	}

	on<T>(event: string, handler: (data: T, client: EventClient) => void) {
		if (!this.handlers.has(event)) {
			this.handlers.set(event, [])
		}
		this.handlers.get(event).push(handler)

		// If socket already exists, set up the handler immediately
		if (this.socket) {
			this.setupHandlerForEvent(event)
		}
	}

	emit(event: string, data: any) {
		if (!this.socket) return

		this.socket.emit(event, data)
		this.lastMessageTime = Date.now()
	}

	private setupSocketHandlers() {
		if (!this.socket) return

		// Set up handlers for all registered events
		for (const event of this.handlers.keys()) {
			this.setupHandlerForEvent(event)
		}
	}

	private setupHandlerForEvent(event: string) {
		if (!this.socket || !this.handlers.has(event)) return

		this.socket.on(event, (data: any) => {
			if (this.client) {
				// Update client's current group based on scene events
				if (event === Event.Player.Join || event === Event.Player.TransitionTo) {
					const sceneData = data as any
					if (sceneData.scene) {
						this.client.setCurrentGroup(sceneData.scene)
					}
				}

				const handlers = this.handlers.get(event)
				handlers.forEach(handler => handler(data, this.client))
				this.lastMessageTime = Date.now()
			}
		})
	}

	private startPingInterval() {
		this.stopPingInterval() // Clear any existing interval
		this.pingInterval = window.setInterval(() => {
			const now = Date.now()
			if (now - this.lastMessageTime >= this.PING_INTERVAL) {
				this.emit(Event.System.Ping, null)
			}
		}, 1000) // Check every second
	}

	private stopPingInterval() {
		if (this.pingInterval !== null) {
			clearInterval(this.pingInterval)
			this.pingInterval = null
		}
	}
} 