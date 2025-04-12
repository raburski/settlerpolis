import { Scene, Physics } from 'phaser'
import { Direction, PlayerState, PlayerView } from './View'
import { Keyboard } from '../../modules/Keyboard'
import { Event } from "../../../../backend/src/events"
import { EventBus } from "../../EventBus"

export class PlayerController {
	private keyboard: Keyboard

    protected lastPositionUpdate: { x: number, y: number } | null = null
	protected lastPositionUpdateTime: number = 0
	protected readonly POSITION_UPDATE_THROTTLE = 100 // 100ms

	constructor(
		private view: PlayerView,
		private scene: Scene,
		public playerId: string,
	) {
		this.keyboard = new Keyboard(scene)
		// Subscribe to chat messages
		EventBus.on(Event.Chat.SC.Receive, this.handleChatMessage, this)
	}

	private handleChatMessage = (data: { sourcePlayerId: string, message: string }) => {
		// Only show message if it's from our player
		if (data.playerId === this.playerId) {
			this.view.displayMessage(data.message)
		}
	}

	update(): void {
        this.updateLocalPosition()
        this.updateServerPosition()
        this.view.preUpdate()
	}

    updateLocalPosition() {
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

    updateServerPosition() {
        // Update multiplayer players
        // this.multiplayerPlayers.forEach(player => {
        // 	player.update()
        // })

        // Update player position in multiplayer service

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
		EventBus.off(Event.Chat.SC.Receive, this.handleChatMessage, this)
		if (this.keyboard) {
			this.keyboard.destroy()
		}
	}
}