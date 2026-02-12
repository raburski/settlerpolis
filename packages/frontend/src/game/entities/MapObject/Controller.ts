import { MapObjectView } from './View'
import type { MapObject } from '@rugged/game'
import { EventBus } from '../../EventBus'
import { Event, PICKUP_RANGE } from '@rugged/game'
import { playerService } from '../../services/PlayerService'
import type { GameScene } from '../../scenes/base/GameScene'
import { shouldIgnoreKeyboardEvent } from '../../utils/inputGuards'

export class MapObjectController {
	private view: MapObjectView
	private mapObject: MapObject
	private isInteractable: boolean = false
	private boundKeyDown: (event: KeyboardEvent) => void

	constructor(private scene: GameScene, view: MapObjectView, mapObject: MapObject) {
		this.view = view
		this.mapObject = mapObject
		this.boundKeyDown = (event) => {
			if (shouldIgnoreKeyboardEvent(event)) {
				return
			}
			if (event.code === 'KeyE') {
				this.handleInteraction()
			}
		}
		this.setupInteraction()
	}

	private setupInteraction(): void {
		const playerId = playerService.playerId
		if (playerId === this.mapObject.playerId) {
			this.isInteractable = true
			window.addEventListener('keydown', this.boundKeyDown)
		}
	}

	private handleInteraction = (): void => {
		if (!this.isInteractable) return
		const player = this.scene.player
		if (!player) return
		const distance = Math.hypot(player.view.x - this.view.x, player.view.y - this.view.y)
		if (distance <= PICKUP_RANGE) {
			EventBus.emit(Event.MapObjects.CS.Remove, { objectId: this.mapObject.id })
		}
	}

	public update(_deltaMs: number): void {
		void _deltaMs
		this.view.update()
	}

	public destroy(): void {
		if (this.isInteractable) {
			window.removeEventListener('keydown', this.boundKeyDown)
		}
		this.view.destroy()
	}
}
