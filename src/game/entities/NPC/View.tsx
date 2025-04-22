import { Scene, GameObjects, Physics } from 'phaser'
import { displayMessage, displaySystemMessage } from '../../utils/MessageDisplay'

export enum Direction {
	Down = 'down',
	Up = 'up',
	Left = 'left',
	Right = 'right'
}

export enum PlayerState {
	Idle = 'idle',
	Walking = 'walking'
}

export class NPCView extends GameObjects.Container {
	protected sprite: GameObjects.Sprite
	protected messageText: GameObjects.Text | null = null
	protected systemMessageText: GameObjects.Text | null = null
	protected direction: Direction = Direction.Down
	protected currentState: PlayerState = PlayerState.Idle
	protected speed: number
	protected targetPosition: { x: number, y: number } | null = null
	protected startPosition: { x: number, y: number } | null = null
	protected movementStartTime: number = 0
	protected movementDuration: number = 0

	constructor(scene: Scene, x: number = 0, y: number = 0, speed: number = 160) {
		super(scene, x, y)
		scene.add.existing(this)

		this.speed = speed

		// Create sprite for the player
		this.sprite = scene.add.sprite(0, 0, 'hasha')
		
		// Add sprite to container
		this.add(this.sprite)

		// Enable physics on the container
		scene.physics.add.existing(this)
		const physicsBody = this.body as Physics.Arcade.Body
		
		// Add a null check to prevent errors if the body is null
		if (physicsBody) {
			// Set a collision box for the bottom half of the character
			// The character sprite is 32x64 pixels (each frame)
			physicsBody.setSize(16, 4) // Width: half of the sprite width, Height: small portion of the sprite height
			physicsBody.setOffset(-8, 28) // Center horizontally, align to bottom
			// Make sure the player can't go out of bounds
			physicsBody.setCollideWorldBounds(true)

			// If this is an NPC, make it immovable
			physicsBody.setImmovable(true)
		} else {
			console.error('Player physics body is null. This might happen during scene transitions.')
		}

		// Set initial frame based on direction
		this.updateSpriteFrame()
	}

	/**
	 * Updates the sprite frame based on current direction
	 */
	protected updateSpriteFrame(): void {
		// The sprite sheet is 256x128 pixels
		// It contains 4 frames in a row (left to right)
		// Frame 0: Down
		// Frame 1: Up (was Left)
		// Frame 2: Right
		// Frame 3: Left (was Up)
		let frameIndex = 0
		
		switch (this.direction) {
			case Direction.Down:
				frameIndex = 0
				break
			case Direction.Left:
				frameIndex = 3
				break
			case Direction.Right:
				frameIndex = 2
				break
			case Direction.Up:
				frameIndex = 1
				break
		}
		
		this.sprite.setFrame(frameIndex)
	}

	/**
	 * Displays a message above the player
	 */
	public displayMessage(message: string): void {
		this.messageText = displayMessage({
			message,
			scene: this.scene,
			container: this,
			existingText: this.messageText
		})
	}

	/**
	 * Displays a system message above the player
	 */
	public displaySystemMessage(message: string | null): void {
		this.systemMessageText = displaySystemMessage({
			message,
			scene: this.scene,
			container: this,
			existingText: this.systemMessageText
		})
	}

	/**
	 * Sets collision with a tilemap layer
	 */
	public setCollisionWith(layer: Phaser.Tilemaps.TilemapLayer): void {
		this.scene.physics.add.collider(this, layer)
	}

	/**
	 * Sets the target position for movement
	 */
	public setTargetPosition(x: number, y: number): void {
		const currentX = this.x
		const currentY = this.y
		const dx = x - currentX
		const dy = y - currentY
		const distance = Math.sqrt(dx * dx + dy * dy)

		if (distance < 1) {
			// Already at target
			this.targetPosition = null
			this.startPosition = null
			this.currentState = PlayerState.Idle
			this.updateSpriteFrame()
			return
		}

		this.startPosition = { x: currentX, y: currentY }
		this.targetPosition = { x, y }
		this.movementStartTime = Date.now()
		this.movementDuration = (distance / this.speed) * 1000 // Convert to milliseconds
		this.currentState = PlayerState.Walking
		this.updateSpriteFrame()
	}

	/**
	 * Updates the player position
	 */
	public updatePosition(x: number, y: number): void {
		this.x = x
		this.y = y
		const physicsBody = this.body as Physics.Arcade.Body
		if (physicsBody) {
			physicsBody.reset(x, y)
		}
	}

	/**
	 * Called before the physics update
	 */
	public preUpdate(): void {
		if (!this.targetPosition || !this.startPosition) return

		const currentTime = Date.now()
		const elapsed = currentTime - this.movementStartTime
		const progress = Math.min(elapsed / this.movementDuration, 1)

		// Calculate new position using linear interpolation
		const newX = this.startPosition.x + (this.targetPosition.x - this.startPosition.x) * progress
		const newY = this.startPosition.y + (this.targetPosition.y - this.startPosition.y) * progress

		// Update container and physics body position
		this.updatePosition(newX, newY)

		// Update direction based on movement
		const dx = this.targetPosition.x - this.startPosition.x
		const dy = this.targetPosition.y - this.startPosition.y
		if (Math.abs(dx) > Math.abs(dy)) {
			this.updateDirection(dx > 0 ? Direction.Right : Direction.Left)
		} else {
			this.updateDirection(dy > 0 ? Direction.Down : Direction.Up)
		}
		this.updateSpriteFrame()

		// Check if movement is complete
		if (progress >= 1) {
			this.targetPosition = null
			this.startPosition = null
			this.currentState = PlayerState.Idle
			this.updateSpriteFrame()
		}
	}

	/**
	 * Updates the player direction
	 */
	public updateDirection(direction: Direction): void {
		if (this.direction !== direction) {
			this.direction = direction
			this.updateSpriteFrame()
		}
	}

	/**
	 * Updates the player state
	 */
	public updateState(state: PlayerState): void {
		if (this.currentState !== state) {
			this.currentState = state
			this.updateSpriteFrame()
		}
	}

	/**
	 * Preloads the player assets
	 */
	public static preload(scene: Scene): void {
		// Load the player sprite
		// The sprite sheet is 128x64 pixels
		// It contains 4 frames in a row (left to right), each 32x64 pixels
		scene.load.spritesheet('hasha', 'assets/characters/npc/hasha.png', {
			frameWidth: 32,
			frameHeight: 64
		})
	}
} 