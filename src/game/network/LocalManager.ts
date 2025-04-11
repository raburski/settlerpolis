import { EventManager, Event, EventClient, EventCallback, LifecycleCallback } from '../../../backend/src/events'
import { Receiver } from '../../../backend/src/Receiver'

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

class LocalEventManager implements EventManager {
	private handlers: Map<string, EventCallback[]> = new Map()
	private client: LocalEventClient
	private joinedCallbacks = new Set<LifecycleCallback>()
	private leftCallbacks = new Set<LifecycleCallback>()
	private hasReceivedMessage = false

	constructor(
		private clientId: string,
		private onEmit: (to: Receiver, event: string, data: any, groupName?: string) => void
	) {
		this.client = new LocalEventClient(clientId, onEmit)
	}

	on<T>(event: string, callback: EventCallback<T>): void {
		if (!this.handlers.has(event)) {
			this.handlers.set(event, [])
		}
		this.handlers.get(event).push(callback as EventCallback)
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
			console.log('[LocalManager] Event with no name?', to, event, data)
			return
		}

		// If this is a server-side event and we're the client, route it back to server
		if (event.startsWith('ss:') && this.clientId === 'client') {
			console.log(`[EVENT] Routing SS event back to server:`, event, data)
			;(this.onEmit as any)(to, event, data)
			return
		}

		console.log(`[EVENT] to ${this.client.id}:`, event, data)
		// If this is the first message received, trigger joined callbacks
		if (!this.hasReceivedMessage) {
			this.hasReceivedMessage = true
			this.joinedCallbacks.forEach(callback => callback(this.client))
		}

		if (!this.handlers.has(event)) return

		const handlers = this.handlers.get(event)
		handlers.forEach(handler => handler(data, this.client))
	}
}

export class LocalManager {
	public readonly client: EventManager
	public readonly server: EventManager

	constructor() {
		// Create two event managers with different client IDs
		this.client = new LocalEventManager('client', (to, event, data, groupName) => {
			// When client emits, forward to server
			(this.server as LocalEventManager).handleIncomingMessage(to, event, data)
		})

		this.server = new LocalEventManager('server', (to, event, data, groupName) => {
			// When server emits, forward to client
			(this.client as LocalEventManager).handleIncomingMessage(to, event, data)
		})
	}
} 