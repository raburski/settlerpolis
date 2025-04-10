import { EventManager, Event } from '../Event'
import { ChatMessageData } from '../DataTypes'
import { Receiver } from '../Receiver'

export class ChatManager {
	constructor(private event: EventManager) {
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		// Handle chat messages
		this.event.on<ChatMessageData>(Event.Chat.Message, (data, client) => {
			client.emit(Receiver.NoSenderGroup, Event.Chat.Message, data)
		})
	}
} 