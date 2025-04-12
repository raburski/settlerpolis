import { Server, Socket } from 'socket.io'
import { EventClient, EventManager, EventCallback, LifecycleCallback } from './events'
import { Receiver } from './Receiver'

const DEFAULT_GROUP = 'GLOBAL'

export class NetworkManager implements EventManager {
	private io: Server
	private eventHandlers: Map<string, EventCallback[]>
	private groupClients: Map<string, Set<string>>
	private clientGroups: Map<string, string>
	private joinedCallbacks: Set<LifecycleCallback>
	private leftCallbacks: Set<LifecycleCallback>
	private lastMessageTimestamps: Map<string, number>
	private readonly TIMEOUT_CHECK_INTERVAL = 5000 // 5 seconds
	private readonly MAX_INACTIVE_TIME = 6000 // 6 seconds
	private debug = false

	constructor(io: Server) {
		this.io = io
		this.eventHandlers = new Map()
		this.groupClients = new Map()
		this.clientGroups = new Map()
		this.joinedCallbacks = new Set()
		this.leftCallbacks = new Set()
		this.lastMessageTimestamps = new Map()

		if (this.debug) console.log('[NetworkManager] Initialized')

		// Set up connection handler
		this.io.on('connection', this.handleConnection.bind(this))

		// Start timeout checker
		setInterval(this.checkInactiveClients.bind(this), this.TIMEOUT_CHECK_INTERVAL)
	}

	private checkInactiveClients() {
		if (this.debug) console.log('[NetworkManager] Checking for inactive clients')
		// const now = Date.now()
		// for (const [clientId, lastMessageTime] of this.lastMessageTimestamps.entries()) {
		// 	if (now - lastMessageTime > this.MAX_INACTIVE_TIME) {
		// 		const socket = this.io.sockets.sockets.get(clientId)
		// 		if (socket) {
		// 			const client = this.createNetworkClient(socket)
		// 			// Notify left callbacks about the timeout
		// 			this.leftCallbacks.forEach(callback => callback(client))
		// 			// Clean up
		// 			this.lastMessageTimestamps.delete(clientId)
		// 			socket.disconnect()
		// 		}
		// 	}
		// }
	}

	private updateClientTimestamp(clientId: string) {
		if (this.debug) console.log(`[NetworkManager] Updating timestamp for client: ${clientId}`)
		this.lastMessageTimestamps.set(clientId, Date.now())
	}

	private removeClientFromGroup(clientId: string, group: string): void {
		if (this.debug) console.log(`[NetworkManager] Removing client ${clientId} from group ${group}`)
		const clients = this.groupClients.get(group)
		if (clients) {
			clients.delete(clientId)
			if (clients.size === 0) {
				if (this.debug) console.log(`[NetworkManager] Group ${group} is now empty, removing`)
				this.groupClients.delete(group)
			}
		}
		this.clientGroups.delete(clientId)
	}

	createNetworkClient(socket: Socket): EventClient {
		if (this.debug) console.log(`[NetworkManager] Creating network client for socket: ${socket.id}`)
		const self = this
		return {
			id: socket.id,
			get currentGroup() {
				return self.clientGroups.get(socket.id) || DEFAULT_GROUP
			},
			setGroup(group: string) {
				if (self.debug) console.log(`[NetworkManager] Setting group ${group} for client ${socket.id}`)
				// Remove from previous group if exists
				const previousGroup = self.clientGroups.get(socket.id)
				if (previousGroup) {
					self.removeClientFromGroup(socket.id, previousGroup)
				}

				// Add to new group
				let clients = self.groupClients.get(group)
				if (!clients) {
					clients = new Set()
					self.groupClients.set(group, clients)
				}
				clients.add(socket.id)
				self.clientGroups.set(socket.id, group)
				if (self.debug) console.log(`[NetworkManager] Client ${socket.id} added to group ${group}. Group size: ${clients.size}`)
			},
			emit: (to: Receiver, event: string, data: any, targetClientId?: string) => {
				if (self.debug) {
					console.log('[NetworkManager] Client emit:', {
						from: socket.id,
						to,
						event,
						targetClientId,
						currentGroup: self.clientGroups.get(socket.id)
					})
				}
				
				// Update timestamp when client emits a message
				self.updateClientTimestamp(socket.id)
				
				switch (to) {
					case Receiver.Sender:
						socket.emit(event, data)
						break
					
					case Receiver.Group: {
						const group = self.clientGroups.get(socket.id)
						if (group) {
							const clients = self.groupClients.get(group)
							if (self.debug) console.log(`[NetworkManager] Emitting to group ${group}, clients: ${Array.from(clients || [])}`)
							clients?.forEach(clientId => {
								self.io.to(clientId).emit(event, data)
							})
						}
						break
					}
					
					case Receiver.NoSenderGroup: {
						const group = self.clientGroups.get(socket.id)
						if (group) {
							const clients = self.groupClients.get(group)
							if (self.debug) console.log(`[NetworkManager] Emitting to group ${group} except sender ${socket.id}`)
							clients?.forEach(clientId => {
								if (clientId !== socket.id) {
									self.io.to(clientId).emit(event, { ...data, sourcePlayerId: socket.id })
								}
							})
						}
						break
					}
					
					case Receiver.All:
						if (self.debug) console.log('[NetworkManager] Broadcasting to all clients')
						self.io.emit(event, data)
						break
					
					case Receiver.Client:
						if (targetClientId) {
							if (self.debug) console.log(`[NetworkManager] Emitting directly to client ${targetClientId}`)
							self.io.to(targetClientId).emit(event, data)
						}
						break
				}
			}
		}
	}

