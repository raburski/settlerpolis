import { LootView } from './View'
import { EventBus } from '../../EventBus'
import { UiEvents } from '../../uiEvents'
import { Event } from '@rugged/game'

const PICKUP_RANGE = 100

export class LootController {
	constructor(private view: LootView, private itemId: string, private player: { x: number; y: number }) {
		this.setupInteraction()
	}

	private setupInteraction() {
		this.view.setInteractive(() => {
			const distance = Math.hypot(this.player.x - this.view.x, this.player.y - this.view.y)
			if (distance <= PICKUP_RANGE) {
				EventBus.emit(Event.Players.CS.PickupItem, { itemId: this.itemId })
			} else {
				EventBus.emit(UiEvents.Notifications.SystemMessage, 'Too far to pick up')
			}
		})
	}

	update(_deltaMs: number): void {
		void _deltaMs
		this.view.preUpdate()
	}

	public destroy() {
		this.view.destroy()
	}
}
