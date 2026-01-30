import { Settler, SettlerState } from './types'
import { StateTransitionsConfig, StateTransition, StateMachineManagers } from './transitions/types'
import { SETTLER_STATE_TRANSITIONS } from './transitions'
import { Receiver } from '../Receiver'
import { PopulationEvents } from './events'

export class SettlerStateMachine {
	private transitions: StateTransitionsConfig
	private managers: StateMachineManagers
	private activeTransitions: Map<string, { fromState: SettlerState, toState: SettlerState }> = new Map() // Track active transitions by settlerId
	
	constructor(
		managers: StateMachineManagers,
		transitions: StateTransitionsConfig = SETTLER_STATE_TRANSITIONS
	) {
		// Store managers for use in transition actions
		this.managers = managers
		
		// Store transitions configuration
		this.transitions = transitions
	}
	
	/**
	 * Attempt to execute a state transition
	 * @param settler The settler to transition
	 * @param toState The target state to transition to
	 * @param context Context data for the transition
	 * @returns true if transition was successful, false otherwise
	 */
	executeTransition<TContext = any>(
		settler: Settler,
		toState: SettlerState,
		context: TContext
	): boolean {
		const fromState = settler.state
		const timestamp = Date.now()
		
		this.managers.logger.log(`[TRANSITION EXECUTE] settler=${settler.id} | from=${fromState} | to=${toState} | jobId=${(context as any)?.jobId || settler.stateContext.jobId || 'none'} | hasActiveTransition=${this.activeTransitions.has(settler.id)} | time=${timestamp}`)
		
		// Get all possible transitions from current state
		const fromStateTransitions = this.transitions[fromState]
		if (!fromStateTransitions) {
			this.managers.logger.warn(`No transitions defined from state ${fromState}`)
			return false
		}
		
		// Get transition to target state
		const targetTransition = fromStateTransitions[toState] as StateTransition<TContext> | undefined
		if (!targetTransition) {
			this.managers.logger.warn(`No transition found from ${fromState} to ${toState}`)
			return false
		}
		
		// Check condition (if provided)
		if (targetTransition.condition && !targetTransition.condition(settler, context, this.managers)) {
			this.managers.logger.debug(`Condition not met for transition ${fromState} -> ${toState}`)
			return false
		}
		
		// Validate (if provided)
		if (targetTransition.validate && !targetTransition.validate(settler, context, this.managers)) {
			this.managers.logger.warn(`Validation failed for transition ${fromState} -> ${toState}`)
			return false
		}
		
		// Execute transition action
		try {
			const previousState = settler.state
			const actionStartTime = Date.now()
			this.managers.logger.log(`[TRANSITION ACTION] settler=${settler.id} | ${fromState} -> ${toState} | hasCompleted=${!!targetTransition.completed} | time=${actionStartTime}`)
			targetTransition.action(settler, context, this.managers)
			
			// Verify state was updated correctly
			if (settler.state !== toState) {
				this.managers.logger.warn(`[TRANSITION STATE MISMATCH] settler=${settler.id} | expected=${toState} | actual=${settler.state}`)
				return false
			}
			
			// Track active transition if it has a completed callback (movement-based transitions)
			if (targetTransition.completed) {
				this.activeTransitions.set(settler.id, { fromState: previousState, toState })
				this.managers.logger.log(`[TRANSITION TRACKED] settler=${settler.id} | ${previousState} -> ${toState} | awaiting movement completion`)
			} else {
				this.managers.logger.debug(`No active transition tracking (no completed callback)`)
			}
			
			const actionDuration = Date.now() - actionStartTime
			
			// Get current position from MovementManager (source of truth during movement)
			// This ensures we send the correct position even if settler.position hasn't been synced yet
			const currentPosition = this.managers.movement.getEntityPosition(settler.id)
			if (currentPosition) {
				settler.position = currentPosition
				this.managers.logger.log(`[POSITION SYNC] Synced settler position from MovementManager: settler=${settler.id} | position=(${Math.round(currentPosition.x)},${Math.round(currentPosition.y)})`)
			}
			
			// Emit settler updated event after successful transition
			this.managers.event.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
				settler
			}, settler.mapName)
			
