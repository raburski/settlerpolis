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

	constructor(private networkManager: NetworkManager) {}

	on<T>(event: string, callback: EventCallback<T>): void {
		console.log('[EVENT BUS] on:', event)
		// Get existing handlers for this event or create new array
		const handlers = this.eventHandlers.get(event) || []
		
		// Add new handler with wrapped callback for server events
		if (event.startsWith('ss:')) {
			const wrappedCallback: EventCallback<ServerEventData<T>> = (wrappedData, client) => {
				// If we have client context in the data, create a proxy client
				if (wrappedData.__clientContext) {
					const proxyClient = {
						id: wrappedData.__clientContext.id,
						currentGroup: wrappedData.__clientContext.currentGroup,
						emit: (to: Receiver, event: string, data: any, targetClientId?: string) => {
							if (event.startsWith('sc:')) {
								// For sc: events, use the network manager with the original client's group
								this.networkManager.emit(to, event, data, wrappedData.__clientContext?.currentGroup)
							} else {
								// For other events, use normal emit
								this.emit(to, event, data, targetClientId)
							}
						},
						setGroup: () => {} // No-op for server events
					}
					callback(wrappedData.data, proxyClient)
				} else {
					// No client context, just pass the data through
					callback(wrappedData.data, client)
				}
			}
			handlers.push(wrappedCallback)
		} else {
			handlers.push(callback)
		}
		this.eventHandlers.set(event, handlers)
	}

	onJoined(callback: LifecycleCallback): void {
		this.joinedHandlers.push(callback)
		// Forward to network manager
		this.networkManager.onJoined(callback)
	}

	onLeft(callback: LifecycleCallback): void {
		this.leftHandlers.push(callback)
		// Forward to network manager
		this.networkManager.onLeft(callback)
	}

	emit(to: Receiver, event: string, data: any, groupName?: string): void {
		console.log('[EVENT BUS] emit:', to, event)
		// Handle events based on their prefix
		if (event.startsWith('sc:')) {
			// Server to client events should be forwarded to network manager
			this.networkManager.emit(to, event, data, groupName)
		} else if (event.startsWith('cs:')) {
			// Client to server events should not be emitted by the server
			console.error(`[EventBusManager] Incorrect event emission: ${event}. Server should not emit cs: events.`)
		} else if (event.startsWith('ss:')) {
			// Server to server events should be routed internally
			const handlers = this.eventHandlers.get(event) || []
			
			// Wrap the data with client context if we're in a client-originated event chain
			const wrappedData: ServerEventData = {
				data,
				__clientContext: to === Receiver.Sender || to === Receiver.NoSenderGroup ? 
					{ id: groupName || 'server', currentGroup: groupName || 'server' } : undefined
			}

			handlers.forEach(handler => {
				try {
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