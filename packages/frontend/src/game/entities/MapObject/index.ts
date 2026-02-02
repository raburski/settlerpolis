import type { GameScene } from '../../scenes/base/GameScene'
import type { MapObject } from '@rugged/game'
import { MapObjectView } from './View'
import { MapObjectController } from './Controller'

export type MapObjectEntity = {
	view: MapObjectView
	controller: MapObjectController
	mapObject: MapObject
}

export const createMapObject = (scene: GameScene, mapObject: MapObject): MapObjectEntity => {
	const view = new MapObjectView(scene, mapObject)
	const controller = new MapObjectController(scene, view, mapObject)
	return { view, controller, mapObject }
}
