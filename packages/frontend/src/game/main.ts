import { PreloadScene } from './scenes/PreloadScene'
import { AUTO, Game, Types, Scale, Physics } from 'phaser'
import { MultiplayerService } from './services/MultiplayerService'
import networkManager from './network'

let multiplayerService = new MultiplayerService(networkManager)

//  Find out more information about the Game Config at:
//  https://newdocs.phaser.io/docs/3.70.0/Phaser.Types.Core.GameConfig
const config: Types.Core.GameConfig = {
	type: AUTO,
	scale: {
		mode: Scale.CENTER_BOTH,
		parent: 'game-container',
		width: '100%',
		height: '100%',
		autoCenter: Scale.CENTER_BOTH,
		zoom: 1, // Set zoom to 2 for 2x pixel density
		// width: 800, // Base width
		// height: 600, // Base height
	},
	backgroundColor: '#000000',
	physics: {
		default: 'arcade',
		arcade: {
			gravity: { y: 0 },
			debug: false
		}
	},
	// Keep pixelArt true for crisp sprites, we'll handle text antialiasing per-text-object
	pixelArt: true,
	roundPixels: true,
	scene: [
		PreloadScene
	]
}

const StartGame = (parent: string) => {
	const game = new Game({ ...config, parent })
	
	// Make multiplayerService available globally
	window.multiplayerService = multiplayerService
	
	return game
}

export default StartGame

// Add type declaration for the global multiplayerService
declare global {
	interface Window {
		multiplayerService: MultiplayerService
	}
}

