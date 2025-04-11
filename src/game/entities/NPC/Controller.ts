import { Scene } from 'phaser'
import { PlayerView } from '../Player/View'
import { Event } from '../../../../backend/src/events'
import { EventBus } from '../../EventBus'

export class NPCController {
	constructor(
		private view: PlayerView,
		private scene: Scene,
		private npcId: string
	) {
		// Subscribe to NPC events
		EventBus.on(Event.NPC.SC.Message, this.handleNPCMessage, this)

		// Add click interaction
		this.view.on('pointerdown', this.handleClick)
	}

	private handleClick = () => {
		// Check if player is close enough to interact
				EventBus.emit(Event.NPC.CS.Interact, { npcId: this.npcId })


	}

	private handleNPCMessage = (data: { npcId: string, message: string }) => {
		// Only show message if it's from our NPC
		if (data.npcId === this.npcId) {
			this.view.displayMessage(data.message)
		}
	}

	update(): void {
		// Update view
		this.view.preUpdate()
	}

	public destroy(): void {
		// Clean up event listeners
		EventBus.off(Event.NPC.SC.Message, this.handleNPCMessage, this)
		this.view.off('pointerdown', this.handleClick)
		// Destroy the view
		this.view.destroy()
	}
} 