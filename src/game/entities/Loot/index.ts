import { Scene } from 'phaser'
import { LootView } from './View'
import { LootController } from './Controller'

export type DroppedItem = {
	id: string
	name: string
	position: {
		x: number
		y: number
	}
	textureKey?: string
}

export type Loot = {
	view: LootView
	controller: LootController
}

export function createLoot(
	scene: Scene,
	item: DroppedItem,
	player: { x: number, y: number }
): Loot {
	const view = new LootView(
		scene,
		item.position.x,
		item.position.y,
		item.name,
		item.textureKey
	)

	const controller = new LootController(
		view,
		scene,
		item.id,
		player
	)

	return { view, controller }
} 