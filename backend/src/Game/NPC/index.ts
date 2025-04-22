import { EventManager, Event, EventClient } from '../../events'
import { NPC, NPCInteractData, NPCGoData } from './types'
import { NPCEvents } from './events'
import { Receiver } from '../../Receiver'
import { DialogueManager } from '../Dialogue'
import { PlayerJoinData, PlayerTransitionData, Position } from '../../types'
import { AffinitySentimentType } from '../Affinity/types'
import { MapManager } from '../Map'

const TO_FIX_HARDODED_MAP_ID = 'test1'
const MOVEMENT_STEP_LAG = 100

// Example NPC data
const EXAMPLE_NPC: NPC = {
	id: 'innkeeper',
	name: 'Innkeeper',
	position: { x: 100, y: 400 },
	scene: 'FarmScene',
	speed: 120,
	messages: {
		default: "Welcome to the inn!"
	}
}

const GUARD_NPC: NPC = {
	id: 'guard',
	name: 'Guard',
	position: { x: 300, y: 400 },
	scene: 'FarmScene',
	speed: 160,
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
	private movementTimeouts: Map<string, NodeJS.Timeout> = new Map()

	constructor(
		private event: EventManager,
		private dialogueManager: DialogueManager,
		private mapManager: MapManager
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

		// Handle NPC movement
		this.event.on<NPCGoData>(NPCEvents.SS.Go, (data) => {
			this.handleGoEvent(data)
		})
	}

	private getSceneNPCs(scene: string): NPC[] {
		return Array.from(this.npcs.values()).filter(npc => npc.scene === scene)
	}

	private scheduleNPCMovement(npcId: string, delay: number) {
		// Clear any existing timeout for this NPC
		this.clearNPCMovement(npcId)

		// Schedule new movement
		const timeout = setTimeout(() => {
			this.processNPCMovement(npcId)
		}, delay)

		this.movementTimeouts.set(npcId, timeout)
	}

	private clearNPCMovement(npcId: string) {
		const timeout = this.movementTimeouts.get(npcId)
		if (timeout) {
			clearTimeout(timeout)
			this.movementTimeouts.delete(npcId)
		}
	}

	private processNPCMovement(npcId: string) {
		const npc = this.npcs.get(npcId)
		if (!npc || !npc.path || npc.path.length === 0) return

		const nextPosition = npc.path[0]
		const dx = nextPosition.x - npc.position.x
		const dy = nextPosition.y - npc.position.y
		const distance = Math.sqrt(dx * dx + dy * dy)

		// Calculate time until next movement based on distance and speed
		const timeToNextMove = (distance / npc.speed) * 1000 // Convert to milliseconds

		// Move to next position
		npc.position = nextPosition
		npc.path = npc.path.slice(1)

		// Emit position update
		this.event.emit(Receiver.Group, NPCEvents.SC.Go, {
			npcId: npc.id,
			position: npc.position
		}, npc.scene)

		// If there's more path, schedule next movement
		if (npc.path.length > 0) {
			this.scheduleNPCMovement(npcId, timeToNextMove + MOVEMENT_STEP_LAG)
		} else {
			// No more path, clear movement timeout
			this.clearNPCMovement(npcId)
		}
	}

	private handleGoEvent(data: NPCGoData) {
		const npc = this.npcs.get(data.npcId)
		if (!npc) return

		let targetPosition: Position | undefined

		if (data.spotName) {
			const spot = this.mapManager.getNPCSpot(TO_FIX_HARDODED_MAP_ID, data.npcId, data.spotName)
			if (spot) {
				targetPosition = spot.position
			}
		} else if (data.position) {
			targetPosition = data.position
		}

		if (!targetPosition) return

		const path = this.mapManager.findPath(TO_FIX_HARDODED_MAP_ID, npc.position, targetPosition)
		if (path) {
			npc.path = path
			// Schedule immediate movement
			this.scheduleNPCMovement(npc.id, 0)
		}
	}

	public addNPC(npc: NPC) {
		this.npcs.set(npc.id, npc)
	}

	public removeNPC(npcId: string) {
		this.clearNPCMovement(npcId)
		this.npcs.delete(npcId)
	}

	public getNPC(npcId: string): NPC | undefined {
		return this.npcs.get(npcId)
	}

	public cleanup() {
		// Clear all movement timeouts
		for (const timeout of this.movementTimeouts.values()) {
			clearTimeout(timeout)
		}
		this.movementTimeouts.clear()
	}
} 