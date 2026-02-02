import { PlayerState } from '../Player/View'
import { PlayerView2 } from '../Player/View2'
import { BasePlayerController } from '../Player/BaseController'
import { Event } from '@rugged/game'
import { EventBus } from '../../EventBus'
import type { GameScene } from '../../scenes/base/GameScene'

export class LocalPlayerController extends BasePlayerController {
	protected lastPositionUpdate: { x: number; y: number } | null = null
	protected lastPositionUpdateTime: number = 0
	protected readonly POSITION_UPDATE_THROTTLE = 50

	constructor(view: PlayerView2, scene: GameScene, playerId: string) {
		super(view, scene, playerId)
	}

	protected shouldHandleEvent(data: { sourcePlayerId: string }): boolean {
		return !data.sourcePlayerId || data.sourcePlayerId === this.playerId
	}

	update(_deltaMs: number): void {
		void _deltaMs
		this.updateLocalPosition()
		this.updateServerPosition()
		this.view.preUpdate()
		this.updateEquippedItemPosition()

		if (this.scene.textDisplayService) {
			this.scene.textDisplayService.updateEntityPosition(this.playerId, { x: this.view.x, y: this.view.y })
		}
	}

	private updateLocalPosition() {
		const body = this.view.body
		if (!body) return

		body.setVelocity(0, 0)
		this.view.updateState(PlayerState.Idle)
	}

	private updateServerPosition() {
		const currentPosition = { x: this.view.x, y: this.view.y }
		const now = Date.now()

		const hasMoved =
			!this.lastPositionUpdate ||
			currentPosition.x !== this.lastPositionUpdate.x ||
			currentPosition.y !== this.lastPositionUpdate.y

		const timeSinceLastUpdate = now - this.lastPositionUpdateTime

		if (hasMoved && timeSinceLastUpdate >= this.POSITION_UPDATE_THROTTLE) {
			EventBus.emit(Event.Players.CS.Move, currentPosition)
			this.lastPositionUpdate = currentPosition
			this.lastPositionUpdateTime = now
		}
	}
}
