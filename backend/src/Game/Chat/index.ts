import { EventManager, Event } from '../../events'
import { ChatMessageData, ChatSystemMessageData, ChatMessageType } from '../../types'
import { Receiver } from '../../Receiver'

export class ChatManager {
	constructor(private event: EventManager) {
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		// Handle chat messages from players
		this.event.on<ChatMessageData>(Event.Chat.CS.Send, (data, client) => {
			// Validate message
			if (!data.message?.trim()) return
			
			const messageData: ChatMessageData = {
				message: data.message.trim(),
				type: data.type || ChatMessageType.Local,
				playerId: client.id
			}

			// For local messages, only broadcast to players in the same scene/zone
			if (messageData.type === ChatMessageType.Local) {
				client.emit(Receiver.Group, Event.Chat.SC.Receive, messageData)
			}
		})
	}

	/**
	 * Send a system message to specific players or everyone
	 */
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