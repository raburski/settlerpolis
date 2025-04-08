import { FarmScene } from './scenes/FarmScene'
import { AUTO, Game, Types, Scale, Physics } from 'phaser'

//  Find out more information about the Game Config at:
//  https://newdocs.phaser.io/docs/3.70.0/Phaser.Types.Core.GameConfig
const config: Types.Core.GameConfig = {
	type: AUTO,
	scale: {
		mode: Scale.RESIZE,
		parent: 'game-container',
		width: '100%',
		height: '100%'
	},
	backgroundColor: '#000000',
	physics: {
		default: 'arcade',
		arcade: {
			gravity: { y: 0 },
			debug: false
		}
	},
	scene: [
		FarmScene
	]
}

const StartGame = (parent) => {
	return new Game({ ...config, parent })
}

export default StartGame

