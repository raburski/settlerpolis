import type { NPCController } from '../entities/NPC'

const INTERACTION_RADIUS = 100

export class NPCProximityService {
	private closestNPC: { npc: any; distance: number } | null = null
	private npcControllers: Map<string, NPCController> = new Map()
	private boundKeyDown: (event: KeyboardEvent) => void

	constructor() {
		this.boundKeyDown = (event) => {
			if (event.code === 'KeyE') {
				this.handleInteraction()
			}
		}
	}

	public initialize() {
		window.addEventListener('keydown', this.boundKeyDown)
	}

	public update(playerPosition: { x: number; y: number }, npcs: Map<string, NPCController>) {
		let closestDistance = Infinity
		let closestNPC: any | null = null

		npcs.forEach((controller) => {
			if (!controller.npc.interactable) return
			const dx = controller.view.x - playerPosition.x
			const dy = controller.view.y - playerPosition.y
			const distance = Math.sqrt(dx * dx + dy * dy)

			if (distance <= INTERACTION_RADIUS && distance < closestDistance) {
				closestDistance = distance
				closestNPC = controller.view
			}

			this.npcControllers.set(controller.npc.id, controller)
		})

		if (closestNPC) {
			if (this.closestNPC && this.closestNPC.npc !== closestNPC) {
				this.closestNPC.npc.setHighlighted(false)
			}
			this.closestNPC = { npc: closestNPC, distance: closestDistance }
			closestNPC.setHighlighted(true)
		} else if (this.closestNPC) {
			this.closestNPC.npc.setHighlighted(false)
			this.closestNPC = null
		}
	}

	private handleInteraction = () => {
		if (this.closestNPC) {
			const controller = this.npcControllers.get(this.closestNPC.npc.npcId)
			controller?.handleInteraction()
		}
	}

	public destroy() {
		window.removeEventListener('keydown', this.boundKeyDown)
		if (this.closestNPC) {
			this.closestNPC.npc.setHighlighted(false)
		}
		this.npcControllers.clear()
	}
}
