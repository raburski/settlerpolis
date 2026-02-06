import { Receiver, EventManager, Event, EventClient, EventCallback, LifecycleCallback } from '@rugged/game'
import { NetworkEventManager } from "./NetworkManager"

const DEBUG_LOAD_TIMING = String(import.meta.env.VITE_DEBUG_LOAD_TIMING || '').toLowerCase() === 'true'
const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

const clonePayload = (data: any, event: string) => {
	if (data === undefined) return undefined
	if (!DEBUG_LOAD_TIMING) {
		const raw = JSON.stringify(data)
		if (raw === undefined) return undefined
		return JSON.parse(raw)
	}
	const start = perfNow()
	const raw = JSON.stringify(data)
	if (raw === undefined) return undefined
	const cloned = JSON.parse(raw)
	const elapsed = perfNow() - start
	if (elapsed > 4 || raw.length > 200000) {
		console.info(`[Perf] local-clone event=${event} size=${raw.length} time=${elapsed.toFixed(1)}ms`)
	}
	return cloned
}

class LocalEventClient implements EventClient {
	private _currentGroup: string = 'GLOBAL'

	constructor(
		public readonly id: string,
		private onEmit: (to: Receiver, event: string, data: any, targetClientId?: string) => void
	) {}

	get currentGroup(): string {
		return this._currentGroup
	}

	setGroup(group: string) {
		this._currentGroup = group
	}

	emit(to: Receiver, event: string, data: any, targetClientId?: string) {
		this.onEmit(to, event, data, targetClientId)
	}
}

class LocalEventManager implements NetworkEventManager {
	private handlers: Map<string, EventCallback[]> = new Map()
	private client: LocalEventClient
	private joinedCallbacks = new Set<LifecycleCallback>()
	private leftCallbacks = new Set<LifecycleCallback>()
	private hasReceivedMessage = false

	constructor(
		private clientId: string,
		private onEmit: (to: Receiver, event: string, data: any, groupName?: string) => void,
		private silentLogs: boolean = false
	) {
		this.client = new LocalEventClient(clientId, onEmit)
	}

	connect(onConnect: () => {}) {
		setTimeout(onConnect, 0)
	}

	disconnect() {}

	on<T>(event: string, callback: EventCallback<T>): void {
		if (!this.handlers.has(event)) {
			this.handlers.set(event, [])
		}
		this.handlers.get(event).push(callback as EventCallback)
	}

	off<T>(event: string, callback: EventCallback<T>): void {
		const handlers = this.handlers.get(event)
		if (!handlers) return

		const nextHandlers = handlers.filter(handler => handler !== callback)
		if (nextHandlers.length === 0) {
			this.handlers.delete(event)
		} else {
			this.handlers.set(event, nextHandlers)
		}
	}

	onJoined(callback: LifecycleCallback): void {
		this.joinedCallbacks.add(callback)
		// Call immediately if we've already received a message
		if (this.hasReceivedMessage) {
			callback(this.client)
		}
	}

	onLeft(callback: LifecycleCallback): void {
		this.leftCallbacks.add(callback)
	}

	emit(to: Receiver, event: string, data: any, groupName?: string): void {
		this.onEmit(to, event, data, groupName)
	}

	handleIncomingMessage(to: Receiver, event: string, data: any) {
		if (to === Receiver.NoSenderGroup) return

		if (!event) {
			if (!this.silentLogs) {
				console.log('[LocalManager] Event with no name?', to, event, data)
			}
			return
		}

		// If this is a server-side event and we're the client, route it back to server
		if (event.startsWith('ss:') && this.clientId === 'client') {
			if (!this.silentLogs) {
				console.log(`[EVENT] Routing SS event back to server:`, event, data)
			}
			;(this.onEmit as any)(to, event, data)
			return
		}

		if (!this.silentLogs) {
			console.log(`[LocalManager] Event to ${this.client.id}:`, event, 'Receiver:', to, 'Data:', data)
		}
		// If this is the first message received, trigger joined callbacks
		if (!this.hasReceivedMessage) {
			this.hasReceivedMessage = true
			this.joinedCallbacks.forEach(callback => callback(this.client))
		}

		if (!this.handlers.has(event)) {
			if (!this.silentLogs) {
				console.warn(`[LocalManager] No handlers for event: ${event} (available handlers: ${Array.from(this.handlers.keys()).join(', ')})`)
			}
			return
		}

		const handlers = this.handlers.get(event)
		if (!this.silentLogs) {
			console.log(`[LocalManager] Calling ${handlers.length} handler(s) for event: ${event}`)
		}
		handlers.forEach(handler => handler(data, this.client))
	}
}

export class LocalManager {
	public readonly client: EventManager
	public readonly server: EventManager

	constructor(options: { silentLogs?: boolean } = {}) {
		const silentLogs = options.silentLogs ?? false
		// Create two event managers with different client IDs
		this.client = new LocalEventManager('client', (to, event, data, groupName) => {
			// When client emits, forward to server
			;(this.server as LocalEventManager).handleIncomingMessage(to, event, clonePayload(data, event))
		}, silentLogs)

		this.server = new LocalEventManager('server', (to, event, data, groupName) => {
			// When server emits, forward to client
			;(this.client as LocalEventManager).handleIncomingMessage(to, event, clonePayload(data, event))
		}, silentLogs)
	}
} 
