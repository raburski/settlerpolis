import { Scene } from 'phaser'
import { NPCView } from "./View"
import { NPCController } from './Controller'
import { NPC } from "../../../../backend/src/types"

export type NPCEntity = {
	view: PlayerView
	controller: NPCController
}

export const createNPC = (scene: Scene, x: number, y: number, npcData: NPC): NPCEntity => {
	const view = new NPCView(scene, x, y, npcData.speed)
	
	// Make the view interactive with a rectangle hit area
	view.setInteractive(new Phaser.Geom.Rectangle(-32, -32, 64, 64), Phaser.Geom.Rectangle.Contains)
	view.input.cursor = 'pointer'
	
	const controller = new NPCController(view, scene, npcData.id)
	return { view, controller }
} 