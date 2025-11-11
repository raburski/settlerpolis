import { Scene } from 'phaser'
import { SettlerView } from './View'
import { SettlerController } from './Controller'
import { Settler } from '@rugged/game'

export const createSettler = (scene: Scene, settlerData: Settler): SettlerController => {
	const view = new SettlerView(
		scene,
		settlerData.position.x,
		settlerData.position.y,
		settlerData.id,
		settlerData.profession,
		settlerData.speed
	)
	return new SettlerController(view, scene, settlerData)
}

export type { SettlerController }
export type { SettlerView }

