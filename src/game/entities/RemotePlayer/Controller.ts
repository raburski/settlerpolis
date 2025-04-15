import { Scene } from 'phaser'
import { PlayerView } from '../Player/View'
import { Event } from '../../../../backend/src/events'
import { EventBus } from '../../EventBus'
import { Direction } from '../Player/View2'
import { BasePlayerController } from '../Player/BaseController'

export class RemotePlayerController extends BasePlayerController {
	constructor(
		view: PlayerView,
		scene: Scene,
		playerId: string
	) {
		super(view, scene, playerId)
		// Subscribe to remote player movement events
		EventBus.on(Event.Players.SC.Move, this.handlePlayerMoved, this)
	}

	/**
	 * Remote player should handle events where the source player ID matches this player's ID
	 */
	protected shouldHandleEvent(data: { sourcePlayerId: string }): boolean {
		return data.sourcePlayerId === this.playerId
	}

	private handlePlayerMoved = (data: { sourcePlayerId: string, x: number, y: number }) => {
		// Only update if this is our player
		if (!this.shouldHandleEvent(data)) return
		
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

	update(): void {
		// Update view
		this.view.preUpdate()
	}

	public destroy(): void {
		super.destroy()
		// Clean up event listeners
		EventBus.off(Event.Players.CS.Move, this.handlePlayerMoved, this)
		// Destroy the view
		this.view.destroy()
	}
} 