	private handleConnection(socket: Socket) {
		if (this.debug) console.log(`[NetworkManager] New client connected: ${socket.id}`)
		const client = this.createNetworkClient(socket)
		
		// Initialize timestamp for new connection
		this.updateClientTimestamp(socket.id)

		// Notify joined callbacks
		if (this.debug) console.log(`[NetworkManager] Notifying ${this.joinedCallbacks.size} joined callbacks`)
		this.joinedCallbacks.forEach(callback => callback(client))

		// When a socket connects, set up all the event handlers for it
		if (this.debug) console.log(`[NetworkManager] Setting up ${this.eventHandlers.size} event handlers for client ${socket.id}`)
		this.eventHandlers.forEach((callbacks, event) => {
			socket.on(event, (data: any) => {
				if (this.debug) console.log(`[NetworkManager] Received event ${event} from client ${socket.id}`)
				// Update timestamp when client sends any event
				this.updateClientTimestamp(socket.id)
				callbacks.forEach(callback => callback(data, client))
			})
		})

		// Set up disconnect handler
		socket.on('disconnect', () => {
			if (this.debug) console.log(`[NetworkManager] Client disconnected: ${socket.id}`)
			// Clean up group membership on disconnect
			const group = this.clientGroups.get(socket.id)
			if (group) {
				this.removeClientFromGroup(socket.id, group)
			}
			
			// Clean up timestamp
			this.lastMessageTimestamps.delete(socket.id)
			
			// Notify left callbacks
			if (this.debug) console.log(`[NetworkManager] Notifying ${this.leftCallbacks.size} left callbacks`)
			this.leftCallbacks.forEach(callback => callback(client))
			
			const handlers = this.eventHandlers.get('disconnect')
			if (handlers) {
				handlers.forEach(callback => callback(undefined, client))
			}
		})
	}

	onJoined(callback: LifecycleCallback): void {
		if (this.debug) console.log('[NetworkManager] Adding joined callback')
		this.joinedCallbacks.add(callback)
	}

	onLeft(callback: LifecycleCallback): void {
		if (this.debug) console.log('[NetworkManager] Adding left callback')
		this.leftCallbacks.add(callback)
	}

	on<T>(event: string, callback: EventCallback<T>): void {
		if (this.debug) console.log(`[NetworkManager] Registering handler for event: ${event}`)
		// Add the callback to our handlers map
		const handlers = this.eventHandlers.get(event) || []
		handlers.push(callback as EventCallback)
		this.eventHandlers.set(event, handlers)

		// Also set up the handler for all existing sockets
		if (this.debug) console.log(`[NetworkManager] Setting up handler for ${event} on ${this.io.sockets.sockets.size} existing sockets`)
		this.io.sockets.sockets.forEach(socket => {
			const client = this.createNetworkClient(socket)
			socket.on(event, (data: T) => {
				if (this.debug) console.log(`[NetworkManager] Handling event ${event} from existing client ${socket.id}`)
				callback(data, client)
			})
		})
	}

	emit(to: Receiver, event: string, data: any, groupName?: string, originalClient?: EventClient): void {
		if (this.debug) {
			console.log('[NetworkManager] Global emit:', {
				to,
				event,
				groupName,
				hasOriginalClient: !!originalClient,
				originalClientId: originalClient?.id
			})
		}

		if (to === Receiver.Sender || to === Receiver.NoSenderGroup) {
			if (!originalClient) {
				throw new Error(`Cannot use ${to} with global emit. These receivers are only available for client-specific emissions.`)
			}
			// If we have the original client, use its emit method
			originalClient.emit(to, event, data)
			return
		}

		switch (to) {
			case Receiver.All:
				if (this.debug) console.log('[NetworkManager] Broadcasting to all clients')
				this.io.emit(event, data)
				break
			
			case Receiver.Client:
				if (groupName) { // groupName is used as targetClientId in this case
					if (this.debug) console.log(`[NetworkManager] Emitting to specific client: ${groupName}`)
					this.io.to(groupName).emit(event, data)
				}
				break
			
			default:
				if (groupName) {
					const clients = this.groupClients.get(groupName)
					if (this.debug) console.log(`[NetworkManager] Emitting to group ${groupName}, clients: ${Array.from(clients || [])}`)
					if (clients) {
						clients.forEach(clientId => {
							this.io.to(clientId).emit(event, data)
						})
					}
				} else {
					if (this.debug) console.log('[NetworkManager] No group specified, broadcasting to all')
					this.io.emit(event, data)
				}
		}
	}
} 