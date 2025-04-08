import { Scene, GameObjects, Physics } from 'phaser'
import { EventBus } from '../EventBus'
import { Gender, PlayerAppearance } from '../services/MultiplayerService'
import { BasePlayer } from './BasePlayer'

export const DEFAULT_APPEARANCE: PlayerAppearance = {
	gender: Gender.Male
}

export class Player extends BasePlayer {
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
	private messageText: GameObjects.Text | null = null

	constructor(scene: Scene, x: number, y: number) {
		super(scene, x, y, DEFAULT_APPEARANCE)
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

		// Listen for chat input visibility changes
		EventBus.on('chat:inputVisible', this.handleChatInputVisible, this)
	}

	private handleChatInputVisible(isVisible: boolean) {
		this.toggleWASDKeys(!isVisible)
	}

	private toggleWASDKeys(enable: boolean) {
		const input = this.scene.input.keyboard
		if (enable) {
			this.wasdKeys = input.addKeys({
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
		} else {
			Object.values(this.wasdKeys).forEach(key => input.removeKey(key))
		}
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