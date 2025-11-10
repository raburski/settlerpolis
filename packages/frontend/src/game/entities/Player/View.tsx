import { Scene, GameObjects, Physics } from 'phaser'
import { Direction, PlayerState } from '@rugged/game'
import { GameScene } from '../../scenes/base/GameScene'

export class PlayerView extends GameObjects.Container {
	protected sprite: GameObjects.Sprite
	protected direction: Direction = Direction.Down
	protected currentState: PlayerState = PlayerState.Idle
	protected speed: number = 160 // Default speed in pixels per second

	constructor(scene: GameScene, x: number = 0, y: number = 0, isNPC: boolean = false) {
		super(scene, x, y)
		scene.add.existing(this)

		// Create sprite for the player
		this.sprite = scene.add.sprite(0, 0, 'player-me2')
		this.sprite.setScale(0.5)
		// Add sprite to container
		this.add(this.sprite)

		// Enable physics on the container
		scene.physics.add.existing(this)
		const physicsBody = this.body as Physics.Arcade.Body
		
		// Add a null check to prevent errors if the body is null
		if (physicsBody) {
			// Set a collision box for the bottom half of the character
			// The character sprite is 32x64 pixels (each frame)
			physicsBody.setSize(32, 4) // Width: half of the sprite width, Height: small portion of the sprite height
			physicsBody.setOffset(-16, 28) // Center horizontally, align to bottom
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
	}

	/**
	 * Updates the sprite frame based on current direction and state
	 */
	protected updateSpriteFrame(): void {
		if (!this.sprite) return

		// Get animation key based on state and direction
		const animationKey = `player-${this.currentState.toLowerCase()}-${this.direction.toLowerCase()}`
		
		// Update sprite if animation changed
		if (this.sprite.anims.currentAnim?.key !== animationKey) {
			this.sprite.play(animationKey)
		}
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
		
		// Update depth based on y position
		this.updateDepth()
	}

	/**
	 * Updates the depth of the player to ensure proper rendering order
	 */
	private updateDepth(): void {
		// Player depth is 100 (base) + y-position (for sorting)
		// This ensures players standing lower on the screen appear in front
		const PLAYER_BASE_DEPTH = 100
		this.setDepth(PLAYER_BASE_DEPTH + this.y * 0.1)
	}

	/**
	 * Called before the physics update
	 */
	public preUpdate(): void {
		// Update depth in case y position changed
		this.updateDepth()
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
		scene.load.spritesheet('player-me2', 'assets/characters/player/me2.png', {
			frameWidth: 32,
			frameHeight: 64
		})
	}
} 