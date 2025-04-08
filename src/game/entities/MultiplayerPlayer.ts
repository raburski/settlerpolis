import { Scene } from 'phaser'
import { PlayerData, Gender } from '../services/MultiplayerService'
import { BasePlayer } from './BasePlayer'

export class MultiplayerPlayer extends BasePlayer {
	private playerId: string
	private messageText: Phaser.GameObjects.Text | null = null

	constructor(scene: Scene, x: number, y: number, playerId: string, appearance: PlayerAppearance) {
		super(scene, x, y, appearance)
		this.playerId = playerId
	}

	updateAppearance(newAppearance: PlayerAppearance): void {
		this.appearance = newAppearance
		// Logic to update the player's appearance
	}

	updatePosition(x: number, y: number): void {
		this.container.setPosition(x, y)
	}

	getPlayerId(): string {
		return this.playerId
	}

	// Method to display a message above the player's character
	displayMessage(message: string) {
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

	update(data: PlayerData): void {
		this.updatePosition(data.x, data.y)
		this.updateAppearance(data.appearance)
	}
} 