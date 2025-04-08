import { Scene } from 'phaser'
import { PlayerData } from '../services/MultiplayerService'

export class MultiplayerPlayer {
	private sprite: Phaser.GameObjects.Sprite
	private scene: Scene
	private data: PlayerData
	private messageText: Phaser.GameObjects.Text | null = null

	constructor(scene: Scene, data: PlayerData) {
		this.scene = scene
		this.data = data

		// Create player sprite
		this.sprite = scene.add.sprite(data.x, data.y, 'player')
		this.sprite.setDisplaySize(32, 32)
		this.sprite.setTint(0xff0000) // Different color to distinguish from local player
	}

	update(data: PlayerData) {
		this.data = data
		this.sprite.setPosition(data.x, data.y)
	}

	destroy() {
		this.sprite.destroy()
	}

	getSprite(): Phaser.GameObjects.Sprite {
		return this.sprite
	}

	getData(): PlayerData {
		return this.data
	}

	// Method to display a message above the player's character
	displayMessage(message: string) {
		if (this.messageText) {
			this.messageText.destroy()
		}

		this.messageText = this.scene.add.text(this.sprite.x, this.sprite.y - 50, message, {
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
} 