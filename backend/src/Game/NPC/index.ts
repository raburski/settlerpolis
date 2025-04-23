import { EventManager, Event, EventClient } from '../../events'
import { NPC, NPCInteractData, NPCGoData, NPCRoutine, NPCRoutineStep } from './types'
import { NPCEvents } from './events'
import { Receiver } from '../../Receiver'
import { DialogueManager } from '../Dialogue'
import { PlayerJoinData, PlayerTransitionData, Position } from '../../types'
import { AffinitySentimentType } from '../Affinity/types'
import { MapManager } from '../Map'
import { WorldManager } from '../World'
import { DialogueEvents } from '../Dialogue/events'
import { DialogueContinueData } from '../Dialogue/types'

const TO_FIX_HARDODED_MAP_ID = 'test1'
const MOVEMENT_STEP_LAG = 100
const ROUTINE_CHECK_INTERVAL = 60000 // Check routines every minute

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
	},
	routine: {
		steps: [
			{ time: '00:00', spot: 'stand1', action: 'stand' },
			{ time: '01:00', spot: 'stand2', action: 'stand' },
			{ time: '02:00', spot: 'stand1', action: 'stand' },
			{ time: '03:00', spot: 'stand2', action: 'stand' },
			{ time: '04:00', spot: 'stand1', action: 'stand' },
			{ time: '05:00', spot: 'stand2', action: 'stand' },
			{ time: '06:00', spot: 'stand1', action: 'stand' },
			{ time: '07:00', spot: 'stand2', action: 'stand' },
			{ time: '08:00', spot: 'stand1', action: 'stand' },
			{ time: '09:00', spot: 'stand2', action: 'stand' },
			{ time: '10:00', spot: 'stand1', action: 'stand' },
			{ time: '11:00', spot: 'stand2', action: 'stand' },
			{ time: '12:00', spot: 'stand1', action: 'stand' },
			{ time: '13:00', spot: 'stand2', action: 'stand' },
			{ time: '14:00', spot: 'stand1', action: 'stand' },
			{ time: '15:00', spot: 'stand2', action: 'stand' },
			{ time: '16:00', spot: 'stand1', action: 'stand' },
			{ time: '17:00', spot: 'stand2', action: 'stand' },
			{ time: '18:00', spot: 'stand1', action: 'stand' },
			{ time: '19:00', spot: 'stand2', action: 'stand' },
			{ time: '20:00', spot: 'stand1', action: 'stand' },
			{ time: '21:00', spot: 'stand2', action: 'stand' },
			{ time: '22:00', spot: 'stand1', action: 'stand' },
			{ time: '23:00', spot: 'stand2', action: 'stand' }
		]
	}
}

export class NPCManager {
	private npcs: Map<string, NPC> = new Map()
	private movementTimeouts: Map<string, NodeJS.Timeout> = new Map()
	private routineTimeouts: Map<string, NodeJS.Timeout> = new Map()
	private routineCheckInterval: NodeJS.Timeout | null = null
	private pausedRoutines: Map<string, NPCRoutineStep> = new Map()

	constructor(
		private event: EventManager,
		private dialogueManager: DialogueManager,
		private mapManager: MapManager,
		private worldManager: WorldManager
	) {
		// Add example NPCs
		this.npcs.set(EXAMPLE_NPC.id, EXAMPLE_NPC)
		this.npcs.set(GUARD_NPC.id, GUARD_NPC)
		this.setupEventHandlers()
		this.startRoutineCheck()
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

		// Handle dialogue end to resume routines
		this.event.on<DialogueContinueData>(DialogueEvents.SC.End, (data, client) => {
			const activeDialogues = this.dialogueManager.getNPCActiveDialogues(data.dialogueId)
			if (activeDialogues.length === 0) {
				const pausedStep = this.pausedRoutines.get(data.dialogueId)
				if (pausedStep) {
					// Check if we should execute the paused step now
					const currentTime = this.worldManager.getFormattedTime()
					if (currentTime === pausedStep.time) {
						this.executeRoutineStep(data.dialogueId, pausedStep)
					}
					this.pausedRoutines.delete(data.dialogueId)
				}
			}
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

	private startRoutineCheck() {
		if (this.routineCheckInterval) {
			clearInterval(this.routineCheckInterval)
		}
		this.routineCheckInterval = setInterval(() => {
			this.checkAllRoutines()
		}, ROUTINE_CHECK_INTERVAL)
	}

	private checkAllRoutines() {
		const currentTime = this.worldManager.getFormattedTime()

		for (const npc of this.npcs.values()) {
			if (npc.routine) {
				const currentStep = npc.routine.steps.find(step => step.time === currentTime)
				if (currentStep) {
					// Check if NPC is in conversation
					const activeDialogues = this.dialogueManager.getNPCActiveDialogues(npc.id)
					if (activeDialogues.length > 0) {
						// Pause the routine step for later
						this.pausedRoutines.set(npc.id, currentStep)
					} else {
						this.executeRoutineStep(npc.id, currentStep)
					}
				}
			}
		}
	}

	private executeRoutineStep(npcId: string, step: NPCRoutineStep) {
		const npc = this.npcs.get(npcId)
		if (!npc) return

		// Move NPC to the spot
		this.handleGoEvent({
			npcId,
			spotName: step.spot
		})

		// Update current action and emit to clients
		if (step.action) {
			npc.currentAction = step.action
			this.event.emit(Receiver.Group, NPCEvents.SC.Action, {
				npcId,
				action: step.action
			}, npc.scene)
		}
	}

	public setNPCRoutine(npcId: string, routine: NPCRoutine) {
		const npc = this.npcs.get(npcId)
		if (!npc) return

		npc.routine = routine
		// Reset current action and clear any paused routine
		npc.currentAction = undefined
		this.pausedRoutines.delete(npcId)
		this.checkAllRoutines() // Check immediately to see if any steps should be executed
	}

	public removeNPCRoutine(npcId: string) {
		const npc = this.npcs.get(npcId)
		if (npc) {
			delete npc.routine
			delete npc.currentAction
			this.pausedRoutines.delete(npcId)
		}
	}

	public cleanup() {
		// Clear all movement timeouts
		for (const timeout of this.movementTimeouts.values()) {
			clearTimeout(timeout)
		}
		this.movementTimeouts.clear()

		// Clear routine check interval
		if (this.routineCheckInterval) {
			clearInterval(this.routineCheckInterval)
		}

		// Clear paused routines
		this.pausedRoutines.clear()
	}
} 