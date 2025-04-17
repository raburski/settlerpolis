import { Scene, GameObjects, Physics } from 'phaser'
import { displayMessage, displaySystemMessage, displayEmoji } from '../../utils/MessageDisplay'

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

export class PlayerView2 extends GameObjects.Container {
	protected sprite: GameObjects.Sprite
	protected messageText: GameObjects.Text | null = null
	protected systemMessageText: GameObjects.Text | null = null
	protected direction: Direction = Direction.Down
	protected currentState: PlayerState = PlayerState.Idle
	protected speed: number = 160 // Default speed in pixels per second

	constructor(scene: Scene, x: number = 0, y: number = 0, isNPC: boolean = false) {
		super(scene, x, y)
		scene.add.existing(this)

		// Create sprite for the player
		this.sprite = scene.add.sprite(0, 0, 'player-me')
		
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
			if (isNPC) {
				physicsBody.setImmovable(true)
			}
		} else {
			console.error('Player physics body is null. This might happen during scene transitions.')
		}

		// Set initial frame based on direction
		this.updateSpriteFrame()
		
		// Set initial depth based on y position
		this.setDepth(y)
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
	 * Displays an emoji above the player
	 */
	public displayEmoji(emoji: string): void {
		this.messageText = displayEmoji({
			message: emoji,
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
	 * Updates the player position
	 */
	public updatePosition(x: number, y: number): void {
		this.x = x
		this.y = y
		// Update depth based on y position
		this.setDepth(y)
	}

	/**
	 * Called before the physics update
	 */
	public preUpdate(): void {
		// This method is called by the controller before the physics update
		// Update depth based on current y position
		this.setDepth(this.y)
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
		this.currentState = state
	}

	/**
	 * Preloads the player assets
	 */
	public static preload(scene: Scene): void {
		// Load the player sprite
		// The sprite sheet is 128x64 pixels
		// It contains 4 frames in a row (left to right), each 32x64 pixels
		scene.load.spritesheet('player-me', 'assets/characters/player/me.png', {
			frameWidth: 32,
			frameHeight: 64
		})
	}
} 