import { EventManager, Event } from '../events'
import { Receiver } from '../Receiver'
import { Logger } from '../Logs'

export class SystemManager {
	constructor(
		private event: EventManager,
		private logger: Logger
	) {
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		// Handle system ping
		this.event.on(Event.System.CS.Ping, (_, client) => {
			client.emit(Receiver.Sender, Event.System.SC.Ping, {})
		})
	}
} 