import { StateTransition } from './types'
import { SettlerState } from '../types'
import { Position } from '../../types'

export interface IdleWanderContext {
	targetPosition: Position
}

/**
 * Idle wandering transition - moves settler to a random nearby position
 * This transition keeps the settler in Idle state but makes them move around
 */
export const Idle_Idle: StateTransition<IdleWanderContext> = {
	condition: (settler, context) => {
		// Only wander if settler has no job assignment
		return settler.state === SettlerState.Idle && !settler.currentJob && !settler.stateContext.jobId
	},
	
	validate: (settler, context, managers) => {
		// Verify target position is provided
		if (!context.targetPosition) {
			return false
		}
		
		// Validate path exists and is not too long (max 6 tiles = ~192px at 32px/tile)
		const path = managers.mapManager.findPath(
			settler.mapName,
			settler.position,
			context.targetPosition
		)
		
		if (!path || path.length === 0) {
			return false
		}
		
		// Max path length: 6 tiles (to ensure short wander movements)
		const MAX_WANDER_PATH_LENGTH = 6
		if (path.length > MAX_WANDER_PATH_LENGTH) {
			return false
		}
		
		return true
	},
	
	action: (settler, context, managers) => {
		const now = Date.now()
		managers.logger.log(`[IDLE WANDER] Idle -> Idle | settler=${settler.id} | from=(${Math.round(settler.position.x)},${Math.round(settler.position.y)}) | to=(${Math.round(context.targetPosition.x)},${Math.round(context.targetPosition.y)})`)
		
		// Update state context with target position and set wander timestamp (but keep state as Idle)
		settler.stateContext = {
			targetPosition: context.targetPosition,
			lastIdleWanderTime: now // Set timestamp when movement starts
		}
		
		// Start movement to random position (no targetType/targetId - just wandering)
		const movementStarted = managers.movementManager.moveToPosition(settler.id, context.targetPosition, {})
		managers.logger.log(`[IDLE WANDER] Movement requested: settler=${settler.id} | movementStarted=${movementStarted}`)
		
		// Ensure state remains Idle (self-transition)
		settler.state = SettlerState.Idle
	},
	
	completed: (settler, managers) => {
		// Clear target position but preserve lastIdleWanderTime
		const lastIdleWanderTime = settler.stateContext.lastIdleWanderTime
		settler.stateContext = {
			lastIdleWanderTime: lastIdleWanderTime // Preserve cooldown tracking
		}
		
		// Stay in Idle state (return null/undefined to not trigger another transition)
		return null
	}
}

