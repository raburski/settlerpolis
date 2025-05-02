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
	private debug: boolean = false
	private debugGraphics: Phaser.GameObjects.Graphics
	private _overlapOnly: boolean = false

	constructor(scene: Scene, x: number = 0, y: number = 0, isNPC: boolean = false) {
		super(scene, x, y)
		scene.add.existing(this)

		// Create sprite for the player
		this.sprite = scene.add.sprite(0, 0, 'player-me')
		
		// Initialize debug graphics if debug mode is enabled
		if (this.debug) {
			this.debugGraphics = scene.add.graphics()
			this.debugGraphics.setDepth(10000) // Extreme depth to ensure it's always visible
		}
		
		// Add sprite to container
		this.add(this.sprite)

		// Enable physics on the container with arcade physics
		scene.physics.add.existing(this)
		const physicsBody = this.body as Physics.Arcade.Body
		
		// Add a null check to prevent errors if the body is null
		if (physicsBody) {
			// Set a collision box for the character that's reasonable for collisions
			physicsBody.setSize(20, 18) // Collision box dimensions
			physicsBody.setOffset(-10, 12) // Center horizontally, position near feet
			
			// Configure physics properties for movement and collision
			physicsBody.setCollideWorldBounds(true)
			
			// Critical settings for collision response
			physicsBody.setBounce(0) // No bounce on collision
			physicsBody.moves = true // Allow this body to move
			
			// Make container physics respond to collisions
			// These properties affect how the physics engine handles collisions
			this._overlapOnly = false
			physicsBody.onCollide = true // Enable collision callbacks
			physicsBody.checkCollision.none = false // Enable all collision directions
			physicsBody.checkCollision.up = true
			physicsBody.checkCollision.down = true
			physicsBody.checkCollision.left = true 
			physicsBody.checkCollision.right = true
			
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
		// Update container position
		const body = this.body as Phaser.Physics.Arcade.Body;
		if (body) {
			body.x = x
			body.y = y
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
		// Update depth based on current y position
		this.updateDepth()
		
		// Debug drawing the physics body
		this.updateDebugGraphics()
	}
	
	/**
	 * Update debug graphics to show the physics body
	 */
	private updateDebugGraphics(): void {
		// Only proceed if debug is enabled and graphics are initialized
		if (!this.debug || !this.debugGraphics) return
		
		const body = this.body as Physics.Arcade.Body
		if (!body) return
		
		this.debugGraphics.clear()
		
		// Draw the actual collision box in bright green with thicker line
		this.debugGraphics.lineStyle(3, 0x00ff00, 1)
		this.debugGraphics.strokeRect(
			body.x, 
			body.y, 
			body.width, 
			body.height
		)
		
		// Draw a fill with transparency to better visualize the collision area
		this.debugGraphics.fillStyle(0x00ff00, 0.2)
		this.debugGraphics.fillRect(
			body.x, 
			body.y, 
			body.width, 
			body.height
		)
		
		// Draw container position as a larger, more visible cross
		this.debugGraphics.lineStyle(2, 0xff0000, 1)
		this.debugGraphics.beginPath()
		this.debugGraphics.moveTo(this.x - 10, this.y)
		this.debugGraphics.lineTo(this.x + 10, this.y)
		this.debugGraphics.moveTo(this.x, this.y - 10)
		this.debugGraphics.lineTo(this.x, this.y + 10)
		this.debugGraphics.closePath()
		this.debugGraphics.strokePath()
		
		// Add a circle around the cross for better visibility
		this.debugGraphics.lineStyle(1, 0xff0000, 0.8)
		this.debugGraphics.strokeCircle(this.x, this.y, 8)
		
		// Draw lines to represent tile checking in each direction
		// (shows where our manual collision checks are happening)
		const checkDistance = 5 // Distance to check for collisions
		this.debugGraphics.lineStyle(1, 0xffff00, 0.8)
		
		// Left check
		this.debugGraphics.beginPath()
		this.debugGraphics.moveTo(body.x, body.y + body.height/2)
		this.debugGraphics.lineTo(body.x - checkDistance, body.y + body.height/2)
		this.debugGraphics.strokePath()
		
		// Right check
		this.debugGraphics.beginPath()
		this.debugGraphics.moveTo(body.x + body.width, body.y + body.height/2)
		this.debugGraphics.lineTo(body.x + body.width + checkDistance, body.y + body.height/2)
		this.debugGraphics.strokePath()
		
		// Up check
		this.debugGraphics.beginPath()
		this.debugGraphics.moveTo(body.x + body.width/2, body.y)
		this.debugGraphics.lineTo(body.x + body.width/2, body.y - checkDistance)
		this.debugGraphics.strokePath()
		
		// Down check
		this.debugGraphics.beginPath()
		this.debugGraphics.moveTo(body.x + body.width/2, body.y + body.height)
		this.debugGraphics.lineTo(body.x + body.width/2, body.y + body.height + checkDistance)
		this.debugGraphics.strokePath()
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
	 * Gets the current velocity of the player
	 */
	public getVelocity(): { x: number, y: number } {
		const body = this.body as Physics.Arcade.Body
		return {
			x: body?.velocity.x || 0,
			y: body?.velocity.y || 0
		}
	}

	/**
	 * Sets the velocity of the player
	 */
	public setVelocity(x: number, y: number): void {
		const body = this.body as Physics.Arcade.Body
		if (body) {
			body.setVelocity(x, y)
		}
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