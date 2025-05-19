import { Scene } from 'phaser'
import { NPCView, PlayerState } from './View'
import { Event } from "@rugged/game"
import { EventBus } from '../../EventBus'
import { GameScene } from '../../scenes/base/GameScene'

export class NPCController {
	constructor(
		private view: NPCView,
		private scene: GameScene,
		private npcId: string
	) {
		// Subscribe to NPC events
		EventBus.on(Event.NPC.SC.Message, this.handleNPCMessage, this)
		EventBus.on(Event.NPC.SC.Go, this.handleNPCGo, this)

		// Add click interaction
		this.view.on('pointerdown', this.handleClick)
	}

	private handleClick = () => {
		// Check if player is close enough to interact
		EventBus.emit(Event.NPC.CS.Interact, { npcId: this.npcId })
	}

	private handleNPCMessage = (data: { npcId: string, message?: string, emoji?: string }) => {
		// Only show message if it's from our NPC
		if (data.npcId === this.npcId) {
			if (!this.scene.textDisplayService) return

			if (data.emoji && !data.message) {
				// Emoji-only message
				this.scene.textDisplayService.displayEmoji({
					message: data.emoji,
					scene: this.scene,
					worldPosition: { x: this.view.x, y: this.view.y },
					entityId: this.npcId
				})
			} else if (data.message) {
				// Regular message (with or without emoji)
				this.scene.textDisplayService.displayMessage({
					message: data.message,
					scene: this.scene,
					worldPosition: { x: this.view.x, y: this.view.y },
					entityId: this.npcId
				})
			}
		}
	}

	private handleNPCGo = (data: { npcId: string, position: { x: number, y: number } }) => {
		// Only move if it's our NPC
		if (data.npcId === this.npcId) {
			this.view.setTargetPosition(data.position.x, data.position.y)
			// Update text display service with new position
			if (this.scene.textDisplayService) {
				this.scene.textDisplayService.updateEntityPosition(this.npcId, data.position)
			}
		}
	}

	update(): void {
		// Update view
		this.view.preUpdate()
	}

	public destroy(): void {
		// Clean up event listeners
		EventBus.off(Event.NPC.SC.Message, this.handleNPCMessage, this)
		EventBus.off(Event.NPC.SC.Go, this.handleNPCGo, this)
		this.view.off('pointerdown', this.handleClick)
		// Clean up text displays
		if (this.scene.textDisplayService) {
			this.scene.textDisplayService.cleanupEntityTexts(this.npcId)
		}
		// Destroy the view
		this.view.destroy()
	}
} 