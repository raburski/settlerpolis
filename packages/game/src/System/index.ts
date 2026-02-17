import { EventManager, Event, EventClient } from '../events'
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
		this.event.on(Event.System.CS.Ping, this.handleSystemCSPing)
	}

	/* EVENT HANDLERS */
	private readonly handleSystemCSPing = (_data: unknown, client: EventClient): void => {
		client.emit(Receiver.Sender, Event.System.SC.Ping, {})
	}
}
