import { EventManager, Event } from '../Event'
import { Receiver } from '../Receiver'

export class SystemManager {
	constructor(private event: EventManager) {
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		// Handle system ping
		this.event.on(Event.System.Ping, (_, client) => {
			client.emit(Receiver.Sender, Event.System.Ping, {})
		})
	}
} 