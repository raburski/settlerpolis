import { EventManager, Event, EventClient } from '../events'
import { Receiver, ChatMessageData, ChatSystemMessageData, ChatMessageType } from '../types'
import { Logger } from '../Logs'

export class ChatManager {
	constructor(
		private event: EventManager,
		private logger: Logger
	) {
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		this.event.on<ChatMessageData>(Event.Chat.CS.Send, this.handleChatCSSend)
	}

	/* EVENT HANDLERS */
	private readonly handleChatCSSend = (data: ChatMessageData, client: EventClient): void => {
		if (!data.message?.trim()) return

		const messageData: ChatMessageData = {
			message: data.message.trim(),
			type: data.type || ChatMessageType.Local,
			playerId: client.id
		}

		if (messageData.type === ChatMessageType.Local) {
			client.emit(Receiver.Group, Event.Chat.SC.Receive, messageData)
		}
	}

	/**
	 * Send a system message to specific players or everyone
	 */
	/* METHODS */
	public sendSystemMessage(message: string, type: ChatSystemMessageData['type'] = 'info', targetGroup?: string) {
		const messageData: ChatSystemMessageData = {
			message,
			type
		}

		if (targetGroup) {
			this.event.emit(Receiver.Group, Event.Chat.SC.System, messageData, targetGroup)
		} else {
			this.event.emit(Receiver.All, Event.Chat.SC.System, messageData)
		}
	}
}
