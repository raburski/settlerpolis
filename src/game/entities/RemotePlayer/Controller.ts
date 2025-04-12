import { Scene } from 'phaser'
import { PlayerView } from '../Player/View'
import { Event } from '../../../../backend/src/events'
import { EventBus } from '../../EventBus'

export class RemotePlayerController {
	constructor(
		private view: PlayerView,
		private scene: Scene,
		public playerId: string
	) {
		// Subscribe to remote player movement events
		EventBus.on(Event.Players.CS.Move, this.handlePlayerMoved, this)
		// Subscribe to chat messages
		EventBus.on(Event.Chat.SC.Receive, this.handleChatMessage, this)
	}

	private handlePlayerMoved = (data: { sourcePlayerId: string, x: number, y: number }) => {
		// Only update if this is our player
		if (data.sourcePlayerId === this.playerId) {
			this.view.updatePosition(data.x, data.y)
		}
	}

	private handleChatMessage = (data: { sourcePlayerId: string, message: string }) => {
		// Only show message if it's from our player
		if (data.playerId === this.playerId) {
			this.view.displayMessage(data.message)
		}
	}

	update(): void {
		// Update view
		this.view.preUpdate()
	}

	public destroy(): void {
		// Clean up event listeners
		EventBus.off(Event.Players.CS.Move, this.handlePlayerMoved, this)
		EventBus.off(Event.Chat.SC.Receive, this.handleChatMessage, this)
		// Destroy the view
		this.view.destroy()
	}
} 