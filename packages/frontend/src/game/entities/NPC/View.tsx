import { Scene, GameObjects, Physics } from 'phaser'
import { npcAssetsService } from '../../services/NPCAssetsService'
import { NPCAssets, Direction, isHorizontalDirection, getMirroredDirection, isDirectionalAnimation } from '@rugged/game'
import { GameScene } from '../../scenes/base/GameScene'

export enum PlayerState {
	Idle = 'idle',
	Walking = 'walking'
}

export class NPCView extends GameObjects.Container {
	protected sprite: GameObjects.Sprite | null = null
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
	private debug: boolean = false
	private debugGraphics: Phaser.GameObjects.Graphics

	constructor(scene: GameScene, x: number = 0, y: number = 0, speed: number = 160, npcId: string) {
		super(scene, x, y)
		scene.add.existing(this)

		this.speed = speed
		this.npcId = npcId

		// Initialize debug graphics if debug mode is enabled
		if (this.debug) {
			this.debugGraphics = scene.add.graphics()
			this.debugGraphics.setDepth(10000) // Extreme depth to ensure it's always visible
		}

		// Enable physics on the container
		scene.physics.add.existing(this)

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

		// Set up physics body based on frame size
		const physicsBody = this.body as Physics.Arcade.Body
		const { frameWidth, frameHeight } = this.assets
		if (physicsBody && frameWidth && frameHeight) {
			physicsBody.setSize(frameWidth/2, frameHeight/4)
			physicsBody.setOffset(-frameWidth/4, frameHeight/4)
			physicsBody.setCollideWorldBounds(true)
			physicsBody.setImmovable(true)
		}

		// Offset sprite vertically if it's taller than a tile (32px)
		if (frameHeight > 32) {
			const verticalOffset = -(frameHeight - 32)/2
			// Move sprite up
			this.sprite.setY(verticalOffset)
			// Move physics body up by the same amount
			if (physicsBody) {
				physicsBody.setOffset(physicsBody.offset.x, physicsBody.offset.y + verticalOffset)
			}
		}

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
		if (!this.assets) return { animationKey: '' }

		const animation = this.assets.animations[this.currentState.toLowerCase()]
		if (!animation) {
			// If animation doesn't exist, use idle animation as fallback
			const fallbackAnimation = this.assets.animations['idle']
			if (!fallbackAnimation) {
				return { animationKey: 'npc-placeholder-idle-down' }
			}
			return { animationKey: `npc-${this.npcId}-idle-${this.lastHorizontalDirection}` }
		}

		// If animation has specific directions
		if (isDirectionalAnimation(animation)) {
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

		// Update sprite if animation changed
		if (this.currentAnimation !== animationKey) {
			this.currentAnimation = animationKey
			this.sprite.play(animationKey)
		}

		// Update flip
		this.sprite.setFlip(flipX, flipY)
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

		// Update text display service with current position
		if (this.scene.textDisplayService) {
			this.scene.textDisplayService.updateEntityPosition(this.npcId, { x: this.x, y: this.y })
		}

		// Debug drawing the physics body
		this.updateDebugGraphics()
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

		// Debug logs for sprite and assets
		console.log('Debug Graphics State:', {
			hasSprite: !!this.sprite,
			spritePosition: this.sprite ? { x: this.sprite.x, y: this.sprite.y } : null,
			hasAssets: !!this.assets,
			frameSize: this.assets ? { width: this.assets.frameWidth, height: this.assets.frameHeight } : null,
			npcId: this.npcId
		})

		// Draw sprite bounds if sprite exists
		if (this.sprite) {
			this.debugGraphics.lineStyle(2, 0x0000ff, 1)
			this.debugGraphics.strokeRect(
				this.sprite.x - this.sprite.width/2,
				this.sprite.y - this.sprite.height/2,
				this.sprite.width,
				this.sprite.height
			)
		}

		// Draw whole sprite border using asset frame size (orange)
		if (this.assets && this.sprite) {
			const { frameWidth, frameHeight } = this.assets
			console.log('Drawing orange border with dimensions:', { frameWidth, frameHeight })
			
			// Draw debug points at the corners where we're drawing the border
			this.debugGraphics.fillStyle(0xff0000, 1)
			const corners = [
				{ x: this.sprite.x - frameWidth/2, y: this.sprite.y - frameHeight/2 },
				{ x: this.sprite.x + frameWidth/2, y: this.sprite.y - frameHeight/2 },
				{ x: this.sprite.x - frameWidth/2, y: this.sprite.y + frameHeight/2 },
				{ x: this.sprite.x + frameWidth/2, y: this.sprite.y + frameHeight/2 }
			]
			corners.forEach(corner => {
				this.debugGraphics.fillCircle(corner.x, corner.y, 3)
			})

			// Draw the border with thicker, more opaque lines
			this.debugGraphics.lineStyle(4, 0xffa500, 0.8) // orange, thicker, more opaque
			this.debugGraphics.strokeRect(
				this.sprite.x - frameWidth/2,
				this.sprite.y - frameHeight/2,
				frameWidth,
				frameHeight
			)

			// Draw a center point for the sprite
			this.debugGraphics.fillStyle(0x00ff00, 1)
			this.debugGraphics.fillCircle(this.sprite.x, this.sprite.y, 4)
		}
	}
} 