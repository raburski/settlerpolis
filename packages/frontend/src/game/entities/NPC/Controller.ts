import { Scene } from 'phaser'
import { NPCView, PlayerState } from './View'
import { Event, NPC } from "@rugged/game"
import { EventBus } from '../../EventBus'
import { GameScene } from '../../scenes/base/GameScene'
import { tutorialService, TutorialFlag } from '../../services/TutorialService'

export class NPCController {
	constructor(
		private view: NPCView,
		private scene: GameScene,
		public npc: NPC
	) {
		// Subscribe to NPC events
		EventBus.on(Event.NPC.SC.Message, this.handleNPCMessage, this)
		EventBus.on(Event.NPC.SC.Go, this.handleNPCGo, this)
	}

	public handleInteraction = () => {
		// Emit interaction event
		EventBus.emit(Event.NPC.CS.Interact, { npcId: this.npc.id })
		
		// Mark NPC interaction tutorial as completed
		tutorialService.complete(TutorialFlag.NPCInteract)
	}

	private handleNPCMessage = (data: { npcId: string, message?: string, emoji?: string }) => {
		// Only show message if it's from our NPC
		if (data.npcId === this.npc.id) {
			if (!this.scene.textDisplayService) return

			if (data.emoji && !data.message) {
				// Emoji-only message
				this.scene.textDisplayService.displayEmoji({
					message: data.emoji,
					scene: this.scene,
					worldPosition: { x: this.view.x, y: this.view.y - 16 },
					entityId: this.npc.id
				})
			} else if (data.message) {
				// Regular message (with or without emoji)
				this.scene.textDisplayService.displayMessage({
					message: data.message,
					scene: this.scene,
					worldPosition: { x: this.view.x, y: this.view.y - 16 },
					entityId: this.npc.id
				})
			}
		}
	}

	private handleNPCGo = (data: { npcId: string, position: { x: number, y: number } }) => {
		// Only move if it's our NPC
		if (data.npcId === this.npc.id) {
			this.view.setTargetPosition(data.position.x, data.position.y)
			// Update text display service with new position
			if (this.scene.textDisplayService) {
				this.scene.textDisplayService.updateEntityPosition(this.npc.id, data.position)
			}
		}
	}

	public update() {
		this.view.update()
	}

	public updateNPC(npcData: NPC) {
		this.npc = npcData
		this.view.updatePosition(npcData.position)
		this.view.updateState(npcData.state)
	}

	public destroy(): void {
		// Clean up event listeners
		EventBus.off(Event.NPC.SC.Message, this.handleNPCMessage, this)
		EventBus.off(Event.NPC.SC.Go, this.handleNPCGo, this)
		// Clean up text displays
		if (this.scene.textDisplayService) {
			this.scene.textDisplayService.cleanupEntityTexts(this.npc.id)
		}
		// Destroy the view
		this.view.destroy()
	}
} 
