import { EventManager, Event, EventClient } from '../events'
import { NPC, NPCInteractData, NPCGoData, NPCRoutine, NPCRoutineStep } from './types'
import { NPCEvents } from './events'
import { Receiver } from '../Receiver'
import { DialogueManager } from '../Dialogue'
import { PlayerJoinData, PlayerTransitionData, Position } from '../types'
import { AffinitySentimentType } from '../Affinity/types'
import { MapManager } from '../Map'
import { TimeManager } from '../Time'
import { DialogueEvents } from '../Dialogue/events'
import { DialogueContinueData } from '../Dialogue/types'
import { NPCState } from './types'

const MOVEMENT_STEP_LAG = 100
const ROUTINE_CHECK_INTERVAL = 60000 // Check routines every minute

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
		private timeManager: TimeManager
	) {
		this.setupEventHandlers()
		this.startRoutineCheck()
	}

	public loadNPCs(npcs: NPC[]) {
		npcs.forEach(npc => {
			// Set default state to Idle if not provided
			if (npc.state === undefined) {
				npc.state = NPCState.Idle
			}
			
			// Set default active state to true if not provided
			if (npc.active === undefined) {
				npc.active = true
			}
			
			// Check if NPC has an initialSpot defined
			if (npc.initialSpot) {
				// Try to get the spot from the map manager
				const spot = this.mapManager.getNPCSpot(npc.mapId, npc.id, npc.initialSpot)
				if (spot) {
					// Update the NPC's position with the spot position
					npc.position = { ...spot.position }
					// Set the currentSpot based on initialSpot
					npc.currentSpot = npc.initialSpot
				}
			}
			
			this.npcs.set(npc.id, npc)
		})
	}

	private setupEventHandlers() {
		// Send NPCs list when player joins or transitions to a map
		this.event.on<PlayerJoinData>(Event.Players.CS.Join, (data: PlayerJoinData, client: EventClient) => {
			const mapNPCs = this.getMapNPCs(data.mapId)
			console.log('ON PLAYER JOIN', this.npcs)
			if (mapNPCs.length > 0) {
				client.emit(Receiver.Sender, NPCEvents.SC.List, { npcs: mapNPCs })
			}
		})

		this.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, (data: PlayerTransitionData, client: EventClient) => {
			const mapNPCs = this.getMapNPCs(data.mapId)
			if (mapNPCs.length > 0) {
				client.emit(Receiver.Sender, NPCEvents.SC.List, { npcs: mapNPCs })
			}
		})

		// Handle NPC interactions
		this.event.on<NPCInteractData>(NPCEvents.CS.Interact, (data, client) => {
			this.handleNPCInteraction(data, client)
		})

		// Handle NPC movement
		this.event.on<NPCGoData>(NPCEvents.SS.Go, (data) => {
			this.handleNPCGo(data)
		})

		// Handle dialogue end to resume routines
		this.event.on<DialogueContinueData>(DialogueEvents.SC.End, (data, client) => {
			const activeDialogues = this.dialogueManager.getNPCActiveDialogues(data.dialogueId)
			if (activeDialogues.length === 0) {
				const pausedStep = this.pausedRoutines.get(data.dialogueId)
				if (pausedStep) {
					// Check if we should execute the paused step now
					const currentTime = this.timeManager.getFormattedTime()
					if (currentTime === pausedStep.time) {
						this.executeRoutineStep(data.dialogueId, pausedStep)
					}
					this.pausedRoutines.delete(data.dialogueId)
				}
				
				// No longer setting NPC state after dialogue ends
			}
		})
		
		// Handle NPC attribute set event
		this.event.on(NPCEvents.SS.SetAttribute, (data: { npcId: string, name: string, value: any }, client: EventClient) => {
			this.setNPCAttribute(data.npcId, data.name, data.value)
			
			// Note: Instead of sending a specific attribute update event,
			// clients will get updated attributes when they refresh NPCs
			// or through other existing events
		})
		
		// Handle NPC attribute remove event
		this.event.on(NPCEvents.SS.RemoveAttribute, (data: { npcId: string, name: string }, client: EventClient) => {
			this.removeNPCAttribute(data.npcId, data.name)
			
			// No specific attribute update event
		})
	}

	private getMapNPCs(mapId: string): NPC[] {
		return Array.from(this.npcs.values()).filter(npc => npc.mapId === mapId)
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
		}, npc.mapId)

		// If there's more path, schedule next movement
		if (npc.path.length > 0) {
			this.scheduleNPCMovement(npcId, timeToNextMove + MOVEMENT_STEP_LAG)
		} else {
			// No more path, clear movement timeout
			this.clearNPCMovement(npcId)
			
			// Update state to Idle when movement is complete
			if (npc.state === NPCState.Moving) {
				npc.state = NPCState.Idle
				
				// State changes are now part of the NPC data structure
				// Clients will see the updated state when refreshing NPCs
			}
		}
	}

	private handleGoEvent(data: NPCGoData) {
		const npc = this.npcs.get(data.npcId)
		if (!npc || !npc.active) return

		let targetPosition: Position | undefined

		if (data.spotName) {
			const spot = this.mapManager.getNPCSpot(npc.mapId, data.npcId, data.spotName)
			if (spot) {
				targetPosition = spot.position
				// Save the current spot name for future reference
				npc.currentSpot = data.spotName
			}
		} else if (data.position) {
			targetPosition = data.position
			// Clear the current spot name as we're moving to a raw position
			npc.currentSpot = undefined
		}

		if (!targetPosition) return

		const path = this.mapManager.findPath(npc.mapId, npc.position, targetPosition)
		if (path) {
			npc.path = path
			// Update NPC state to Moving
			npc.state = NPCState.Moving
			
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
		const currentTime = this.timeManager.getFormattedTime()

		for (const npc of this.npcs.values()) {
			if (npc.routine && npc.active) {
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
			}, npc.mapId)
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

	public updateNPC(npcId: string, updates: Partial<NPC>) {
		const npc = this.npcs.get(npcId)
		if (!npc) return
		
		// Apply updates, handling complex objects like attributes properly
		Object.entries(updates).forEach(([key, value]) => {
			if (key === 'attributes' && npc.attributes) {
				// Ensure value is a non-null object before spreading
				if (value && typeof value === 'object') {
					// Merge attributes rather than replace
					npc.attributes = { ...npc.attributes, ...value }
				} else {
					console.warn(`Attempted to spread non-object value for NPC ${npcId} attributes`)
				}
			} else {
				// @ts-ignore - Generic update
				npc[key] = value
			}
		})
	}
	
	/**
	 * Get NPC attribute value
	 */
	public getNPCAttribute(npcId: string, attributeName: string): any | undefined {
		const npc = this.npcs.get(npcId)
		if (!npc || !npc.attributes) return undefined
		return npc.attributes[attributeName]
	}
	
	/**
	 * Set NPC attribute value
	 */
	public setNPCAttribute(npcId: string, attributeName: string, value: any) {
		const npc = this.npcs.get(npcId)
		if (!npc) return
		
		// Initialize attributes if not present
		if (!npc.attributes) {
			npc.attributes = {}
		}
		
		npc.attributes[attributeName] = value
	}
	
	/**
	 * Remove NPC attribute
	 */
	public removeNPCAttribute(npcId: string, attributeName: string) {
		const npc = this.npcs.get(npcId)
		if (!npc || !npc.attributes) return
		
		delete npc.attributes[attributeName]
	}

	private handleNPCInteraction(data: NPCInteractData, client: EventClient) {
		const npc = this.npcs.get(data.npcId)
		if (!npc || !npc.active) return

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
			
			client.emit(Receiver.Sender, NPCEvents.SC.Message, {
				npcId: npc.id,
				message
			})
		}
	}
	
	private handleNPCGo(data: NPCGoData) {
		this.handleGoEvent(data)
	}

	/**
	 * Set an NPC's state
	 */
	public setNPCState(npcId: string, state: NPCState) {
		const npc = this.npcs.get(npcId)
		if (!npc) return
		
		// Only accept Idle or Moving states for now
		if (state !== NPCState.Idle && state !== NPCState.Moving) return
		
		// Update state
		npc.state = state
	}

	/**
	 * Set NPC active state and notify all players in the map
	 */
	public setNPCActive(npcId: string, active: boolean) {
		const npc = this.npcs.get(npcId)
		if (!npc) return

		// Update active state
		npc.active = active

		// If NPC is being deactivated, clear any ongoing movement or routines
		if (!active) {
			this.clearNPCMovement(npcId)
			this.pausedRoutines.delete(npcId)
		}

		// Notify all players in the map about the NPC state change
		this.event.emit(Receiver.Group, active ? NPCEvents.SC.Spawn : NPCEvents.SC.Despawn, { 
			npc 
		}, npc.mapId)
	}
} 