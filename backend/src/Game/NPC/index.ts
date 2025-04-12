import { EventManager, Event, EventClient } from '../../events'
import { NPC, NPCInteractData } from './types'
import { NPCEvents } from './events'
import { Receiver } from '../../Receiver'
import { DialogueManager } from '../Dialogue'
import { PlayerJoinData, PlayerTransitionData } from '../../types'

// Example NPC data
const EXAMPLE_NPC: NPC = {
	id: 'innkeeper',
	name: 'Innkeeper',
	position: { x: 100, y: 400 },
	scene: 'FarmScene',
	messages: {
		default: "Welcome to the inn!"
	}
}

const GUARD_NPC: NPC = {
	id: 'guard',
	name: 'Guard',
	position: { x: 300, y: 400 },
	scene: 'FarmScene',
	messages: {
		default: "Move along, citizen. Nothing to see here.",
		conditions: [
			{
				check: () => {
					const hour = new Date().getHours()
					return hour >= 20 || hour < 6
				},
				message: "It's dangerous to wander around at night. Be careful!"
			}
		]
	}
}

export class NPCManager {
	private npcs: Map<string, NPC> = new Map()

	constructor(
		private event: EventManager,
		private dialogueManager: DialogueManager
	) {
		// Add example NPCs
		this.npcs.set(EXAMPLE_NPC.id, EXAMPLE_NPC)
		this.npcs.set(GUARD_NPC.id, GUARD_NPC)
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		// Send NPCs list when player joins or transitions to a scene
		this.event.on<PlayerJoinData>(Event.Players.CS.Join, (data: PlayerJoinData, client: EventClient) => {
			const sceneNPCs = this.getSceneNPCs(data.scene)
			if (sceneNPCs.length > 0) {
				client.emit(Receiver.Sender, NPCEvents.SC.List, { npcs: sceneNPCs })
			}
		})

		this.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, (data: PlayerTransitionData, client: EventClient) => {
			const sceneNPCs = this.getSceneNPCs(data.scene)
			if (sceneNPCs.length > 0) {
				client.emit(Receiver.Sender, NPCEvents.SC.List, { npcs: sceneNPCs })
			}
		})

		// Handle NPC interactions
		this.event.on<NPCInteractData>(Event.NPC.CS.Interact, (data, client) => {
			const npc = this.npcs.get(data.npcId)
			if (!npc) return

			// Try to trigger dialogue first
			const didTriggerDialogue = this.dialogueManager.triggerDialogue(client, npc.id)
			if (didTriggerDialogue) return

			// If no dialogue was triggered, fall back to messages
			if (npc.messages) {
				let message = npc.messages.default
				
				// Check conditions in order
				if (npc.messages.conditions) {
					for (const condition of npc.messages.conditions) {
						if (condition.check()) {
							message = condition.message
							break
						}
					}
				}
				
				client.emit(Receiver.Sender, Event.NPC.SC.Message, {
					npcId: npc.id,
					message
				})
			}
		})
	}

	private getSceneNPCs(scene: string): NPC[] {
		return Array.from(this.npcs.values()).filter(npc => npc.scene === scene)
	}
} 