import { EventManager, EventCallback, LifecycleCallback, EventClient } from './events'
import { Receiver } from './Receiver'
import { NetworkManager } from './NetworkManager'

type ServerEventData<T = any> = {
	__clientContext?: {
		id: string
		currentGroup: string
	}
	data: T
}

export class EventBusManager implements EventManager {
	private eventHandlers: Map<string, EventCallback[]> = new Map()
	private joinedHandlers: LifecycleCallback[] = []
	private leftHandlers: LifecycleCallback[] = []
	private debug = true

	constructor(private networkManager: NetworkManager) {
		if (this.debug) console.log('[EventBusManager] Initialized')
	}

	on<T>(event: string, callback: EventCallback<T>): void {
		if (this.debug) console.log(`[EventBusManager] Registering handler for event: ${event}`)
		// Get existing handlers for this event or create new array
		const handlers = this.eventHandlers.get(event) || []
		
		if (event.startsWith('cs:')) {
			// For client-to-server events, we need to subscribe to the network manager
			if (handlers.length == 0) {
				// No handler registered for this even yet
				this.networkManager.on(event, (data: any, client: EventClient) => this.onNetworkEvent(event, data, client))
				if (this.debug) console.log(`[EventBusManager] Setting up network subscription for ${event}`)
			}
			handlers.push(callback)
		} else {
			handlers.push(callback)
		}
		this.eventHandlers.set(event, handlers)
		if (this.debug) console.log(`[EventBusManager] Registered handler for ${event}. Total handlers: ${handlers.length}`)
	}

	createProxyClient(client: EventClient): EventClient {
		return {
			...client,
			emit: (to: Receiver, event: string, data: any, groupName?: string) => this.emit(to, event, data, groupName, client)
		}
	}

	createServerClient(): EventClient {
		return {
			id: 'server',
			currentGroup: 'GLOBAL',
			setGroup: () => {},
			emit: this.emit.bind(this)
		}
	}

	onNetworkEvent(event: string, data: any, client: EventClient): void {
		if (this.debug) console.log(`[EventBusManager] Processing sc: event: ${event}`)
		const handlers = this.eventHandlers.get(event) || []
		if (this.debug) console.log(`[EventBusManager] Found ${handlers.length} handlers for sc: event ${event}`)
		handlers.forEach(handler => {
			try {
				if (this.debug) console.log(`[EventBusManager] Calling handler for sc: event ${event}`)
				handler(data, this.createProxyClient(client))
			} catch (error) {
				console.error(`[EventBusManager] Error handling event ${event}:`, error)
			}
		})
	}

	onJoined(callback: LifecycleCallback): void {
		if (this.debug) console.log('[EventBusManager] Registering joined handler')
		this.joinedHandlers.push(callback)
		// Forward to network manager
		this.networkManager.onJoined(callback)
	}

	onLeft(callback: LifecycleCallback): void {
		if (this.debug) console.log('[EventBusManager] Registering left handler')
		this.leftHandlers.push(callback)
		// Forward to network manager
		this.networkManager.onLeft(callback)
	}

	emit(to: Receiver, event: string, data: any, groupName?: string, originalClient?: EventClient): void {
		if (this.debug) {
			console.log('[EventBusManager] Emitting event:', event, 'to:', to, 'groupName:', groupName)
			if (event.startsWith('ss:')) {
				console.log('[EventBusManager] Stack trace for ss: event emission:')
			}
		}
		
		// Handle events based on their prefix
		if (event.startsWith('sc:')) {
			if (originalClient) {
				if (this.debug) console.log(`[EventBusManager] Routing sc: event to original client: ${event}`)
				originalClient.emit(to, event, data, groupName)
			} else {
				// Server to client events should be forwarded to network manager
				if (this.debug) console.log(`[EventBusManager] Routing sc: event to networkManager: ${event}`)
				this.networkManager.emit(to, event, data, groupName)
			}
			
		} else if (event.startsWith('cs:')) {
			// Client to server events should not be emitted by the server
			console.error(`[EventBusManager] Incorrect event emission: ${event}. Server should not emit cs: events.`)
		} else if (event.startsWith('ss:')) {
			// Server to server events should be routed internally
			if (this.debug) console.log(`[EventBusManager] Processing ss: event internally: ${event}`)
			const handlers = this.eventHandlers.get(event) || []
			if (this.debug) console.log(`[EventBusManager] Found ${handlers.length} handlers for ss: event ${event}`)
			handlers.forEach(handler => {
				try {
					if (this.debug) console.log(`[EventBusManager] Calling handler for ss: event ${event}`)
					handler(data, originalClient ? originalClient : this.createServerClient())
				} catch (error) {
					console.error(`[EventBusManager] Error handling event ${event}:`, error)
				}
			})
		} else {
			console.warn(`[EventBusManager] Event ${event} has no recognized prefix (sc:, cs:, ss:)`)
		}
	}
} 