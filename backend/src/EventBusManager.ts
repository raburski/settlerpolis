import { EventManager, EventCallback, LifecycleCallback } from './events'
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
		
		// Add new handler with wrapped callback for server events
		if (event.startsWith('ss:')) {
			if (this.debug) console.log(`[EventBusManager] Registering ss: event handler for ${event}`)
			const wrappedCallback: EventCallback<ServerEventData<T>> = (wrappedData, client) => {
				try {
					if (this.debug) console.log(`[EventBusManager] Executing ss: event handler for ${event}`, wrappedData.__clientContext?.id)
					// If we have client context in the data, create a proxy client
					if (wrappedData.__clientContext) {
						const proxyClient = {
							id: wrappedData.__clientContext.id,
							currentGroup: wrappedData.__clientContext.currentGroup,
							emit: (to: Receiver, event: string, data: any, targetClientId?: string) => {
								if (this.debug) console.log(`[EventBusManager] Proxy client emitting event: ${event}, to: ${to}, targetClientId: ${targetClientId}`)
								if (event.startsWith('sc:')) {
									// For sc: events, use the network manager with the original client's group
									if (this.debug) console.log(`[EventBusManager] Proxy client routing sc: event to networkManager: ${event}`)
									this.networkManager.emit(to, event, data, wrappedData.__clientContext?.currentGroup)
								} else {
									// For other events, use normal emit
									if (this.debug) console.log(`[EventBusManager] Proxy client routing event to emit: ${event}`)
									this.emit(to, event, data, targetClientId)
								}
							},
							setGroup: () => {} // No-op for server events
						}
						callback(wrappedData.data, proxyClient)
					} else {
						// No client context, just pass the data through
						if (this.debug) console.log(`[EventBusManager] No client context for ss: event ${event}, passing data directly`)
						callback(wrappedData.data, client)
					}
				} catch (error) {
					console.error(`[EventBusManager] Error in callback for event ${event}:`, error)
				}
			}
			handlers.push(wrappedCallback)
		} else if (event.startsWith('cs:')) {
			// For client-to-server events, we need to subscribe to the network manager
			if (this.debug) console.log(`[EventBusManager] Setting up network subscription for ${event}`)
			this.networkManager.on(event, (data, client) => {
				if (this.debug) console.log(`[EventBusManager] Received ${event} from network`, client.id, client.currentGroup)
				try {
					callback(data as T, client)
				} catch (error) {
					console.error(`[EventBusManager] Error in cs: event handler for ${event}:`, error)
				}
			})
			handlers.push(callback)
		} else {
			const wrappedCallback: EventCallback<T> = (data, client) => {
				try {
					if (this.debug) console.log(`[EventBusManager] Executing event handler for ${event}`, client?.id, client?.currentGroup)
					callback(data, client)
				} catch (error) {
					console.error(`[EventBusManager] Error in callback for event ${event}:`, error)
				}
			}
			handlers.push(wrappedCallback)
		}
		this.eventHandlers.set(event, handlers)
		if (this.debug) console.log(`[EventBusManager] Registered handler for ${event}. Total handlers: ${handlers.length}`)
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

	emit(to: Receiver, event: string, data: any, groupName?: string): void {
		if (this.debug) {
			console.log('[EventBusManager] Emitting event:', event, 'to:', to, 'groupName:', groupName)
		}
		
		// Handle events based on their prefix
		if (event.startsWith('sc:')) {
			// Server to client events should be forwarded to network manager
			if (this.debug) console.log(`[EventBusManager] Routing sc: event to networkManager: ${event}`)
			this.networkManager.emit(to, event, data, groupName)
		} else if (event.startsWith('cs:')) {
			// Client to server events should not be emitted by the server
			console.error(`[EventBusManager] Incorrect event emission: ${event}. Server should not emit cs: events.`)
		} else if (event.startsWith('ss:')) {
			// Server to server events should be routed internally
			if (this.debug) console.log(`[EventBusManager] Processing ss: event internally: ${event}`)
			const handlers = this.eventHandlers.get(event) || []
			if (this.debug) console.log(`[EventBusManager] Found ${handlers.length} handlers for ss: event ${event}`)
			
			// Wrap the data with client context if we're in a client-originated event chain
			const wrappedData: ServerEventData = {
				data,
				__clientContext: to === Receiver.Sender || to === Receiver.NoSenderGroup ? 
					{ id: groupName || 'server', currentGroup: groupName || 'server' } : undefined
			}

			if (this.debug) console.log(`[EventBusManager] Wrapped data for ss: event:`, 
				'hasClientContext:', !!wrappedData.__clientContext,
				'clientId:', wrappedData.__clientContext?.id,
				'clientGroup:', wrappedData.__clientContext?.currentGroup)

			handlers.forEach(handler => {
				try {
					if (this.debug) console.log(`[EventBusManager] Calling handler for ss: event ${event}`)
					handler(wrappedData, {
						id: 'server',
						currentGroup: 'server',
						emit: this.emit.bind(this),
						setGroup: () => {} // No-op for server events
					})
				} catch (error) {
					console.error(`[EventBusManager] Error handling event ${event}:`, error)
				}
			})
		} else {
			console.warn(`[EventBusManager] Event ${event} has no recognized prefix (sc:, cs:, ss:)`)
		}
	}
} 