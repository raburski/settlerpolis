import { Scene, Input } from 'phaser'
import { EventBus } from "../EventBus"

export class Keyboard {
	private cursors: Phaser.Types.Input.Keyboard.CursorKeys
	private wasdKeys: {
		W: Phaser.Input.Keyboard.Key
		A: Phaser.Input.Keyboard.Key
		S: Phaser.Input.Keyboard.Key
		D: Phaser.Input.Keyboard.Key
	}
	private inventoryKey: Phaser.Input.Keyboard.Key
	private enabled: boolean = true
	private wasInventoryPressed: boolean = false

	constructor(private scene: Scene) {
		this.cursors = scene.input.keyboard.createCursorKeys()
		
		// Add WASD keys
		this.wasdKeys = scene.input.keyboard.addKeys({
			W: Input.Keyboard.KeyCodes.W,
			A: Input.Keyboard.KeyCodes.A,
			S: Input.Keyboard.KeyCodes.S,
			D: Input.Keyboard.KeyCodes.D
		}) as {
			W: Phaser.Input.Keyboard.Key
			A: Phaser.Input.Keyboard.Key
			S: Phaser.Input.Keyboard.Key
			D: Phaser.Input.Keyboard.Key
		}

		// Add inventory key
		this.inventoryKey = scene.input.keyboard.addKey(Input.Keyboard.KeyCodes.I)

		// Listen for chat input visibility changes
		EventBus.on('chat:inputVisible', this.handleChatInputVisible, this)
	}

	public update() {
		if (this.enabled && this.inventoryKey.isDown && !this.wasInventoryPressed) {
			EventBus.emit('ui:inventory:toggle')
		}
		this.wasInventoryPressed = this.inventoryKey.isDown
	}

	private handleChatInputVisible = (isVisible: boolean) => {
		this.toggleKeys(!isVisible)
	}

	public toggleKeys(enable: boolean) {
		this.enabled = enable
		this.scene.input.keyboard.enabled = enable
		if (enable) {
			this.scene.input.keyboard.enableGlobalCapture()
		} else {
			this.scene.input.keyboard.disableGlobalCapture()
		}
	}

	public isMovingLeft(): boolean {
		return this.enabled && (this.cursors.left.isDown || this.wasdKeys.A.isDown)
	}

	public isMovingRight(): boolean {
		return this.enabled && (this.cursors.right.isDown || this.wasdKeys.D.isDown)
	}

	public isMovingUp(): boolean {
		return this.enabled && (this.cursors.up.isDown || this.wasdKeys.W.isDown)
	}

	public isMovingDown(): boolean {
		return this.enabled && (this.cursors.down.isDown || this.wasdKeys.S.isDown)
	}

	public isInventoryPressed(): boolean {
		return this.enabled && Phaser.Input.Keyboard.JustDown(this.inventoryKey)
	}

	public isAnyMovementKeyPressed(): boolean {
		return this.isMovingLeft() || this.isMovingRight() || 
			   this.isMovingUp() || this.isMovingDown()
	}

	public destroy(): void {
		EventBus.off('chat:inputVisible', this.handleChatInputVisible, this)
	}
} 