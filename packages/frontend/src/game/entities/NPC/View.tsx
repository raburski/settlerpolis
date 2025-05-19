import { Scene, GameObjects, Physics } from 'phaser'
import { displayMessage, displaySystemMessage, displayEmoji } from '../../utils/MessageDisplay'
import { npcAssetsService } from '../../services/NPCAssetsService'
import { NPCAssets, Direction } from '@rugged/game'

export enum PlayerState {
	Idle = 'idle',
	Walking = 'walking'
}

function isHorizontalDirection(direction) {
	return direction === Direction.Left || direction === Direction.Right
}

function getMirroredDirection(direction) {
	switch (direction) {
		case Direction.Down: return Direction.Up
		case Direction.Left: return Direction.Right
		case Direction.Right: return Direction.Left
		case Direction.Up: return Direction.Down
	}
}

export class NPCView extends GameObjects.Container {
	protected sprite: GameObjects.Sprite | null = null
	protected messageText: GameObjects.Text | null = null
	protected systemMessageText: GameObjects.Text | null = null
	protected direction: Direction = Direction.Down
	protected currentState: PlayerState = PlayerState.Idle
	protected speed: number
	protected targetPosition: { x: number, y: number } | null = null
	protected startPosition: { x: number, y: number } | null = null
	protected movementStartTime: number = 0
	protected movementDuration: number = 0
	protected npcId: string
	protected assets: NPCAssets | null = null
	protected currentAnimation: string | null = null
	protected lastHorizontalDirection: Direction = Direction.Right

	constructor(scene: Scene, x: number = 0, y: number = 0, speed: number = 160, npcId: string) {
		super(scene, x, y)
		scene.add.existing(this)

		this.speed = speed
		this.npcId = npcId

		// Enable physics on the container
		scene.physics.add.existing(this)
		const physicsBody = this.body as Physics.Arcade.Body
		
		// Add a null check to prevent errors if the body is null
		if (physicsBody) {
			// Set a collision box for the bottom half of the character
			physicsBody.setSize(16, 4) // Width: half of the sprite width, Height: small portion of the sprite height
			physicsBody.setOffset(-8, 28) // Center horizontally, align to bottom
			// Make sure the player can't go out of bounds
			physicsBody.setCollideWorldBounds(true)

			// Make it immovable
			physicsBody.setImmovable(true)
		} else {
			console.error('NPC physics body is null. This might happen during scene transitions.')
		}

		// Load NPC assets
		this.loadAssets()
	}

	private async loadAssets() {
		try {
			this.assets = await npcAssetsService.loadNPCAssets(this.scene, this.npcId)
			this.setupSprite()
		} catch (error) {
			console.error(`Failed to load assets for NPC ${this.npcId}:`, error)
		}
	}

	private setupSprite() {
		if (!this.assets) return

		// Create sprite for the NPC
		this.sprite = this.scene.add.sprite(0, 0, `npc-spritesheet-${this.npcId}`)
		
		// Add sprite to container
		this.add(this.sprite)

		// Set initial frame based on direction
		this.updateSpriteFrame()
	}

	/**
	 * Type guard to check if animation is directional
	 */
	protected isDirectionalAnimation(animation: DirectionalAnimations | NPCAnimation | undefined): animation is DirectionalAnimations {
		if (!animation) return false
		return 'down' in animation || 'up' in animation || 'left' in animation || 'right' in animation
	}

