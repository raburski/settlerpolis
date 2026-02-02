import type { GameScene } from '../../scenes/base/GameScene'
import { PlayerView2 } from '../Player/View2'
import { RemotePlayerController } from './Controller'

export type RemotePlayer = {
	view: PlayerView2
	controller: RemotePlayerController
}

export const createRemotePlayer = (scene: GameScene, x: number, y: number, playerId: string): RemotePlayer => {
	const view = new PlayerView2(scene, x, y, playerId)
	const controller = new RemotePlayerController(view, scene, playerId)
	return { view, controller }
} 
