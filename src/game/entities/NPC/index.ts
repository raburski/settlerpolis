import { Scene } from 'phaser'
import { PlayerView } from '../Player/View'
import { NPCController } from './Controller'

export type NPC = {
	view: PlayerView
	controller: NPCController
}

export const createNPC = (scene: Scene, x: number, y: number, npcData: NPC): NPC => {
	const view = new PlayerView(scene, x, y, {}, true)
	
	// Make the view interactive with a rectangle hit area
	view.setInteractive(new Phaser.Geom.Rectangle(-32, -32, 64, 64), Phaser.Geom.Rectangle.Contains)
	view.input.cursor = 'pointer'
	
	const controller = new NPCController(view, scene, npcData.id)
	return { view, controller }
} 