	/**
	 * Gets the appropriate animation key based on current state and direction
	 */
	protected getAnimationKey(): { animationKey: string, flipX?: boolean, flipY?: boolean } {
		if (!this.assets) return ''

		const animation = this.assets.animations[this.currentState.toLowerCase()]
		if (!animation) {
			// If animation doesn't exist, use idle animation as fallback
			const fallbackAnimation = this.assets.animations['idle']
			if (!fallbackAnimation) {
				return { animation: 'npc-placeholder-idle-down' }
			}
			return { animationKey: `npc-${this.npcId}-idle-${this.lastHorizontalDirection}` }
		}

		// If animation has specific directions
		if (this.isDirectionalAnimation(animation)) {
			// Check if we have a specific animation for this direction
			if (animation[this.direction]) {
				return { animationKey: `npc-${this.npcId}-${this.currentState.toLowerCase()}-${this.direction}` }
			}

			// If no specific direction animation, check if we have horizontal animations
			if (animation[Direction.Right] || animation[Direction.Left]) {
				// For vertical movements or missing horizontal direction, use last horizontal direction
				const finalHorizontalDirection = this.direction === Direction.Left || this.direction === Direction.Right 
					? this.direction 
					: this.lastHorizontalDirection
				
				const horizontalDirection = animation[finalHorizontalDirection] ? finalHorizontalDirection : getMirroredDirection(finalHorizontalDirection)
				const flipX = animation[finalHorizontalDirection] ? false : true
				const flipY = false // not supporting this yet
				
				return { animationKey: `npc-${this.npcId}-${this.currentState.toLowerCase()}-${horizontalDirection}`, flipX, flipY }
			}
		}

		// Single animation for all directions - use last horizontal direction
		return { animationKey: `npc-${this.npcId}-${this.currentState.toLowerCase()}` }
	}

	/**
	 * Updates the sprite frame based on current direction and state
	 */
	protected updateSpriteFrame(): void {
		if (!this.sprite || !this.assets) return

		console.log('updateSpriteFrame state', this.currentState)

		// Get animation key and flip configuration
		const { animationKey, flipX, flipY } = this.getAnimationKey()
		// const { flipX, flipY } = npcAssetsService.getFlipConfig(this.direction, this.npcId)

		// Update sprite if animation changed
		if (this.currentAnimation !== animationKey) {
			this.currentAnimation = animationKey
			this.sprite.play(animationKey)
		}

		// Update flip
		this.sprite.setFlip(flipX, flipY)
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
			this.updateState(PlayerState.Idle)
			return
		}

		this.startPosition = { x: currentX, y: currentY }
		this.targetPosition = { x, y }
		this.movementStartTime = Date.now()
		this.movementDuration = (distance / this.speed) * 1000 // Convert to milliseconds
		this.updateState(PlayerState.Walking)
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
	 * Updates the depth of the NPC to ensure proper rendering order
	 */
	private updateDepth(): void {
		// NPC depth is 100 (base) + y-position (for sorting)
		// This ensures NPCs standing lower on the screen appear in front
		const NPC_BASE_DEPTH = 100
		this.setDepth(NPC_BASE_DEPTH + this.y * 0.1)
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
			const newDirection = dx > 0 ? Direction.Right : Direction.Left
			this.updateDirection(newDirection)
			// Store last horizontal direction when moving horizontally
			this.lastHorizontalDirection = newDirection
		} else {
			const newDirection = dy > 0 ? Direction.Down : Direction.Up
			this.updateDirection(newDirection)
		}

		// Check if movement is complete
		if (progress >= 1) {
			this.targetPosition = null
			this.startPosition = null
			this.updateState(PlayerState.Idle)
		} else {
			this.updateState(PlayerState.Walking)
		}
		
		// Update depth in case y position changed
		this.updateDepth()
	}

	/**
	 * Updates the player direction
	 */
	public updateDirection(direction: Direction): void {
		if (this.direction !== direction) {
			if (!isHorizontalDirection(direction) && isHorizontalDirection(this.direction)) {
				this.lastHorizontalDirection = this.direction
			}
			this.direction = direction
			this.updateSpriteFrame()
		}
	}

	/**
	 * Updates the player state
	 */
	public updateState(state: PlayerState): void {
		if (this.currentState !== state) {
			// Store the current direction before state change
			const previousDirection = this.direction
			this.currentState = state
			this.updateSpriteFrame()
		}
	}

	/**
	 * Preloads the NPC assets
	 */
	public static preload(scene: Scene, npcId: string): void {
		npcAssetsService.loadNPCAssets(scene, npcId)
	}
} 