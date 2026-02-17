import { EventManager, Event, EventClient } from '../events'
import { NPC, NPCInteractData, NPCGoData, NPCRoutine, NPCRoutineStep } from './types'
import { NPCEvents } from './events'
import { MovementEvents } from '../Movement/events'
import type { MoveTargetType } from '../Movement/types'
import { Receiver } from '../Receiver'
import type { DialogueManager } from '../Dialogue'
import { PlayerJoinData, PlayerTransitionData, Position } from '../types'
import { AffinitySentimentType } from '../Affinity/types'
import type { MapManager } from '../Map'
import type { TimeManager } from '../Time'
import { DialogueEvents } from '../Dialogue/events'
import { DialogueContinueData } from '../Dialogue/types'
import { NPCState } from './types'
import type { QuestManager } from '../Quest'
import type { MovementManager } from '../Movement'
import { MovementEntity } from '../Movement'
import { Logger } from '../Logs'
import { BaseManager } from '../Managers'
import { SimulationEvents } from '../Simulation/events'
import type { SimulationTickData } from '../Simulation/types'
import type { NPCSnapshot } from '../state/types'

export interface NPCDeps {
	event: EventManager
	dialogue: DialogueManager
	map: MapManager
	time: TimeManager
	quest: QuestManager
	movement: MovementManager
}

export class NPCManager extends BaseManager<NPCDeps> {
	private npcs: Map<string, NPC> = new Map()
	private pausedRoutines: Map<string, NPCRoutineStep> = new Map()
	private lastRoutineCheckKey: string | null = null

