import { Settler, SettlerState, ProfessionType } from '../types'
import { Position } from '../../types'
import type { Managers } from '../../Managers'
import { EventManager } from '../../events'
import { Logger } from '../../Logs'

export interface RequestWorkerNeedToolContext {
	toolId: string
	toolPosition: Position
	buildingInstanceId: string
	requiredProfession: ProfessionType
}

export interface RequestWorkerHasProfessionContext {
	buildingInstanceId: string
	buildingPosition: Position
	requiredProfession?: ProfessionType
}

export interface ToolPickupContext {
	toolId: string
}

export interface BuildingArrivalContext {
	buildingInstanceId: string
}

export interface WorkerUnassignContext {
	// Empty - no context needed
}

export interface StateMachineManagers
	extends Pick<
		Managers,
		'movement' | 'buildings' | 'loot' | 'items' | 'map' | 'resourceNodes' | 'jobs' | 'storage'
	> {
	event: EventManager
	logger: Logger
}

export interface StateTransition<TContext = any> {
	condition?: (settler: Settler, context: TContext, managers: StateMachineManagers) => boolean // Optional condition check
	validate?: (settler: Settler, context: TContext, managers: StateMachineManagers) => boolean // Validation before transition
	action: (settler: Settler, context: TContext, managers: StateMachineManagers) => void // Action to perform on transition
	completed?: (settler: Settler, managers: StateMachineManagers) => SettlerState | null | undefined // Called when movement/path completes, returns next state to transition to (or null/undefined if no transition)
}

export type StateTransitionsConfig = {
	[fromState in SettlerState]?: {
		[toState in SettlerState]?: StateTransition
	}
}
