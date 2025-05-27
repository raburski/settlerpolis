import { Scene } from 'phaser'
import { EventBus } from '../EventBus'
import { Event, NPC } from '@rugged/game'
import { NPCView } from '../entities/NPC/View'
import { NPCController } from '../entities/NPC/Controller'
import { tutorialService, TutorialFlag } from './TutorialService'

const INTERACTION_RADIUS = 100 // pixels

export class NPCProximityService {
	private closestNPC: { npc: NPCView, distance: number } | null = null
	private npcControllers: Map<string, NPCController> = new Map()

	constructor(private scene: Scene) {
		// No initialization in constructor
	}

	public initialize() {
		// Set up keyboard input
		this.scene.input.keyboard.on('keydown-E', this.handleInteraction)
	}

	public update(playerPosition: { x: number, y: number }, npcs: Map<string, NPCController>) {
		// Find closest NPC within radius
		let closestDistance = Infinity
		let closestNPC: NPCView | null = null

		npcs.forEach((controller) => {
			// Skip non-interactable NPCs
			if (!controller.npc.interactable) return

			const dx = controller.view.x - playerPosition.x
			const dy = controller.view.y - playerPosition.y
			const distance = Math.sqrt(dx * dx + dy * dy)

			if (distance <= INTERACTION_RADIUS && distance < closestDistance) {
				closestDistance = distance
				closestNPC = controller.view
			}

			// Store controller reference
			this.npcControllers.set(controller.npc.id, controller)
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
			const controller = this.npcControllers.get(this.closestNPC.npc.npcId)
			if (controller) {
				// Use the controller's interaction method
				controller.handleInteraction()
			}
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
		// Clear controllers map
		this.npcControllers.clear()
	}
} 