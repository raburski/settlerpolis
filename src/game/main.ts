import { FarmScene } from './scenes/FarmScene'
import { FountainScene } from './scenes/FountainScene'
import { TempleScene } from './scenes/TempleScene'
import { PreloadScene } from './scenes/PreloadScene'
import { AUTO, Game, Types, Scale, Physics } from 'phaser'
import { MultiplayerService } from './services/MultiplayerService'
import { NetworkManager } from './network/NetworkManager'
import { LocalManager } from './network/LocalManager'
import { GameManager } from '../../backend/src/Game'

// Create multiplayer service instance
const IS_REMOTE_GAME = false
let multiplayerService: MultiplayerService

if (IS_REMOTE_GAME) {
	const networkManager = new NetworkManager('https://hearty-rejoicing-production.up.railway.app')
	multiplayerService = new MultiplayerService(networkManager)
} else {
	const localManager = new LocalManager()
	const gameManager = new GameManager(localManager.server)
	multiplayerService = new MultiplayerService(localManager.client)
}

//  Find out more information about the Game Config at:
//  https://newdocs.phaser.io/docs/3.70.0/Phaser.Types.Core.GameConfig
const config: Types.Core.GameConfig = {
	type: AUTO,
	scale: {
		mode: Scale.RESIZE,
		parent: 'game-container',
		// width: '100%',
		// height: '100%',
		autoCenter: Scale.CENTER_BOTH
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
		PreloadScene,
		FarmScene,
		FountainScene,
		TempleScene
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

