import { Scene } from 'phaser'
import { NPCView } from "./View"
import { NPCController } from './Controller'
import { NPC } from "@rugged/game"

export const createNPC = (scene: Scene, x: number, y: number, npcData: NPC): NPCController => {
	const view = new NPCView(scene, x, y, npcData.speed, npcData.id, npcData.interactable)
	return new NPCController(view, scene, npcData)
} 