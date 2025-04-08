import { Scene } from 'phaser'
import { PlayerData } from '../services/MultiplayerService'

export class MultiplayerPlayer {
	private sprite: Phaser.GameObjects.Sprite
	private scene: Scene
	private data: PlayerData

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
} 