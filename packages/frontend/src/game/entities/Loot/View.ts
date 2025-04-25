import { Scene, GameObjects } from 'phaser'
import { itemService } from '../../services/ItemService'
import { itemTextureService } from '../../services/ItemTextureService'

export class LootView extends GameObjects.Container {
	private sprite: GameObjects.Sprite
	private nameText: GameObjects.Text
	private itemType: string
	private unsubscribe: (() => void) | null = null

	constructor(
		scene: Scene, 
		x: number, 
		y: number, 
		itemType: string
	) {
		super(scene, x, y)
		scene.add.existing(this)

		this.itemType = itemType

		// Get the texture for this item type
		const textureInfo = itemTextureService.getItemTexture(itemType)
		
		// Create the sprite with the appropriate texture
		if (textureInfo) {
			this.sprite = scene.add.sprite(0, 0, textureInfo.key, textureInfo.frame)
			// Scale down the sprite to fit the game world better
			this.sprite.setScale(0.5)
		} else {
			// Fallback to a default texture if the item type doesn't have a texture
			this.sprite = scene.add.sprite(0, 0, 'mozgotrzep')
			this.sprite.setScale(0.5)
		}
		
		this.sprite.setScale(0)
		this.sprite.setAlpha(0)
		
		// Create text (initially hidden)
		this.nameText = scene.add.text(0, -20, '', {
			fontSize: '14px',
			color: '#ffffff',
			backgroundColor: '#000000',
			padding: { x: 4, y: 2 },
			align: 'center'
		})
		this.nameText.setOrigin(0.5)
		this.nameText.setVisible(false)

		// Add sprite and text to container
		this.add([this.sprite, this.nameText])

		// Make sprite interactive
		this.sprite.setInteractive({ useHandCursor: true })

		// Add hover effects
		this.setupHoverEffects()

		// Setup item name display
		this.setupItemNameDisplay()

		// Set depth based on y position for proper layering
		this.setDepth(y)

		// Play spawn animation
		this.playSpawnAnimation()
	}

	private setupHoverEffects() {
		this.sprite.on('pointerover', () => {
			this.sprite.setTint(0xffff00)
			this.nameText.setVisible(true)
		})

		this.sprite.on('pointerout', () => {
			this.sprite.clearTint()
			this.nameText.setVisible(false)
		})
	}

	private setupItemNameDisplay() {
		// Subscribe to item metadata changes
		this.unsubscribe = itemService.subscribeToItemMetadata(this.itemType, (metadata) => {
			if (metadata) {
				this.nameText.setText(metadata.name)
			}
		})
	}

	private playSpawnAnimation() {
		// Check if scene and tweens are still available
		if (!this.scene || !this.scene.tweens) return

		// First tween: throw up and fade in
		this.scene.tweens.add({
			targets: this.sprite,
			y: -40, // Start at origin and move up (negative y is up)
			scaleX: 0.5,
			scaleY: 0.5,
			alpha: 1,
			duration: 300,
			ease: 'Quad.out',
			onComplete: () => {
				// Check again before starting second tween
				if (!this.scene || !this.scene.tweens) return

				// Second tween: fall down with bounce
				this.scene.tweens.add({
					targets: this.sprite,
					y: 0,
					duration: 400,
					ease: 'Bounce.out',
					onComplete: () => {
						// Update depth after animation completes to ensure proper layering
						if (this.active) {
							this.setDepth(this.y)
						}
					}
				})
			}
		})
	}

	/**
	 * Called before the physics update
	 * This ensures the depth is always up to date
	 */
	public preUpdate(): void {
		// Update depth based on current y position
		this.setDepth(this.y)
	}

	public setInteractive(callback: () => void) {
		this.sprite.on('pointerdown', callback)
	}

	public destroy() {
		if (this.unsubscribe) {
			this.unsubscribe()
		}
		super.destroy()
	}

	public static preload(scene: Scene) {
		// No need to preload textures here as they are preloaded by ItemTextureService
	}
} 