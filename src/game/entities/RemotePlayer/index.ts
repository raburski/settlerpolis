import { Scene } from 'phaser'
import { PlayerView } from '../Player/View'
import { RemotePlayerController } from './Controller'

export type RemotePlayer = {
	view: PlayerView
	controller: RemotePlayerController
}

export const createRemotePlayer = (scene: Scene, x: number, y: number, playerId: string): RemotePlayer => {
	const view = new PlayerView(scene, x, y)
	const controller = new RemotePlayerController(view, scene, playerId)
	return { view, controller }
} 