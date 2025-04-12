import { EventManager, Event, EventClient, EventCallback, LifecycleCallback } from '../../../backend/src/events'
import { Socket, io } from 'socket.io-client'
import { Receiver } from '../../../backend/src/Receiver'

export interface NetworkEventManager extends EventManager {
	connect(onConnect: () => {})
	disconnect()
}

export class NetworkClient implements NetworkEventManager {
	private _currentGroup: string = 'GLOBAL'

	constructor(
		public readonly id: string,
		private socket: Socket
	) {}

	get currentGroup(): string {
		return this._currentGroup
	}

	setGroup(group: string) {
		this._currentGroup = group
	}

	emit(to: Receiver, event: string, data: any, targetClientId?: string) {
		this.socket.emit(event, data)
	}
}

export class NetworkManager implements EventManager {
	private client: NetworkClient | null = null
	private socket: Socket | null = null
	private lastMessageTime: number = 0
	private pingInterval: number | null = null
	private readonly PING_INTERVAL = 3000 // 3 seconds
	private handlers: Map<string, EventCallback[]> = new Map()
	private joinedCallbacks = new Set<LifecycleCallback>()
	private leftCallbacks = new Set<LifecycleCallback>()

	constructor(private readonly serverUrl: string) {}

	connect(onConnect: () => {}) {
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
			// Trigger joined callbacks when connected
			this.joinedCallbacks.forEach(callback => callback(this.client))
			setTimeout(onConnect, 500)
		})

		this.socket.on('disconnect', () => {
			console.log('Disconnected from multiplayer server')
			// Trigger left callbacks before clearing client
			if (this.client) {
				this.leftCallbacks.forEach(callback => callback(this.client))
			}
			this.client = null
			this.stopPingInterval()
		})

		this.socket.on('connect', () => {
			console.log('[Socket] Connected ✅', this.socket.id)
		})
		
		this.socket.on('disconnect', (reason) => {
			console.warn('[Socket] Disconnected ❌', reason)
		})
		
		this.socket.on('connect_error', (err) => {
			console.error('[Socket] Connection Error 🚫', err)
		})
		
		this.socket.on('reconnect', (attempt) => {
			console.log('[Socket] Reconnected 🔁 on attempt', attempt)
		})
		
		this.socket.on('reconnect_attempt', (attempt) => {
			console.log('[Socket] Trying to reconnect... attempt', attempt)
		})
		
		this.socket.on('reconnect_error', (err) => {
			console.error('[Socket] Reconnect failed ❌', err)
		})
		
		this.socket.on('reconnect_failed', () => {
			console.error('[Socket] Gave up reconnecting 💀')
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

	on<T>(event: string, callback: EventCallback<T>): void {
		if (!this.handlers.has(event)) {
			this.handlers.set(event, [])
		}
		this.handlers.get(event).push(callback as EventCallback)

		// If socket already exists, set up the handler immediately
		if (this.socket) {
			this.setupHandlerForEvent(event)
		}
	}

	onJoined(callback: LifecycleCallback): void {
		this.joinedCallbacks.add(callback)
		// Call immediately if we already have a client
		if (this.client) {
			callback(this.client)
		}
	}

	onLeft(callback: LifecycleCallback): void {
		this.leftCallbacks.add(callback)
	}

	emit(to: Receiver, event: string, data: any, groupName?: string): void {
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
				if (event === Event.Players.CS.Join || event === Event.Players.CS.TransitionTo) {
					const sceneData = data as any
					if (sceneData.scene) {
						this.client.setGroup(sceneData.scene)
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
				this.emit(Receiver.All, Event.System.CS.Ping, null)
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