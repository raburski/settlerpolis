import type { GameScene } from '../../scenes/base/GameScene'
import { PlayerView2 } from '../Player/View2'
import { LocalPlayerController } from './Controller'

export type LocalPlayer = {
	view: PlayerView2
	controller: LocalPlayerController
}

export const createLocalPlayer = (
	scene: GameScene,
	x: number,
	y: number,
	playerId: string
): LocalPlayer => {
	const view = new PlayerView2(scene, x, y, playerId)
	const controller = new LocalPlayerController(view, scene, playerId)
	return { view, controller }
} 
