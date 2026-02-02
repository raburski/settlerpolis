import type { GameScene } from '../../scenes/base/GameScene'
import type { NPC } from '@rugged/game'
import { NPCView } from './View'
import { NPCController } from './Controller'

export const createNPC = (scene: GameScene, x: number, y: number, npc: NPC): NPCController => {
	const view = new NPCView(scene, x, y, npc.id)
	return new NPCController(view, scene, npc)
}

export { NPCView, NPCController }