	constructor(
		managers: NPCDeps,
		private logger: Logger
	) {
		super(managers)
		this.setupEventHandlers()
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
				const spot = this.managers.map.getNPCSpot(npc.mapId, npc.id, npc.initialSpot)
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
				mapId: npc.mapId,
				speed: npc.speed
			}
			this.managers.movement.registerEntity(movementEntity)
		})
	}

	private setupEventHandlers() {
		this.managers.event.on(SimulationEvents.SS.Tick, this.handleSimulationSSTick)
		this.managers.event.on<PlayerJoinData>(Event.Players.CS.Join, this.handlePlayersCSJoin)
		this.managers.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, this.handlePlayersCSTransitionTo)
		this.managers.event.on<NPCInteractData>(NPCEvents.CS.Interact, this.handleNPCCSInteract)
		this.managers.event.on<NPCGoData>(NPCEvents.SS.Go, this.handleNPCSSGo)
		this.managers.event.on(MovementEvents.SS.StepComplete, this.handleMovementSSStepComplete)
		this.managers.event.on(MovementEvents.SS.PathComplete, this.handleMovementSSPathComplete)
		this.managers.event.on<DialogueContinueData>(DialogueEvents.SC.End, this.handleDialogueSCEnd)
		this.managers.event.on(NPCEvents.SS.SetAttribute, this.handleNPCSSSetAttribute)
		this.managers.event.on(NPCEvents.SS.RemoveAttribute, this.handleNPCSSRemoveAttribute)
	}

	/* EVENT HANDLERS */
	private readonly handleSimulationSSTick = (data: SimulationTickData): void => {
		this.handleSimulationTick(data)
	}

	private readonly handlePlayersCSJoin = (data: PlayerJoinData, client: EventClient): void => {
		this.sendMapNPCsToClient(data.mapId, client, true)
	}

	private readonly handlePlayersCSTransitionTo = (data: PlayerTransitionData, client: EventClient): void => {
		this.sendMapNPCsToClient(data.mapId, client, false)
	}

	private readonly handleNPCCSInteract = (data: NPCInteractData, client: EventClient): void => {
		this.handleNPCInteraction(data, client)
	}

	private readonly handleNPCSSGo = (data: NPCGoData): void => {
		this.handleNPCGo(data)
	}

	private readonly handleMovementSSStepComplete = (data: { entityId: string, position: Position }): void => {
		const npc = this.npcs.get(data.entityId)
		if (npc) {
			npc.position = data.position
		}
	}

	private readonly handleMovementSSPathComplete = (data: { entityId: string, targetType?: MoveTargetType, targetId?: string }): void => {
		const npc = this.npcs.get(data.entityId)
		if (npc && npc.state === NPCState.Moving) {
			npc.state = NPCState.Idle
			const finalPosition = this.managers.movement.getEntityPosition(data.entityId)
			if (finalPosition) {
				npc.position = finalPosition
			}
		}
	}

	private readonly handleDialogueSCEnd = (data: DialogueContinueData): void => {
		const activeDialogues = this.managers.dialogue.getNPCActiveDialogues(data.dialogueId)
		if (activeDialogues.length === 0) {
			const pausedStep = this.pausedRoutines.get(data.dialogueId)
			if (pausedStep) {
				const currentTime = this.managers.time.getFormattedTime()
				if (currentTime === pausedStep.time) {
					this.executeRoutineStep(data.dialogueId, pausedStep)
				}
				this.pausedRoutines.delete(data.dialogueId)
			}
		}
	}

	private readonly handleNPCSSSetAttribute = (data: { npcId: string, name: string, value: any }, _client: EventClient): void => {
		this.setNPCAttribute(data.npcId, data.name, data.value)
	}

	private readonly handleNPCSSRemoveAttribute = (data: { npcId: string, name: string }, _client: EventClient): void => {
		this.removeNPCAttribute(data.npcId, data.name)
	}

	/* METHODS */
	private sendMapNPCsToClient(mapId: string, client: EventClient, logJoin: boolean): void {
		const mapNPCs = this.getMapNPCs(mapId)
		if (logJoin) {
			this.logger.debug('ON PLAYER JOIN', this.npcs)
		}
		if (mapNPCs.length > 0) {
			client.emit(Receiver.Sender, NPCEvents.SC.List, { npcs: mapNPCs })
		}
	}

	private handleSimulationTick(_data: SimulationTickData): void {
		const currentKey = this.managers.time.getFormattedTime()
		if (currentKey === this.lastRoutineCheckKey) {
			return
		}
		this.lastRoutineCheckKey = currentKey
		this.checkAllRoutines()
	}

	public getMapNPCs(mapId: string): NPC[] {
		return Array.from(this.npcs.values()).filter(npc => npc.mapId === mapId && npc.active !== false)
	}

	private handleGoEvent(data: NPCGoData) {
		const npc = this.npcs.get(data.npcId)
		if (!npc || !npc.active) return

		let targetPosition: Position | undefined

		if (data.spotName) {
			const spot = this.managers.map.getNPCSpot(npc.mapId, data.npcId, data.spotName)
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
		this.managers.movement.moveToPosition(npc.id, targetPosition, {
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
		if (npc.state === undefined) {
			npc.state = NPCState.Idle
		}

		if (npc.active === undefined) {
			npc.active = true
		}

		this.npcs.set(npc.id, npc)

		// Register NPC with MovementManager
		const movementEntity: MovementEntity = {
			id: npc.id,
			position: npc.position,
			mapId: npc.mapId,
			speed: npc.speed
		}
		this.managers.movement.registerEntity(movementEntity)

		if (npc.active !== false) {
			this.managers.event.emit(Receiver.Group, NPCEvents.SC.Spawn, { npc }, npc.mapId)
		}
	}

	public removeNPC(npcId: string) {
		const npc = this.npcs.get(npcId)
		if (!npc) {
			return
		}

		// Unregister from MovementManager
		this.managers.movement.unregisterEntity(npcId)
		this.npcs.delete(npcId)

		if (npc.active !== false) {
			this.managers.event.emit(Receiver.Group, NPCEvents.SC.Despawn, { npc }, npc.mapId)
		}
	}

	public getNPC(npcId: string): NPC | undefined {
		return this.npcs.get(npcId)
	}

	private checkAllRoutines() {
		const currentTime = this.managers.time.getFormattedTime()

		for (const npc of this.npcs.values()) {
			if (npc.routine && npc.active) {
				const currentStep = npc.routine.steps.find(step => step.time === currentTime)
				if (currentStep) {
					// Check if NPC is in conversation
					const activeDialogues = this.managers.dialogue.getNPCActiveDialogues(npc.id)
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
			this.managers.event.emit(Receiver.Group, NPCEvents.SC.Action, {
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
			this.managers.movement.unregisterEntity(npcId)
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
		const didTriggerDialogue = this.managers.dialogue.triggerDialogue(client, npc.id)
		
		// Check quest completion conditions for all active quests involving this NPC
		this.managers.quest.checkQuestsForNPCInteraction(npc.id, client.id, client)

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

	serialize(): NPCSnapshot {
		return {
			npcs: Array.from(this.npcs.values()).map(npc => ({
				...npc,
				position: { ...npc.position },
				attributes: npc.attributes ? { ...npc.attributes } : undefined
			})),
			pausedRoutines: Array.from(this.pausedRoutines.entries()).map(([npcId, step]) => ([
				npcId,
				{ ...step }
			])),
			lastRoutineCheckKey: this.lastRoutineCheckKey
		}
	}

	deserialize(state: NPCSnapshot): void {
		this.npcs.clear()
		this.pausedRoutines.clear()
		this.lastRoutineCheckKey = state.lastRoutineCheckKey

		for (const npc of state.npcs) {
			const restored: NPC = {
				...npc,
				position: { ...npc.position },
				attributes: npc.attributes ? { ...npc.attributes } : undefined
			}
			this.npcs.set(restored.id, restored)
			this.managers.movement.registerEntity({
				id: restored.id,
				position: restored.position,
				mapId: restored.mapId,
				speed: restored.speed
			})
		}

		for (const [npcId, step] of state.pausedRoutines) {
			this.pausedRoutines.set(npcId, { ...step })
		}
	}

	reset(): void {
		this.npcs.clear()
		this.pausedRoutines.clear()
		this.lastRoutineCheckKey = null
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
			this.managers.movement.cancelMovement(npcId)
			this.pausedRoutines.delete(npcId)
		}

		// Notify all players in the map about the NPC state change
		this.managers.event.emit(Receiver.Group, active ? NPCEvents.SC.Spawn : NPCEvents.SC.Despawn, { 
			npc 
		}, npc.mapId)
	}
} 
