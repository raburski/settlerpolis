import { Scene } from 'phaser'
import { MapObjectView } from './View'
import { MapObjectController } from './Controller'
import { MapObject } from '@rugged/game'

export interface MapObjectEntity {
	view: MapObjectView
	controller: MapObjectController
}

export function createMapObject(scene: Scene, mapObject: MapObject): MapObjectEntity {
	const view = new MapObjectView(scene, mapObject)
	const controller = new MapObjectController(scene, view, mapObject)
	
	return {
		view,
		controller
	}
} 