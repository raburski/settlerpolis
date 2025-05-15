import { Scene } from 'phaser'
import { PlayerView } from '../Player/View'
import { Event } from "@rugged/game"
import { EventBus } from '../../EventBus'

export class NPCController {
	constructor(
		private view: PlayerView,
		private scene: Scene,
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
			if (data.emoji && !data.message) {
				// Emoji-only message
				this.view.displayEmoji(data.emoji)
			} else if (data.message) {
				// Regular message (with or without emoji)
				this.view.displayMessage(data.message)
			}
		}
	}

	private handleNPCGo = (data: { npcId: string, position: { x: number, y: number } }) => {
		// Only move if it's our NPC
		if (data.npcId === this.npcId) {
			this.view.setTargetPosition(data.position.x, data.position.y)
		}
	}

	update(): void {
		// Update view
		this.view.preUpdate()
	}

	public destroy(): void {
		// Clean up event listeners
		EventBus.off(Event.NPC.SC.Message, this.handleNPCMessage, this)
		EventBus.off(NPCEvents.SC.Go, this.handleNPCGo, this)
		this.view.off('pointerdown', this.handleClick)
		// Destroy the view
		this.view.destroy()
	}
} 