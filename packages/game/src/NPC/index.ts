import { EventManager, Event, EventClient } from '../events'
import { NPC, NPCInteractData, NPCGoData, NPCRoutine, NPCRoutineStep } from './types'
import { NPCEvents } from './events'
import { MovementEvents } from '../Movement/events'
import { Receiver } from '../Receiver'
import { DialogueManager } from '../Dialogue'
import { PlayerJoinData, PlayerTransitionData, Position } from '../types'
import { AffinitySentimentType } from '../Affinity/types'
import { MapManager } from '../Map'
import { TimeManager } from '../Time'
import { DialogueEvents } from '../Dialogue/events'
import { DialogueContinueData } from '../Dialogue/types'
import { NPCState } from './types'
import { QuestManager } from '../Quest'
import { MovementManager, MovementEntity } from '../Movement'
import { Logger } from '../Logs'

const ROUTINE_CHECK_INTERVAL = 60000 // Check routines every minute

export class NPCManager {
	private npcs: Map<string, NPC> = new Map()
	private routineTimeouts: Map<string, NodeJS.Timeout> = new Map()
	private routineCheckInterval: NodeJS.Timeout | null = null
	private pausedRoutines: Map<string, NPCRoutineStep> = new Map()

	constructor(
		private event: EventManager,
		private dialogueManager: DialogueManager,
		private mapManager: MapManager,
		private timeManager: TimeManager,
		private questManager: QuestManager,
		private movementManager: MovementManager,
		private logger: Logger
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

			// Register NPC with MovementManager
			const movementEntity: MovementEntity = {
				id: npc.id,
				position: npc.position,
				mapName: npc.mapId,
				speed: npc.speed
			}
			this.movementManager.registerEntity(movementEntity)
		})
	}

	private setupEventHandlers() {
		// Send NPCs list when player joins or transitions to a map
		this.event.on<PlayerJoinData>(Event.Players.CS.Join, (data: PlayerJoinData, client: EventClient) => {
			const mapNPCs = this.getMapNPCs(data.mapId)
			this.logger.debug('ON PLAYER JOIN', this.npcs)
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

		// Handle NPC movement (internal server-side event)
		this.event.on<NPCGoData>(NPCEvents.SS.Go, (data) => {
			this.handleNPCGo(data)
		})

		// Listen for movement step completion to sync NPC position
		this.event.on(MovementEvents.SS.StepComplete, (data: { entityId: string, position: Position }) => {
			const npc = this.npcs.get(data.entityId)
			if (npc) {
				// Sync NPC position with MovementManager
				npc.position = data.position
			}
		})

		// Listen for movement path completion to update NPC state
		this.event.on(MovementEvents.SS.PathComplete, (data: { entityId: string, targetType?: string, targetId?: string }) => {
			const npc = this.npcs.get(data.entityId)
			if (npc && npc.state === NPCState.Moving) {
				npc.state = NPCState.Idle
				// Get final position from MovementManager
				const finalPosition = this.movementManager.getEntityPosition(data.entityId)
				if (finalPosition) {
					npc.position = finalPosition
				}
			}
			// NPCs don't use target info (they just move to positions)
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
		return Array.from(this.npcs.values()).filter(npc => npc.mapId === mapId && npc.active !== false)
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

		// Update NPC state to Moving
		npc.state = NPCState.Moving

		// Use MovementManager to move NPC
		// MovementManager will handle pathfinding and emit movement events
		// NPCManager listens to MovementEvents.SS.StepComplete to sync positions
		this.movementManager.moveToPosition(npc.id, targetPosition, {
			callbacks: {
				onPathComplete: (task: any) => {
					// Path completion is handled by MovementEvents.SS.PathComplete listener
					// which updates NPC state to Idle
					// Task is provided for potential future use (e.g., checking target info)
				}
			}
		})
	}

	public addNPC(npc: NPC) {
		this.npcs.set(npc.id, npc)

		// Register NPC with MovementManager
		const movementEntity: MovementEntity = {
			id: npc.id,
			position: npc.position,
			mapName: npc.mapId,
			speed: npc.speed
		}
		this.movementManager.registerEntity(movementEntity)
	}

	public removeNPC(npcId: string) {
		// Unregister from MovementManager
		this.movementManager.unregisterEntity(npcId)
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
		// Unregister all NPCs from MovementManager
		for (const npcId of this.npcs.keys()) {
			this.movementManager.unregisterEntity(npcId)
		}

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
					this.logger.warn(`Attempted to spread non-object value for NPC ${npcId} attributes`)
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
		
		// Check quest completion conditions for all active quests involving this NPC
		this.questManager.checkQuestsForNPCInteraction(npc.id, client.id, client)

		// If no dialogue was triggered, fall back to messages
		if (!didTriggerDialogue && npc.messages) {
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

		// Only proceed if the active state is actually changing
		if (npc.active === active) return

		// Update active state
		npc.active = active

		// If NPC is being deactivated, cancel any ongoing movement or routines
		if (!active) {
			this.movementManager.cancelMovement(npcId)
			this.pausedRoutines.delete(npcId)
		}

		// Notify all players in the map about the NPC state change
		this.event.emit(Receiver.Group, active ? NPCEvents.SC.Spawn : NPCEvents.SC.Despawn, { 
			npc 
		}, npc.mapId)
	}
} 