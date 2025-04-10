import { Server, Socket } from 'socket.io'
import { Event } from './Event'
import { Receiver } from './Receiver'

// Interface for client operations
export interface NetworkClient {
	id: string
	currentGroup?: string
	emit(to: Receiver, event: string, data: any, targetClientId?: string): void
}

// Type for event callback functions
type EventCallback<T = any> = (data: T, client: NetworkClient) => void

// Interface that NetworkManager implements
export interface INetworkManager {
	on<T>(event: string, callback: EventCallback<T>): void
	setClientGroup(clientId: string, group: string): void
	removeClientFromGroup(clientId: string, group: string): void
	getClientsInGroup(group: string): string[]
}

export class NetworkManager implements INetworkManager {
	private io: Server
	private eventHandlers: Map<string, EventCallback[]>
	private groupClients: Map<string, Set<string>>
	private clientGroups: Map<string, string>

	constructor(io: Server) {
		this.io = io
		this.eventHandlers = new Map()
		this.groupClients = new Map()
		this.clientGroups = new Map()

		// Set up connection handler
		this.io.on('connection', this.handleConnection.bind(this))
	}

	createNetworkClient(socket: Socket): NetworkClient {
		const self = this // Store reference to NetworkManager instance
		return {
			id: socket.id,
			get currentGroup() {
				return self.clientGroups.get(socket.id)
			},
			emit: (to: Receiver, event: string, data: any, targetClientId?: string) => {
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

		// When a socket connects, set up all the event handlers for it
		this.eventHandlers.forEach((callbacks, event) => {
			socket.on(event, (data: any) => {
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
			
			const handlers = this.eventHandlers.get('disconnect')
			if (handlers) {
				handlers.forEach(callback => callback(undefined, client))
			}
		})
	}

	on<T>(event: string, callback: EventCallback<T>): void {
		// Add the callback to our handlers map
		const handlers = this.eventHandlers.get(event) || []
		handlers.push(callback as EventCallback)
		this.eventHandlers.set(event, handlers)

		// Also set up the handler for all existing sockets
		this.io.sockets.sockets.forEach(socket => {
			const client = this.createNetworkClient(socket)
			socket.on(event, (data: T) => callback(data, client))
		})
	}

	setClientGroup(clientId: string, group: string): void {
		// Remove from previous group if exists
		const previousGroup = this.clientGroups.get(clientId)
		if (previousGroup) {
			this.removeClientFromGroup(clientId, previousGroup)
		}

		// Add to new group
		let clients = this.groupClients.get(group)
		if (!clients) {
			clients = new Set()
			this.groupClients.set(group, clients)
		}
		clients.add(clientId)
		this.clientGroups.set(clientId, group)
	}

	removeClientFromGroup(clientId: string, group: string): void {
		const clients = this.groupClients.get(group)
		if (clients) {
			clients.delete(clientId)
			if (clients.size === 0) {
				this.groupClients.delete(group)
			}
		}
		this.clientGroups.delete(clientId)
	}

	getClientsInGroup(group: string): string[] {
		const clients = this.groupClients.get(group)
		return clients ? Array.from(clients) : []
	}
} 