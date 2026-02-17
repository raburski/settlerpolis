import { Receiver, EventManager, Event, EventClient, EventCallback, LifecycleCallback } from '@rugged/game'
import { Socket, io } from 'socket.io-client'

export interface NetworkEventManager extends EventManager {
	connect(onConnect: () => {})
	disconnect()
}

export class NetworkClient implements EventClient {
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
	private onConnectCallback: (() => {}) | null = null
	private lastMessageTime: number = 0
	private pingInterval: number | null = null
	private readonly PING_INTERVAL = 25000 // 5 seconds
	private handlers: Map<string, EventCallback[]> = new Map()
	private socketHandlers: Map<string, (data: any) => void> = new Map()
	private joinedCallbacks = new Set<LifecycleCallback>()
	private leftCallbacks = new Set<LifecycleCallback>()

	constructor(private readonly serverUrl: string) {}

	connect(onConnect: () => {}) {
		if (this.socket) return 
		this.onConnectCallback = onConnect

		this.socket = io(this.serverUrl, {
			path: '/api/socket.io'
		})

		this.socket.on('connect', this.handleSocketConnect)
		this.socket.on('disconnect', this.handleSocketDisconnect)
		this.socket.on('connect', this.handleSocketConnectLog)
		this.socket.on('disconnect', this.handleSocketDisconnectLog)
		this.socket.on('connect_error', this.handleSocketConnectError)
		this.socket.on('reconnect', this.handleSocketReconnect)
		this.socket.on('reconnect_attempt', this.handleSocketReconnectAttempt)
		this.socket.on('reconnect_error', this.handleSocketReconnectError)
		this.socket.on('reconnect_failed', this.handleSocketReconnectFailed)
	}

	disconnect() {
		this.stopPingInterval()
		if (this.socket) {
			this.socket.disconnect()
			this.socket = null
		}
		this.client = null
		this.socketHandlers.clear()
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

	off<T>(event: string, callback: EventCallback<T>): void {
		const handlers = this.handlers.get(event)
		if (!handlers) return

		const nextHandlers = handlers.filter(handler => handler !== callback)
		if (nextHandlers.length === 0) {
			this.handlers.delete(event)
			if (this.socket) {
				const socketHandler = this.socketHandlers.get(event)
				if (socketHandler) {
					this.socket.off(event, socketHandler)
					this.socketHandlers.delete(event)
				}
			}
		} else {
			this.handlers.set(event, nextHandlers)
		}
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

	private readonly handleSocketConnect = (): void => {
		if (!this.socket) return
		console.log('Connected to multiplayer server')
		this.client = new NetworkClient(this.socket.id, this.socket)
		this.lastMessageTime = Date.now()
		this.startPingInterval()
		this.setupSocketHandlers()
		this.joinedCallbacks.forEach(callback => callback(this.client as NetworkClient))
		this.onConnectCallback?.()
	}

	private readonly handleSocketDisconnect = (): void => {
		console.log('Disconnected from multiplayer server')
		if (this.client) {
			this.leftCallbacks.forEach(callback => callback(this.client as NetworkClient))
		}
		this.client = null
		this.stopPingInterval()
	}

	private readonly handleSocketConnectLog = (): void => {
		console.log('[Socket] Connected ✅', this.socket?.id)
	}

	private readonly handleSocketDisconnectLog = (reason: unknown): void => {
		console.warn('[Socket] Disconnected ❌', reason)
	}

	private readonly handleSocketConnectError = (err: unknown): void => {
		console.error('[Socket] Connection Error 🚫', err)
	}

	private readonly handleSocketReconnect = (attempt: number): void => {
		console.log('[Socket] Reconnected 🔁 on attempt', attempt)
	}

	private readonly handleSocketReconnectAttempt = (attempt: number): void => {
		console.log('[Socket] Trying to reconnect... attempt', attempt)
	}

	private readonly handleSocketReconnectError = (err: unknown): void => {
		console.error('[Socket] Reconnect failed ❌', err)
	}

	private readonly handleSocketReconnectFailed = (): void => {
		console.error('[Socket] Gave up reconnecting 💀')
	}

	private setupHandlerForEvent(event: string) {
		if (!this.socket || !this.handlers.has(event)) return

		if (this.socketHandlers.has(event)) return

		const socketHandler = (data: any) => {
			if (this.client) {
				// Update client's current group based on map events
				if (event === Event.Players.CS.Join || event === Event.Players.CS.TransitionTo) {
					const mapData = data as any
					if (mapData.mapId) {
						this.client.setGroup(mapData.mapId)
					}
				}

				const handlers = this.handlers.get(event) || []
				handlers.forEach(handler => handler(data, this.client))
				this.lastMessageTime = Date.now()
			}
		}

		this.socketHandlers.set(event, socketHandler)
		this.socket.on(event, socketHandler)
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
