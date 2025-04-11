import { Scene } from 'phaser'
import WebFont from 'webfontloader'

export class PreloadScene extends Scene {
	private fontsLoaded: boolean = false

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
		// Check if fonts are loaded every 100ms
		this.scene.start('FarmScene')
	}

} 