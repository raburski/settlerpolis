import { Scene, GameObjects, Physics } from 'phaser'
import { PlayerAppearance } from '../services/MultiplayerService'

export enum Direction {
	Down = 'down',
	Up = 'up',
	Left = 'left',
	Right = 'right'
}

export enum HorizontalDirection {
	Left = 'left',
	Right = 'right'
}

export enum PlayerState {
	Idle = 'idle',
	Walking = 'walking'
}

export class BasePlayer {
	protected scene: Scene
	protected container: GameObjects.Container
	protected body: GameObjects.Sprite
	protected hair: GameObjects.Sprite
	protected clothes: GameObjects.Sprite
	protected hands: GameObjects.Sprite
	protected messageText: GameObjects.Text | null = null
	protected appearance: PlayerAppearance
	protected direction: Direction = Direction.Down
	protected horizontalDirection: HorizontalDirection = HorizontalDirection.Right
	protected currentState: PlayerState = PlayerState.Idle
	protected currentAnimationKey: string = ''
	protected speed: number = 160 // Default speed in pixels per second

	constructor(scene: Scene, x: number, y: number, appearance: PlayerAppearance) {
		this.scene = scene
		this.appearance = appearance

		// Create container for all character parts
		this.container = scene.add.container(x, y)

		// Create sprites for each body part
		this.body = scene.add.sprite(0, 0, 'player-body')
		this.hair = scene.add.sprite(0, 0, 'player-hair')
		this.clothes = scene.add.sprite(0, 0, 'player-clothes')
		this.hands = scene.add.sprite(0, 0, 'player-hands')

		// Add all parts to container in correct order (bottom to top)
		this.container.add([this.body, this.clothes, this.hair, this.hands])

		// Enable physics on the container
		scene.physics.add.existing(this.container)
		const body = this.container.body as Physics.Arcade.Body
		
		// Set a collision box for the bottom half of the character
		// This creates a more 3D-like effect where the character appears to walk behind objects
		// The character sprite is 80x64 pixels
		body.setSize(40, 8) // Width: half of the sprite width, Height: half of the sprite height
		body.setOffset(-20, 22) // Center horizontally, align to bottom
		
		// Make sure the player can't go out of bounds
		body.setCollideWorldBounds(true)

		// Create animations
		this.createAnimations()

		// Start with idle animation
		this.playAnimation('idle')
	}

	protected createAnimations(): void {
		// Helper function to create animations for a sprite
		const createSpriteAnimations = (key: string, sprite: GameObjects.Sprite) => {
			// Animation rows in the sprite sheet:
			// Row 0: Idle left (5 frames)
			// Row 1: Walk left (5 frames)
			// Row 2: Attack left (5 frames)
			// Row 3: Cast left (5 frames)
			// Row 4: Hit left (5 frames)
			// Row 5: Death left (5 frames)
			// Row 6: Jump left (5 frames)

			// Idle animations
			sprite.anims.create({
				key: `${key}-idle-left`,
				frames: sprite.anims.generateFrameNumbers(key, { start: 0, end: 4 }),
				frameRate: 8,
				repeat: -1
			})

			// For right-facing animations, we'll flip the sprite
			sprite.anims.create({
				key: `${key}-idle-right`,
				frames: sprite.anims.generateFrameNumbers(key, { start: 0, end: 4 }),
				frameRate: 8,
				repeat: -1
			})

			// Walking animations
			sprite.anims.create({
				key: `${key}-walk-left`,
				frames: sprite.anims.generateFrameNumbers(key, { start: 10, end: 14 }),
				frameRate: 12,
				repeat: -1
			})

			sprite.anims.create({
				key: `${key}-walk-right`,
				frames: sprite.anims.generateFrameNumbers(key, { start: 10, end: 14 }),
				frameRate: 12,
				repeat: -1
			})

			// For now, we'll use the same animations for up and down
			// In a more complete implementation, we would add specific animations for these directions
			sprite.anims.create({
				key: `${key}-idle-up`,
				frames: sprite.anims.generateFrameNumbers(key, { start: 0, end: 4 }),
				frameRate: 8,
				repeat: -1
			})

			sprite.anims.create({
				key: `${key}-idle-down`,
				frames: sprite.anims.generateFrameNumbers(key, { start: 0, end: 4 }),
				frameRate: 8,
				repeat: -1
			})

			sprite.anims.create({
				key: `${key}-walk-up`,
				frames: sprite.anims.generateFrameNumbers(key, { start: 10, end: 14 }),
				frameRate: 12,
				repeat: -1
			})

			sprite.anims.create({
				key: `${key}-walk-down`,
				frames: sprite.anims.generateFrameNumbers(key, { start: 10, end: 14 }),
				frameRate: 12,
				repeat: -1
			})
		}

		// Create animations for each body part
		createSpriteAnimations('player-body', this.body)
		createSpriteAnimations('player-hair', this.hair)
		createSpriteAnimations('player-clothes', this.clothes)
		createSpriteAnimations('player-hands', this.hands)
	}

