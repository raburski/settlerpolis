import { Scene, GameObjects, Physics } from 'phaser'

export class Player {
	private scene: Scene
	private container: GameObjects.Container
	private body: GameObjects.Sprite
	private hair: GameObjects.Sprite
	private clothes: GameObjects.Sprite
	private hands: GameObjects.Sprite
	private cursors: Phaser.Types.Input.Keyboard.CursorKeys
	private wasdKeys: {
		W: Phaser.Input.Keyboard.Key
		A: Phaser.Input.Keyboard.Key
		S: Phaser.Input.Keyboard.Key
		D: Phaser.Input.Keyboard.Key
	}
	private speed: number = 160
	private direction: 'down' | 'up' | 'left' | 'right' = 'down'
	private horizontalDirection: 'left' | 'right' = 'right'
	private isMoving: boolean = false

	/**
	 * Preload all player assets
	 * This should be called in the scene's preload method
	 */
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

	constructor(scene: Scene, x: number, y: number) {
		this.scene = scene
		this.cursors = scene.input.keyboard.createCursorKeys()
		
		// Add WASD keys
		this.wasdKeys = scene.input.keyboard.addKeys({
			W: Phaser.Input.Keyboard.KeyCodes.W,
			A: Phaser.Input.Keyboard.KeyCodes.A,
			S: Phaser.Input.Keyboard.KeyCodes.S,
			D: Phaser.Input.Keyboard.KeyCodes.D
		}) as {
			W: Phaser.Input.Keyboard.Key
			A: Phaser.Input.Keyboard.Key
			S: Phaser.Input.Keyboard.Key
			D: Phaser.Input.Keyboard.Key
		}

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

	private createAnimations(): void {
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

	private playAnimation(state: 'idle' | 'walk'): void {
		const animationKey = `${state}-${this.direction}`
		
		// Set flipX based on horizontal direction
		const flipX = this.horizontalDirection === 'right'
		
		// Play animations on all body parts
		this.body.play(`player-body-${animationKey}`, true)
		this.hair.play(`player-hair-${animationKey}`, true)
		this.clothes.play(`player-clothes-${animationKey}`, true)
		this.hands.play(`player-hands-${animationKey}`, true)
		
		// Apply flipping
		this.body.setFlipX(flipX)
		this.hair.setFlipX(flipX)
		this.clothes.setFlipX(flipX)
		this.hands.setFlipX(flipX)
	}

	update(): void {
		const body = this.container.body as Physics.Arcade.Body
		body.setVelocity(0)

		// Check for left movement (arrow keys or A)
		if (this.cursors.left.isDown || this.wasdKeys.A.isDown) {
			body.setVelocityX(-this.speed)
			this.direction = 'left'
			this.horizontalDirection = 'left'
			this.isMoving = true
		} 
		// Check for right movement (arrow keys or D)
		else if (this.cursors.right.isDown || this.wasdKeys.D.isDown) {
			body.setVelocityX(this.speed)
			this.direction = 'right'
			this.horizontalDirection = 'right'
			this.isMoving = true
		}

		// Check for up movement (arrow keys or W)
		if (this.cursors.up.isDown || this.wasdKeys.W.isDown) {
			body.setVelocityY(-this.speed)
			this.direction = 'up'
			// Preserve horizontal direction when moving up
			this.isMoving = true
		} 
		// Check for down movement (arrow keys or S)
		else if (this.cursors.down.isDown || this.wasdKeys.S.isDown) {
			body.setVelocityY(this.speed)
			this.direction = 'down'
			// Preserve horizontal direction when moving down
			this.isMoving = true
		}

		// Play appropriate animation
		this.playAnimation(this.isMoving ? 'walk' : 'idle')
		this.isMoving = false
	}

	getSprite(): GameObjects.Container {
		return this.container
	}

	setCollisionWith(layer: Phaser.Tilemaps.TilemapLayer): void {
		this.scene.physics.add.collider(this.container, layer)
	}
} 