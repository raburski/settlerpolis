import { Scene, Physics } from 'phaser'
import { Direction, PlayerState, PlayerView } from '../Player/View2'
import { PlayerView2 } from '../Player/View2'
import { BasePlayerController } from '../Player/BaseController'
import { Keyboard } from '../../modules/Keyboard'
import { Event } from "@rugged/game"
import { EventBus } from "../../EventBus"

// Define a union type for both view classes
type PlayerViewType = PlayerView | PlayerView2

export class LocalPlayerController extends BasePlayerController {
	private keyboard: Keyboard
	protected lastPositionUpdate: { x: number, y: number } | null = null
	protected lastPositionUpdateTime: number = 0
	protected readonly POSITION_UPDATE_THROTTLE = 50 // 50ms

	constructor(
		view: PlayerViewType,
		scene: Scene,
		playerId: string
	) {
		super(view, scene, playerId)
		this.keyboard = new Keyboard(scene)
	}

	/**
	 * Local player should handle events where the source player ID matches this player's ID
	 */
	protected shouldHandleEvent(data: { sourcePlayerId: string }): boolean {
		return !data.sourcePlayerId || data.sourcePlayerId === this.playerId
	}

	update(): void {
		this.updateLocalPosition()
		this.updateServerPosition()
		this.view.preUpdate()
		this.updateEquippedItemPosition()
	}

	private updateLocalPosition() {
		const body = this.view.body as Physics.Arcade.Body
		
		// Add a null check to prevent errors if the body is null
		if (!body) {
			console.error('Player physics body is null in update method. This might happen during scene transitions.')
			return
		}
		
		body.setVelocity(0)

		// Check for left movement
		if (this.keyboard.isMovingLeft()) {
			body.setVelocityX(-this.view.speed)
			this.view.updateDirection(Direction.Left)
			this.view.updateState(PlayerState.Walking)
		} 
		// Check for right movement
		else if (this.keyboard.isMovingRight()) {
			body.setVelocityX(this.view.speed)
			this.view.updateDirection(Direction.Right)
			this.view.updateState(PlayerState.Walking)
		}

		// Check for up movement
		if (this.keyboard.isMovingUp()) {
			body.setVelocityY(-this.view.speed)
			this.view.updateDirection(Direction.Up)
			this.view.updateState(PlayerState.Walking)
		} 
		// Check for down movement
		else if (this.keyboard.isMovingDown()) {
			body.setVelocityY(this.view.speed)
			this.view.updateDirection(Direction.Down)
			this.view.updateState(PlayerState.Walking)
		}

		// If no movement keys are pressed, set state to idle
		if (!this.keyboard.isAnyMovementKeyPressed()) {
			this.view.updateState(PlayerState.Idle)
		}
	}

	private updateServerPosition() {
		const currentPosition = { x: this.view.x, y: this.view.y }
		const now = Date.now()

		// Check if the player has moved and enough time has passed since the last update
		const hasMoved = !this.lastPositionUpdate || 
			(currentPosition.x !== this.lastPositionUpdate.x || 
			currentPosition.y !== this.lastPositionUpdate.y)
		
		const timeSinceLastUpdate = now - this.lastPositionUpdateTime

		if (hasMoved && timeSinceLastUpdate >= this.POSITION_UPDATE_THROTTLE) {
			// Always send the current scene key with position updates
			EventBus.emit(Event.Players.CS.Move, currentPosition)
			this.lastPositionUpdate = currentPosition
			this.lastPositionUpdateTime = now
		}
	}

	public destroy(): void {
		super.destroy()
		if (this.keyboard) {
			this.keyboard.destroy()
		}
	}
} 