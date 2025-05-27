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
	private debug: boolean = false // Enable debug output
	private isInDialogue: boolean = false

	constructor(
		view: PlayerViewType,
		scene: Scene,
		playerId: string
	) {
		super(view, scene, playerId)
		this.keyboard = new Keyboard(scene)
		this.setupDialogueHandlers()
	}

	private setupDialogueHandlers() {
		const handleDialogueTrigger = () => {
			this.isInDialogue = true
		}

		const handleDialogueEnd = () => {
			this.isInDialogue = false
		}

		EventBus.on(Event.Dialogue.SC.Trigger, handleDialogueTrigger)
		EventBus.on(Event.Dialogue.SC.End, handleDialogueEnd)

		// Clean up event listeners when controller is destroyed
		this.destroy = () => {
			super.destroy()
			EventBus.off(Event.Dialogue.SC.Trigger, handleDialogueTrigger)
			EventBus.off(Event.Dialogue.SC.End, handleDialogueEnd)
			if (this.keyboard) {
				this.keyboard.destroy()
			}
		}
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

		// Update text display service with current position
		if (this.scene.textDisplayService) {
			this.scene.textDisplayService.updateEntityPosition(this.playerId, { x: this.view.x, y: this.view.y })
		}
	}

	private updateLocalPosition() {
		const body = this.view.body as Physics.Arcade.Body
		
		// Add a null check to prevent errors if the body is null
		if (!body) return
		
		// Reset velocity
		body.setVelocity(0, 0)
		
		// If in dialogue, don't process movement
		if (this.isInDialogue) {
			this.view.updateState(PlayerState.Idle)
			return
		}
		
		const speed = this.view.speed

		// Get input and update player state
		if (this.keyboard.isMovingLeft()) {
			body.setVelocityX(-speed)
			this.view.updateDirection(Direction.Left)
			this.view.updateState(PlayerState.Walking)
		} else if (this.keyboard.isMovingRight()) {
			body.setVelocityX(speed)
			this.view.updateDirection(Direction.Right)
			this.view.updateState(PlayerState.Walking)
		}

		if (this.keyboard.isMovingUp()) {
			body.setVelocityY(-speed)
			this.view.updateDirection(Direction.Up)
			this.view.updateState(PlayerState.Walking)
		} else if (this.keyboard.isMovingDown()) {
			body.setVelocityY(speed)
			this.view.updateDirection(Direction.Down)
			this.view.updateState(PlayerState.Walking)
		}

		// If no movement keys are pressed, set state to idle
		if (!this.keyboard.isAnyMovementKeyPressed()) {
			this.view.updateState(PlayerState.Idle)
		}
		
		// Check if we're blocked by collision and update state accordingly
		if (body.blocked.up || body.blocked.down || body.blocked.left || body.blocked.right) {
			if (this.debug) {
				console.log('Built-in physics detecting blocked:', {
					up: body.blocked.up,
					down: body.blocked.down,
					left: body.blocked.left,
					right: body.blocked.right,
					position: { x: body.x, y: body.y },
					velocity: { x: body.velocity.x, y: body.velocity.y }
				})
			}
			
			// If we're blocked, set player to idle state
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
} 