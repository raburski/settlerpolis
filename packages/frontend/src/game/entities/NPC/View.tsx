import { Scene, GameObjects, Physics } from 'phaser'
import { npcAssetsService } from '../../services/NPCAssetsService'
import { NPCAssets, Direction, isHorizontalDirection, getMirroredDirection, isDirectionalAnimation } from '@rugged/game'
import { GameScene } from '../../scenes/base/GameScene'
import { tutorialService, TutorialFlag } from '../../services/TutorialService'
import { BaseMovementView } from '../Movement/BaseMovementView'

export enum PlayerState {
	Idle = 'idle',
	Walking = 'walking'
}

export class NPCView extends BaseMovementView {
	protected sprite: GameObjects.Sprite | null = null
	protected highlightSprite: GameObjects.Sprite | null = null
	protected direction: Direction = Direction.Down
	protected currentState: PlayerState = PlayerState.Idle
	protected npcId: string
	protected assets: NPCAssets | null = null
	protected currentAnimation: string | null = null
	protected lastHorizontalDirection: Direction = Direction.Right
	private debug: boolean = false
	private debugGraphics: Phaser.GameObjects.Graphics
	private isHighlighted: boolean = false
	private interactable: boolean = false

	constructor(scene: GameScene, x: number = 0, y: number = 0, speed: number = 160, npcId: string, interactable: boolean = false) {
		super(scene, x, y, speed)
		
		this.baseDepth = 100 // NPC base depth
		this.npcId = npcId
		this.interactable = interactable

		// Initialize debug graphics if debug mode is enabled
		if (this.debug) {
			this.debugGraphics = scene.add.graphics()
			this.debugGraphics.setDepth(10000) // Extreme depth to ensure it's always visible
		}

		// Enable physics on the container
		scene.physics.add.existing(this)

		// Setup visuals AFTER all properties are initialized
		// For NPCs, setupVisuals() is empty - actual setup happens in setupSprite() after assets load
		this.setupVisuals()

		// Load NPC assets (async - will call setupSprite when loaded)
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

	protected setupVisuals(): void {
		// Setup visuals is called by BaseMovementView constructor
		// But NPC assets load asynchronously, so we'll set up the sprite in setupSprite()
		// which is called after assets load. For now, just initialize state.
		// The actual sprite setup happens in setupSprite() after assets are loaded
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

	protected updateVisuals(direction: Direction, state: 'idle' | 'moving'): void {
		// Update direction
		if (this.direction !== direction) {
			if (!isHorizontalDirection(direction) && isHorizontalDirection(this.direction)) {
				this.lastHorizontalDirection = this.direction
			}
			this.direction = direction
		}

		// Update state (map 'idle'|'moving' to PlayerState)
		const newState = state === 'moving' ? PlayerState.Walking : PlayerState.Idle
		if (this.currentState !== newState) {
			this.currentState = newState
		}

		// Update sprite frame/animation based on direction and state
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
	 * Override updatePosition to support both Position object and x,y parameters
	 */
	public updatePosition(xOrPosition: number | { x: number, y: number }, y?: number): void {
		if (typeof xOrPosition === 'object') {
			super.updatePosition(xOrPosition.x, xOrPosition.y)
			// Update text display service with new position
			if (this.scene.textDisplayService) {
				this.scene.textDisplayService.updateEntityPosition(this.npcId, xOrPosition)
			}
		} else {
			super.updatePosition(xOrPosition, y!)
			// Update text display service with new position
			if (this.scene.textDisplayService) {
				this.scene.textDisplayService.updateEntityPosition(this.npcId, { x: xOrPosition, y: y! })
			}
		}
	}

	/**
	 * Override preUpdate to add NPC-specific updates
	 */
	public preUpdate(): void {
		// Call parent preUpdate (handles movement interpolation and calls updateVisuals)
		super.preUpdate()
		// Additional NPC-specific updates
		// Update text display service with current position (for moving text bubbles)
		if (this.scene.textDisplayService) {
			this.scene.textDisplayService.updateEntityPosition(this.npcId, { x: this.x, y: this.y })
		}
		// Debug drawing the physics body
		this.updateDebugGraphics()
	}

	/**
	 * Updates the NPC direction (legacy method, now handled by updateVisuals)
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
	 * Updates the NPC state (PlayerState, not movement state)
	 */
	public updateState(state: PlayerState): void {
		if (this.currentState !== state) {
			this.currentState = state
			this.updateSpriteFrame()
		}
	}

	/**
	 * Override onDirectionChange to update sprite frame
	 */
	protected onDirectionChange(direction: Direction): void {
		if (!isHorizontalDirection(direction) && isHorizontalDirection(this.direction)) {
			this.lastHorizontalDirection = this.direction
		}
		// Sprite frame will be updated in updateVisuals
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

	public setHighlighted(highlighted: boolean) {
		// Only allow highlighting if NPC is interactable
		if (!this.interactable) {
			if (this.highlightSprite) {
				this.highlightSprite.setVisible(false)
			}
			return
		}

		if (this.isHighlighted === highlighted) return
		this.isHighlighted = highlighted

		if (highlighted) {
			const outlineKey = npcAssetsService.getOutlineTextureKey(this.npcId)
			if (!outlineKey || !this.sprite) return

			// Create highlight sprite if it doesn't exist
			if (!this.highlightSprite) {
				this.highlightSprite = this.scene.add.sprite(0, 0, outlineKey)
				this.highlightSprite.setDepth(this.depth + 1) // Just above the NPC
				this.add(this.highlightSprite)
			}

			// Position highlight sprite to match the main sprite
			if (this.sprite) {
				this.highlightSprite.setPosition(this.sprite.x, this.sprite.y)
				this.highlightSprite.setVisible(true)
			}
		} else if (this.highlightSprite) {
			this.highlightSprite.setVisible(false)
		}

		// Show tutorial tooltip if NPC is interactable, highlighted, and tutorial not completed
		if (highlighted && this.interactable && !tutorialService.hasCompleted(TutorialFlag.NPCInteract)) {
			if (this.scene.textDisplayService && this.sprite && this.assets) {
				const spriteHeight = this.assets.frameHeight || this.sprite.height
				const verticalOffset = spriteHeight + 16 // Half of sprite height plus some padding
				
				this.scene.textDisplayService.displayMessage({
					message: 'Press E to interact',
					worldPosition: { x: this.x, y: this.y + verticalOffset },
					fontSize: '12px',
					color: '#ffff00',
					backgroundColor: '#000000',
					padding: { x: 8, y: 4 },
					duration: 3000,
					entityId: this.npcId
				})
			}
		}
	}

	public destroy() {
		if (this.highlightSprite) {
			this.highlightSprite.destroy()
			this.highlightSprite = null
		}
		if (this.sprite) {
			this.sprite.destroy()
			this.sprite = null
		}
		if (this.debugGraphics) {
			this.debugGraphics.destroy()
			this.debugGraphics = null
		}
		super.destroy()
	}
} 