import { Scene } from 'phaser'
import { PlayerView } from '../Player/View'
import { Event } from '../../../../backend/src/events'
import { EventBus } from '../../EventBus'
import { Direction } from '../Player/View2'

export class RemotePlayerController {
	constructor(
		private view: PlayerView,
		private scene: Scene,
		public playerId: string
	) {
		// Subscribe to remote player movement events
		EventBus.on(Event.Players.SC.Move, this.handlePlayerMoved, this)
		// Subscribe to chat messages
		EventBus.on(Event.Chat.SC.Receive, this.handleChatMessage, this)
	}

	private handlePlayerMoved = (data: { sourcePlayerId: string, x: number, y: number }) => {
		// Only update if this is our player
		if (data.sourcePlayerId === this.playerId) {
			// Calculate direction based on position difference
			const dx = data.x - this.view.x
			const dy = data.y - this.view.y
			
			// Determine direction based on which axis has the larger change
			// If the change is very small, don't update direction
			const threshold = 5 // Minimum change to consider direction change
			
			if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
				let direction: Direction
				
				if (Math.abs(dx) > Math.abs(dy)) {
					// Horizontal movement is dominant
					direction = dx > 0 ? Direction.Right : Direction.Left
				} else {
					// Vertical movement is dominant
					direction = dy > 0 ? Direction.Down : Direction.Up
				}
				
				// Update the direction
				this.view.updateDirection(direction)
			}
			
			// Update position
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