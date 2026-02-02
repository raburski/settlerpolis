import type { GameScene } from '../../scenes/base/GameScene'
import { LootView } from './View'
import { LootController } from './Controller'
import type { DroppedItem } from '@rugged/game'

export type Loot = {
	view: LootView
	controller: LootController
}

export function createLoot(scene: GameScene, item: DroppedItem, player: { x: number; y: number }): Loot {
	const view = new LootView(scene, item.position.x, item.position.y, item.itemType, item.quantity)
	const controller = new LootController(view, item.id, player)
	return { view, controller }
}
