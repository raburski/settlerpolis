import { Server, Socket } from 'socket.io'
import { EventClient, EventManager, EventCallback, LifecycleCallback } from './Event'
import { Receiver } from './Receiver'

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

	constructor(io: Server) {
		this.io = io
		this.eventHandlers = new Map()
		this.groupClients = new Map()
		this.clientGroups = new Map()
		this.joinedCallbacks = new Set()
		this.leftCallbacks = new Set()
		this.lastMessageTimestamps = new Map()

		// Set up connection handler
		this.io.on('connection', this.handleConnection.bind(this))

		// Start timeout checker
		setInterval(this.checkInactiveClients.bind(this), this.TIMEOUT_CHECK_INTERVAL)
	}

	private checkInactiveClients() {
		const now = Date.now()
		for (const [clientId, lastMessageTime] of this.lastMessageTimestamps.entries()) {
			if (now - lastMessageTime > this.MAX_INACTIVE_TIME) {
				const socket = this.io.sockets.sockets.get(clientId)
				if (socket) {
					const client = this.createNetworkClient(socket)
					// Notify left callbacks about the timeout
					this.leftCallbacks.forEach(callback => callback(client))
					// Clean up
					this.lastMessageTimestamps.delete(clientId)
					socket.disconnect()
				}
			}
		}
	}

	private updateClientTimestamp(clientId: string) {
		this.lastMessageTimestamps.set(clientId, Date.now())
	}

	private removeClientFromGroup(clientId: string, group: string): void {
		const clients = this.groupClients.get(group)
		if (clients) {
			clients.delete(clientId)
			if (clients.size === 0) {
				this.groupClients.delete(group)
			}
		}
		this.clientGroups.delete(clientId)
	}

	createNetworkClient(socket: Socket): EventClient {
		const self = this
		return {
			id: socket.id,
			get currentGroup() {
				return self.clientGroups.get(socket.id)
			},
			setGroup(group: string) {
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
			},
			emit: (to: Receiver, event: string, data: any, targetClientId?: string) => {
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
							clients?.forEach(clientId => {
								if (clientId !== socket.id) {
									self.io.to(clientId).emit(event, { ...data, sourcePlayerId: socket.id })
								}
							})
						}
						break
					}
					
					case Receiver.All:
						self.io.emit(event, data)
						break
					
					case Receiver.Client:
						if (targetClientId) {
							self.io.to(targetClientId).emit(event, data)
						}
						break
				}
			}
		}
	}

	private handleConnection(socket: Socket) {
		const client = this.createNetworkClient(socket)
		
		// Initialize timestamp for new connection
		this.updateClientTimestamp(socket.id)

		// Notify joined callbacks
		this.joinedCallbacks.forEach(callback => callback(client))

		// When a socket connects, set up all the event handlers for it
		this.eventHandlers.forEach((callbacks, event) => {
			socket.on(event, (data: any) => {
				// Update timestamp when client sends any event
				this.updateClientTimestamp(socket.id)
				callbacks.forEach(callback => callback(data, client))
			})
		})

		// Set up disconnect handler
		socket.on('disconnect', () => {
			// Clean up group membership on disconnect
			const group = this.clientGroups.get(socket.id)
			if (group) {
				this.removeClientFromGroup(socket.id, group)
			}
			
			// Clean up timestamp
			this.lastMessageTimestamps.delete(socket.id)
			
			// Notify left callbacks
			this.leftCallbacks.forEach(callback => callback(client))
			
			const handlers = this.eventHandlers.get('disconnect')
			if (handlers) {
				handlers.forEach(callback => callback(undefined, client))
			}
		})
	}

	onJoined(callback: LifecycleCallback): void {
		this.joinedCallbacks.add(callback)
	}

	onLeft(callback: LifecycleCallback): void {
		this.leftCallbacks.add(callback)
	}

	on<T>(event: string, callback: EventCallback<T>): void {
		// Add the callback to our handlers map
		const handlers = this.eventHandlers.get(event) || []
		handlers.push(callback as EventCallback)
		this.eventHandlers.set(event, handlers)

		// Also set up the handler for all existing sockets
		this.io.sockets.sockets.forEach(socket => {
			const client = this.createNetworkClient(socket)
			socket.on(event, (data: T) => {
				callback(data, client)
			})
		})
	}

	getClientsInGroup(group: string): string[] {
		const clients = this.groupClients.get(group)
		return clients ? Array.from(clients) : []
	}

	emit(to: Receiver, event: string, data: any, groupName?: string): void {
		if (to === Receiver.Sender || to === Receiver.NoSenderGroup) {
			throw new Error(`Cannot use ${to} with global emit. These receivers are only available for client-specific emissions.`)
		}

		switch (to) {
			case Receiver.Group: {
				if (!groupName) {
					throw new Error('Group name must be provided when using Receiver.Group')
				}
				const clients = this.groupClients.get(groupName)
				clients?.forEach(clientId => {
					this.io.to(clientId).emit(event, data)
				})
				break
			}
			
			case Receiver.All:
				this.io.emit(event, data)
				break
			
			case Receiver.Client:
				if (!groupName) {
					throw new Error('Target client ID must be provided when using Receiver.Client')
				}
				this.io.to(groupName).emit(event, data)
				break
		}
	}
} 