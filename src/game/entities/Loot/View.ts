import { Scene, GameObjects } from 'phaser'

export class LootView extends GameObjects.Container {
	private sprite: GameObjects.Sprite
	private nameText: GameObjects.Text

	constructor(
		scene: Scene, 
		x: number, 
		y: number, 
		name: string,
		textureKey: string = 'mozgotrzep'
	) {
		super(scene, x, y)
		scene.add.existing(this)

		// Create the sprite
		this.sprite = scene.add.sprite(0, 0, textureKey)
		this.sprite.setScale(0)
		this.sprite.setAlpha(0)
		
		// Create text for item name (initially hidden)
		this.nameText = scene.add.text(0, -20, name, {
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
		this.sprite.on('pointerover', () => {
			this.sprite.setTint(0xffff00)
			this.nameText.setVisible(true)
		})

		this.sprite.on('pointerout', () => {
			this.sprite.clearTint()
			this.nameText.setVisible(false)
		})

		// Play spawn animation
		this.playSpawnAnimation()
	}

	private playSpawnAnimation() {
		// First tween: throw up and fade in
		this.scene.tweens.add({
			targets: this.sprite,
			y: 40, // Start below and move up
			scaleX: 0.5,
			scaleY: 0.5,
			alpha: 1,
			duration: 300,
			ease: 'Quad.out',
			onComplete: () => {
				// Second tween: fall down with bounce
				this.scene.tweens.add({
					targets: this.sprite,
					y: 0,
					duration: 400,
					ease: 'Bounce.out',
				})
			}
		})
	}

	public setInteractive(callback: () => void) {
		this.sprite.on('pointerdown', callback)
	}

	public destroy() {
		super.destroy()
	}

	public static preload(scene: Scene) {
		// Load loot textures if needed
		// scene.load.image('mozgotrzep', 'assets/items/mozgotrzep.png')
	}
} 