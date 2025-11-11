import { Scene, GameObjects } from 'phaser'
import { itemService } from '../../services/ItemService'

export class LootView extends GameObjects.Container {
	private emojiText: GameObjects.Text | null = null
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
		
		// Create emoji text (will be set when metadata is available)
		this.emojiText = scene.add.text(0, 0, '❓', {
			fontSize: '24px',
			align: 'center',
			color: '#000000'
		})
		this.emojiText.setOrigin(0.5, 0.5)
		this.emojiText.setScale(0)
		this.emojiText.setAlpha(0)
		
		// Create name text (initially hidden)
		this.nameText = scene.add.text(0, -20, '', {
			fontSize: '14px',
			color: '#ffffff',
			backgroundColor: '#000000',
			padding: { x: 4, y: 2 },
			align: 'center'
		})
		this.nameText.setOrigin(0.5)
		this.nameText.setVisible(false)

		// Add emoji and name text to container
		this.add([this.emojiText, this.nameText])

		// Make emoji text interactive
		this.emojiText.setInteractive({ useHandCursor: true })

		// Add hover effects
		this.setupHoverEffects()

		// Setup item name and emoji display
		this.setupItemNameDisplay()

		// Set depth based on y position for proper layering
		this.setDepth(y)

		// Play spawn animation
		this.playSpawnAnimation()
	}

	private setupHoverEffects() {
		if (!this.emojiText) return

		this.emojiText.on('pointerover', () => {
			if (this.emojiText) {
				this.emojiText.setScale(1.2)
				this.emojiText.setTint(0xffff00)
			}
			this.nameText.setVisible(true)
		})

		this.emojiText.on('pointerout', () => {
			if (this.emojiText) {
				this.emojiText.setScale(1.0)
				this.emojiText.clearTint()
			}
			this.nameText.setVisible(false)
		})
	}

	private setupItemNameDisplay() {
		// Subscribe to item metadata changes
		this.unsubscribe = itemService.subscribeToItemMetadata(this.itemType, (metadata) => {
			if (metadata) {
				this.nameText.setText(metadata.name)
				// Update emoji from metadata
				if (this.emojiText && metadata.emoji) {
					this.emojiText.setText(metadata.emoji)
				}
			}
		})
	}

	private playSpawnAnimation() {
		// Check if scene and tweens are still available
		if (!this.scene || !this.scene.tweens || !this.emojiText) return

		// First tween: throw up and fade in
		this.scene.tweens.add({
			targets: this.emojiText,
			y: -40, // Start at origin and move up (negative y is up)
			scaleX: 1.0,
			scaleY: 1.0,
			alpha: 1,
			duration: 300,
			ease: 'Quad.out',
			onComplete: () => {
				// Check again before starting second tween
				if (!this.scene || !this.scene.tweens || !this.emojiText) return

				// Second tween: fall down with bounce
				this.scene.tweens.add({
					targets: this.emojiText,
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
		if (this.emojiText) {
			this.emojiText.on('pointerdown', callback)
		}
	}

	public destroy() {
		if (this.unsubscribe) {
			this.unsubscribe()
		}
		if (this.emojiText) {
			this.emojiText.destroy()
			this.emojiText = null
		}
		super.destroy()
	}

	public static preload(scene: Scene) {
		// No need to preload anything for emoji-based rendering
	}
} 