	protected playAnimation(state: PlayerState): void {
		const animationKey = `${state === PlayerState.Walking ? 'walk' : 'idle'}-${this.direction}`
		
		// If the animation key hasn't changed, don't restart the animation
		if (this.currentAnimationKey === animationKey) {
			return
		}
		
		// Set flipX based on horizontal direction
		const flipX = this.horizontalDirection === HorizontalDirection.Right
		
		// Play animations on all body parts
		this.body.play(`player-body-${animationKey}`, true)
		// this.hair.play(`player-hair-${animationKey}`, true)
		// this.clothes.play(`player-clothes-${animationKey}`, true)
		// this.hands.play(`player-hands-${animationKey}`, true)
		
		// Apply flipping
		this.body.setFlipX(flipX)
		this.hair.setFlipX(flipX)
		this.clothes.setFlipX(flipX)
		this.hands.setFlipX(flipX)
		
		// Update the current animation key
		this.currentAnimationKey = animationKey
	}

	public displayMessage(message: string) {
		if (this.messageText) {
			this.messageText.destroy()
		}

		this.messageText = this.scene.add.text(this.container.x, this.container.y - 50, message, {
			fontSize: '14px',
			color: '#ffffff',
			backgroundColor: 'rgba(0, 0, 0, 0.7)',
			padding: { x: 5, y: 3 },
			align: 'center'
		}).setOrigin(0.5)

		// Remove the message after 5 seconds
		this.scene.time.delayedCall(5000, () => {
			this.messageText?.destroy()
			this.messageText = null
		})
	}

	public getSprite(): GameObjects.Container {
		return this.container
	}

	public setCollisionWith(layer: Phaser.Tilemaps.TilemapLayer): void {
		this.scene.physics.add.collider(this.container, layer)
	}

	public destroy(): void {
		this.container.destroy()
	}

	public updatePosition(x: number, y: number): void {
		this.container.x = x
		this.container.y = y
	}

	public updateDirection(direction: Direction): void {
        if (this.direction === direction) return

		this.direction = direction
		if (direction === Direction.Left || direction === Direction.Right) {
			this.horizontalDirection = direction === Direction.Right ? HorizontalDirection.Right : HorizontalDirection.Left
            this.updateState(this.currentState) // to make sure animation is updated
		}
	}

	public updateState(state: PlayerState): void {
		this.currentState = state
		this.playAnimation(state)
	}

	public static preload(scene: Scene): void {
		// Calculate frame dimensions based on the sprite sheet size
		// The sprite sheets are 800x448 pixels
		// The image has 7 rows for different animation types
		// The top row has 5 frames for left-facing animations
		// The total width corresponds to 10 frames (the longest animation)
		const frameWidth = 80  // 800/10 = 80 pixels per frame
		const frameHeight = 64 // 448/7 = 64 pixels per row
		
		// Load body parts
		scene.load.spritesheet('player-body', 'assets/characters/player/Character skin colors/Male Skin1.png', {
			frameWidth,
			frameHeight
		})
		
		// Load hair
		scene.load.spritesheet('player-hair', 'assets/characters/player/Male Hair/Male Hair1.png', {
			frameWidth,
			frameHeight
		})
		
		// Load clothes
		scene.load.spritesheet('player-clothes', 'assets/characters/player/Male Clothing/Shirt v2.png', {
			frameWidth,
			frameHeight
		})
		
		// Load hands
		scene.load.spritesheet('player-hands', 'assets/characters/player/Male Hand/Male Sword.png', {
			frameWidth,
			frameHeight
		})
	}
} 