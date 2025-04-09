import { Scene } from 'phaser'
import { PlayerAppearance } from '../services/MultiplayerService'
import { BasePlayer, Direction, PlayerState } from './BasePlayer'
import { PlayerMovedData, PlayerSourcedData } from '../../../backend/src/DataTypes'

export class MultiplayerPlayer extends BasePlayer {
	private playerId: string
	private lastUpdateTime: number = 0
	private targetX: number = 0
	private targetY: number = 0
	private readonly EXTRAPOLATION_TIME = 300 // 0.3 seconds in milliseconds
	private readonly MIN_POSITION_THRESHOLD = 0.1 // Minimum distance to consider positions different
	private messageText: Phaser.GameObjects.Text | null = null

	constructor(scene: Scene, x: number, y: number, playerId: string, appearance: PlayerAppearance) {
		super(scene, x, y, appearance)
		this.playerId = playerId
		this.targetX = x
		this.targetY = y
		this.lastUpdateTime = Date.now()
	}

	updateAppearance(newAppearance: PlayerAppearance): void {
		this.appearance = newAppearance
		// Logic to update the player's appearance
	}

	updatePositionFromServer(data: PlayerMovedData): void {
		const now = Date.now()
		const elapsed = now - this.lastUpdateTime

		// Calculate movement direction based on position change
		if (elapsed > 0) {
			const dx = data.x - this.container.x
			const dy = data.y - this.container.y
			
			// Only update direction if the movement is significant
			if (Math.abs(dx) > this.MIN_POSITION_THRESHOLD || Math.abs(dy) > this.MIN_POSITION_THRESHOLD) {
				// Determine primary direction of movement
				if (Math.abs(dx) > Math.abs(dy)) {
					// Horizontal movement is dominant
					if (dx > 0) {
						this.updateDirection(Direction.Right)
					} else {
						this.updateDirection(Direction.Left)
					}
				} else {
					// Vertical movement is dominant
					if (dy > 0) {
						this.updateDirection(Direction.Down)
					} else {
						this.updateDirection(Direction.Up)
					}
				}
			}
		}
		
		// Set target position to the server position
		this.targetX = data.x
		this.targetY = data.y
		this.lastUpdateTime = now
	}

	updatePosition(): void {
		const now = Date.now()
		const elapsed = now - this.lastUpdateTime
		
		// Check if we're already at the target position
		const isAtTarget = Math.abs(this.container.x - this.targetX) < this.MIN_POSITION_THRESHOLD && 
						  Math.abs(this.container.y - this.targetY) < this.MIN_POSITION_THRESHOLD

		if (!isAtTarget) {
			super.updatePosition(this.targetX, this.targetY)
			// 	this.updateState(PlayerState.Idle)
		}
	}

	getPlayerId(): string {
		return this.playerId
	}

	// Method to display a message above the player's character
	displayMessage(message: string) {
		if (this.messageText) {
			this.messageText.destroy()
		}

		this.messageText = this.scene.add.text(this.container.x, this.container.y - 50, message, {
			fontSize: '14px',
			color: '#ffffff',
			backgroundColor: 'rgba(0, 0, 0, 0.7)',
			padding: { x: 5, y: 3 },
			align: 'center'
		}).setOrigin(0.5)

		// Remove the message after 5 seconds
		this.scene.time.delayedCall(5000, () => {
			this.messageText?.destroy()
			this.messageText = null
		})
	}

	destroy(): void {
		this.container.destroy()
	}

	update(): void {
		this.updatePosition()
	}
} 