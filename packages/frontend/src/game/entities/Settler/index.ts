import type { GameScene } from '../../scenes/base/GameScene'
import type { Settler } from '@rugged/game'
import { SettlerView } from './View'
import { SettlerController } from './Controller'

export const createSettler = (scene: GameScene, settler: Settler): SettlerController => {
	const view = new SettlerView(scene, settler.position.x, settler.position.y, settler.id, settler.profession, settler.speed)
	return new SettlerController(view, scene, settler)
}

export { SettlerController, SettlerView }
