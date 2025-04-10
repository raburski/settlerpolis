import { EventManager, Event, EventClient, Receiver } from '../../../backend/src/Event'

class LocalEventClient implements EventClient {
	private _currentGroup: string = 'GLOBAL'

	constructor(
		public readonly id: string,
		private onEmit: (event: string, data: any) => void
	) {}

	get currentGroup(): string {
		return this._currentGroup
	}

	setCurrentGroup(group: string) {
		this._currentGroup = group
	}

	emit(receiver: Receiver, event: string, data: any) {
		this.onEmit(event, data)
	}
}

class LocalEventManager implements EventManager {
	private handlers: Map<string, Array<(data: any, client: EventClient) => void>> = new Map()
	private client: LocalEventClient

	constructor(
		clientId: string,
		private onEmit: (event: string, data: any) => void
	) {
		this.client = new LocalEventClient(clientId, onEmit)
	}

	on<T>(event: string, handler: (data: T, client: EventClient) => void) {
		if (!this.handlers.has(event)) {
			this.handlers.set(event, [])
		}
		this.handlers.get(event).push(handler)
	}

	emit(event: string, data: any) {
		this.onEmit(event, data)
	}

	handleIncomingMessage(event: string, data: any) {
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
		this.client = new LocalEventManager('client', (event, data) => {
			// When client emits, forward to server
			(this.server as LocalEventManager).handleIncomingMessage(event, data)
		})

		this.server = new LocalEventManager('server', (event, data) => {
			// When server emits, forward to client
			(this.client as LocalEventManager).handleIncomingMessage(event, data)
		})
	}
} 