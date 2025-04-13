import { Scene } from 'phaser'
import { LootView } from './View'
import { EventBus } from '../../EventBus'
import { Event } from '../../../../backend/src/events'

const PICKUP_RANGE = 100 // Define pickup range in pixels

export class LootController {
	constructor(
		private view: LootView,
		private scene: Scene,
		private itemId: string,
		private player: { x: number, y: number }
	) {
		this.setupInteraction()
	}

	private setupInteraction() {
		this.view.setInteractive(() => {
			// Check if player is close enough to pick up
			const distance = Phaser.Math.Distance.Between(
				this.player.x,
				this.player.y,
				this.view.x,
				this.view.y
			)
			
			if (distance <= PICKUP_RANGE) {
				EventBus.emit(Event.Players.CS.PickupItem, { itemId: this.itemId })
			} else {
				// Show "too far" message through event system
				EventBus.emit('ui:message:system', "Too far to pick up")
			}
		})
	}

	update(): void {
		this.view.preUpdate()
	}

	public destroy() {
		this.view.destroy()
	}
} 