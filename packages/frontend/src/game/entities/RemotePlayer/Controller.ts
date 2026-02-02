import { PlayerView2 } from '../Player/View2'
import { Event } from '@rugged/game'
import { EventBus } from '../../EventBus'
import { Direction } from '../Player/View'
import { BasePlayerController } from '../Player/BaseController'
import type { GameScene } from '../../scenes/base/GameScene'

export class RemotePlayerController extends BasePlayerController {
	constructor(view: PlayerView2, scene: GameScene, playerId: string) {
		super(view, scene, playerId)
		EventBus.on(Event.Players.SC.Move, this.handlePlayerMoved, this)
	}

	protected shouldHandleEvent(data: { sourcePlayerId: string }): boolean {
		return data.sourcePlayerId === this.playerId
	}

	public handlePlayerMoved = (data: { sourcePlayerId: string; x: number; y: number }) => {
		if (!this.shouldHandleEvent(data)) return

		const dx = data.x - this.view.x
		const dy = data.y - this.view.y
		const threshold = 5

		if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
			let direction: Direction
			if (Math.abs(dx) > Math.abs(dy)) {
				direction = dx > 0 ? Direction.Right : Direction.Left
			} else {
				direction = dy > 0 ? Direction.Down : Direction.Up
			}
			this.view.updateDirection(direction)
		}

		this.view.updatePosition(data.x, data.y)
	}

	update(_deltaMs: number): void {
		void _deltaMs
		this.view.preUpdate()
		if (this.scene.textDisplayService) {
			this.scene.textDisplayService.updateEntityPosition(this.playerId, { x: this.view.x, y: this.view.y })
		}
	}

	public destroy(): void {
		super.destroy()
		EventBus.off(Event.Players.SC.Move, this.handlePlayerMoved, this)
		this.view.destroy()
	}
}