			this.managers.logger.log(`[TRANSITION SUCCESS] settler=${settler.id} | ${previousState} -> ${settler.state} | duration=${actionDuration}ms | position=(${Math.round(settler.position.x)},${Math.round(settler.position.y)}) | time=${Date.now()}`)
			return true
		} catch (error) {
			this.managers.logger.error(`[TRANSITION ERROR] settler=${settler.id} | ${fromState} -> ${toState} | error:`, error)
			return false
		}
	}
	
	/**
	 * Handle completion of a movement-based transition
	 * Called when movement/path completes
	 * @param settler The settler whose movement completed
	 * @returns true if a transition was executed, false otherwise
	 */
	completeTransition(settler: Settler): boolean {
		const timestamp = Date.now()
		this.managers.logger.log(`[COMPLETE TRANSITION] settler=${settler.id} | currentState=${settler.state} | time=${timestamp}`)
		
		const activeTransition = this.activeTransitions.get(settler.id)
		if (!activeTransition) {
			this.managers.logger.debug(`[COMPLETE TRANSITION] No active transition found for settler ${settler.id} - movement completed but no transition waiting`)
			// No active transition with completion handler
			return false
		}
		
		this.managers.logger.log(`[COMPLETE TRANSITION] Found active transition: ${activeTransition.fromState} -> ${activeTransition.toState} for settler ${settler.id}`)
		
		// Get the transition that was active
		const fromStateTransitions = this.transitions[activeTransition.fromState]
		if (!fromStateTransitions) {
			this.managers.logger.warn(`[COMPLETE TRANSITION ERROR] No transitions from ${activeTransition.fromState}`)
			this.activeTransitions.delete(settler.id)
			return false
		}
		
		const transition = fromStateTransitions[activeTransition.toState]
		if (!transition || !transition.completed) {
			this.managers.logger.warn(`[COMPLETE TRANSITION ERROR] No completed callback for transition ${activeTransition.fromState} -> ${activeTransition.toState}`)
			this.activeTransitions.delete(settler.id)
			return false
		}
		
		// Call completed callback to get next state
		const callbackStartTime = Date.now()
		this.managers.logger.log(`[COMPLETED CALLBACK] Calling completed callback for ${activeTransition.fromState} -> ${activeTransition.toState} | settler=${settler.id} | time=${callbackStartTime}`)
		const nextState = transition.completed(settler, this.managers)
		const callbackDuration = Date.now() - callbackStartTime
		this.managers.logger.log(`[COMPLETED CALLBACK] Callback returned nextState=${nextState || 'null'} | duration=${callbackDuration}ms | settler=${settler.id}`)
		
		// Clear active transition tracking
		this.activeTransitions.delete(settler.id)
		this.managers.logger.debug(`Cleared active transition for ${settler.id}`)
		
		// If nextState is provided, execute transition to it
		if (nextState) {
			// Pass stateContext as context - let it accumulate and transitions can use what they need
			// This is simpler than selectively creating context based on nextState
			const context = { ...settler.stateContext }
			this.managers.logger.log(`[COMPLETE TRANSITION] Executing next transition to ${nextState} | settler=${settler.id} | time=${Date.now()}`)
			return this.executeTransition(settler, nextState, context)
		}
		
		this.managers.logger.log(`[COMPLETE TRANSITION] No next state returned, transition complete | settler=${settler.id} | time=${Date.now()}`)
		return false
	}
	
	/**
	 * Get all valid transitions for a settler's current state
	 */
	getValidTransitions(settler: Settler): Array<{ toState: SettlerState, transition: StateTransition }> {
		const fromStateTransitions = this.transitions[settler.state]
		if (!fromStateTransitions) {
			return []
		}
		
		const validTransitions: Array<{ toState: SettlerState, transition: StateTransition }> = []
		for (const [toState, transition] of Object.entries(fromStateTransitions) as [SettlerState, StateTransition][]) {
			validTransitions.push({ toState, transition })
		}
		return validTransitions
	}
	
	/**
	 * Check if a transition is valid from one state to another
	 */
	isValidTransition(from: SettlerState, to: SettlerState): boolean {
		const fromStateTransitions = this.transitions[from]
		if (!fromStateTransitions) {
			return false
		}
		
		return fromStateTransitions[to] !== undefined
	}
	
	/**
	 * Get transition definition by from and to states
	 */
	getTransition(from: SettlerState, to: SettlerState): StateTransition | undefined {
		const fromStateTransitions = this.transitions[from]
		if (!fromStateTransitions) {
			return undefined
		}
		
		return fromStateTransitions[to]
	}
}
