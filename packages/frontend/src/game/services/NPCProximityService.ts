import { Scene } from 'phaser'
import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'
import { NPCView } from '../entities/NPC/View'

const INTERACTION_RADIUS = 100 // pixels

export class NPCProximityService {
	private closestNPC: { npc: NPCView, distance: number } | null = null

	constructor(private scene: Scene) {
		// No initialization in constructor
	}

	public initialize() {
		// Set up keyboard input
		this.scene.input.keyboard.on('keydown-E', this.handleInteraction)
	}

	public update(playerPosition: { x: number, y: number }, npcs: Map<string, { view: NPCView }>) {
		// Find closest NPC within radius
		let closestDistance = Infinity
		let closestNPC: NPCView | null = null

		npcs.forEach(({ view }) => {
			// Skip non-interactable NPCs
			if (!view.interactable) return

			const dx = view.x - playerPosition.x
			const dy = view.y - playerPosition.y
			const distance = Math.sqrt(dx * dx + dy * dy)

			if (distance <= INTERACTION_RADIUS && distance < closestDistance) {
				closestDistance = distance
				closestNPC = view
			}
		})

		// Update closest NPC
		if (closestNPC) {
			// Unhighlight previous closest NPC if different
			if (this.closestNPC && this.closestNPC.npc !== closestNPC) {
				this.closestNPC.npc.setHighlighted(false)
			}
			this.closestNPC = { npc: closestNPC, distance: closestDistance }
			closestNPC.setHighlighted(true)
		} else if (this.closestNPC) {
			// Unhighlight previous closest NPC if no NPC is in range
			this.closestNPC.npc.setHighlighted(false)
			this.closestNPC = null
		}
	}

	private handleInteraction = () => {
		if (this.closestNPC) {
			EventBus.emit(Event.NPC.CS.Interact, { npcId: this.closestNPC.npc.npcId })
		}
	}

	public destroy() {
		if (this.scene.input.keyboard) {
			this.scene.input.keyboard.off('keydown-E', this.handleInteraction)
		}
		// Unhighlight current NPC if any
		if (this.closestNPC) {
			this.closestNPC.npc.setHighlighted(false)
		}
	}
} 