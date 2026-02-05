import type { GameScene } from '../../scenes/base/GameScene'
import type { NPC } from '@rugged/game'
import { NPCView } from './View'
import { NPCController } from './Controller'

export const createNPC = (scene: GameScene, x: number, y: number, npc: NPC): NPCController => {
	const view = new NPCView(scene, x, y, npc.id)
	const emoji = npc.attributes?.emoji
	if (typeof emoji === 'string' && emoji.length > 0) {
		view.setEmoji(emoji)
	}
	return new NPCController(view, scene, npc)
}

export { NPCView, NPCController }
