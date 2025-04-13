import { Scene } from 'phaser'
import { PlayerView2 } from '../Player/View2'
import { RemotePlayerController } from './Controller'

export type RemotePlayer = {
	view: PlayerView
	controller: RemotePlayerController
}

export const createRemotePlayer = (scene: Scene, x: number, y: number, playerId: string): RemotePlayer => {
	const view = new PlayerView2(scene, x, y)
	const controller = new RemotePlayerController(view, scene, playerId)
	return { view, controller }
} 