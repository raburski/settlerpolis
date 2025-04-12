import { Scene } from 'phaser'
import WebFont from 'webfontloader'
import { EventBus } from '../EventBus'
import { Event } from '../../../backend/src/events'
import { PlayerView } from '../entities/Player/View'
import networkManager from "../network"

export class PreloadScene extends Scene {
	private fontsLoaded: boolean = false
	private isConnected: boolean = false

	constructor() {
		super({ key: 'PreloadScene' })
	}

	preload() {
		// Show loading text while fonts are loading
		const loadingText = this.add.text(
			this.cameras.main.centerX,
			this.cameras.main.centerY,
			'Loading...',
			{
				// fontFamily: 'Arial',
				fontSize: '16px',
				color: '#ffffff'
			}
		)
		loadingText.setOrigin(0.5)
	}

	create() {
		networkManager.connect(() => {
			EventBus.emit(Event.Players.CS.Connect)
		})
		// Set up connection response handler
		EventBus.once(Event.Players.SC.Connected, (data: { scene: string, position: { x: number, y: number }}) => {
			this.isConnected = true
			// Start the scene specified by the server
			this.scene.start(data.scene, {
				x: data.position.x,
				y: data.position.y,
				isTransition: false
			})
		})
	}

} 