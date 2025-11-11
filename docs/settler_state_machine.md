# Settler State Machine Design

## Overview

This document proposes a clean, explicit state machine design for settlers to replace the current implicit state system that mixes `SettlerState`, `targetType`, and `PendingAssignmentStatus`. The goal is to make settler behavior clear, predictable, and easy to reason about.

## Current State System

### Current States

The current system uses three separate mechanisms to track settler state:

1. **SettlerState** (enum):
   - `Idle` - Settler has no active task
   - `Moving` - Settler is moving (but unclear where or why)
   - `Working` - Settler is actively working at a building
   - `Assigned` - (appears unused)

2. **targetType** (string literal):
   - `'tool'` - Settler is moving to pick up a tool
   - `'building'` - Settler is moving to a building

3. **PendingAssignmentStatus** (enum):
   - `WaitingForTool` - Settler needs to pick up a tool before going to building
   - `WaitingForArrival` - Settler is moving to building, will be assigned on arrival

### Current Issues

1. **Implicit State**: The actual settler state is inferred from a combination of `state`, `targetType`, and `pendingAssignment.status`
2. **Scattered Logic**: State transitions are handled in multiple places with conditional checks
3. **Unclear Transitions**: It's not immediately obvious what states are valid or how transitions occur
4. **Hard to Debug**: Difficult to understand settler's current situation without checking multiple properties
5. **Error-Prone**: Easy to forget to update all related properties during state changes

### Current State Flow

```
Idle
  ↓ (request worker, needs tool)
Moving (targetType: 'tool', pendingAssignment: WaitingForTool)
  ↓ (arrive at tool, pick up)
Moving (targetType: 'building', pendingAssignment: WaitingForArrival) OR Idle (if no assignment)
  ↓ (arrive at building)
Working
  ↓ (unassign)
Idle
```

## Proposed State Machine Design

### Core States

The proposed state machine uses explicit, self-documenting states:

```typescript
export enum SettlerState {
	// Initial/Default states
	Idle = 'idle',                    // No active task, available for work
	Spawned = 'spawned',              // Just spawned from house (optional, could merge with Idle)
	
	// Movement states (with context)
	MovingToTool = 'moving_to_tool',           // Moving to pick up a profession tool
	MovingToBuilding = 'moving_to_building',   // Moving to assigned building
	
	// Work states
	Working = 'working',              // Actively working at a building
	WaitingForWork = 'waiting_for_work', // At building but no work available (optional)
	
	// Error/Recovery states
	AssignmentFailed = 'assignment_failed',    // Assignment failed, needs cleanup
}
```

### State Context

Each state can have associated context data:

```typescript
export interface SettlerStateContext {
	// Movement states
	targetId?: string              // ID of tool or building being moved to
	targetPosition?: Position      // Target position for movement
	
	// Work states
	buildingInstanceId?: string    // Building where settler is working
	jobId?: string                 // Current job assignment ID
	
	// Assignment states
	pendingAssignment?: {
		buildingInstanceId: string
		requiredProfession?: ProfessionType
	}
	
	// Error states
	errorReason?: string           // Reason for failure state
}
```

### Complete State Definition

```typescript
export interface Settler {
	id: SettlerId
	playerId: string
	mapName: string
	position: Position
	profession: ProfessionType
	state: SettlerState
	stateContext: SettlerStateContext  // Context for current state
	currentJob?: JobAssignment
	houseId?: string
	buildingId?: string  // Can be derived from stateContext
	speed: number
	createdAt: number
}
```

## State Transitions

### Transition Diagram

```
                    ┌─────────┐
                    │  Idle   │
                    └────┬────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ MovingToTool    │ │ MovingToBuilding│ │   Working       │
│ (need tool)     │ │ (has profession)│ │ (at building)   │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         │                   │                   │
         │ (pickup tool)     │ (arrive)          │
         ▼                   ▼                   │
┌─────────────────┐ ┌─────────────────┐          │
│ MovingToBuilding│ │    Working      │◄─────────┘
│ (now has tool)  │ │ (assigned)      │
└────────┬────────┘ └────────┬────────┘
         │                   │
         │ (arrive)          │ (unassign)
         ▼                   ▼
    ┌─────────────────┐ ┌─────────┐
    │    Working      │ │  Idle   │
    └─────────────────┘ └─────────┘
```

### Detailed Transitions

#### 1. Idle → MovingToTool
**Trigger**: Worker request for building requiring profession, settler doesn't have profession, tool found
**Conditions**:
- Settler is `Idle`
- Building requires specific profession
- Tool available on map
- Settler doesn't have required profession

**Actions**:
- Set state to `MovingToTool`
- Set `stateContext.targetId` = toolId
- Set `stateContext.pendingAssignment` = { buildingInstanceId, requiredProfession }
- Start movement to tool position
- Emit `SettlerUpdated` event

**Code Example**:
```typescript
function transitionToMovingToTool(
	settler: Settler,
	toolId: string,
	toolPosition: Position,
	buildingInstanceId: string,
	requiredProfession: ProfessionType
): void {
	settler.state = SettlerState.MovingToTool
	settler.stateContext = {
		targetId: toolId,
		targetPosition: toolPosition,
		pendingAssignment: {
			buildingInstanceId,
			requiredProfession
		}
	}
	movementManager.moveToPosition(settler.id, toolPosition, {
		targetType: 'tool',
		targetId: toolId
	})
	emitSettlerUpdated(settler)
}
```

#### 2. MovingToTool → MovingToBuilding
**Trigger**: Settler arrives at tool position, picks up tool
**Conditions**:
- Settler is `MovingToTool`
- Settler arrived at tool (MovementManager.PathComplete with targetType='tool')
- Tool pickup successful
- `stateContext.pendingAssignment` exists

**Actions**:
- Change profession to required profession
- Set state to `MovingToBuilding`
- Update `stateContext.targetId` = buildingInstanceId
- Update `stateContext.targetPosition` = building position
- Remove tool from map
- Start movement to building position
- Emit `ProfessionChanged` and `SettlerUpdated` events

**Code Example**:
```typescript
function onToolPickup(settler: Settler, toolId: string): void {
	if (settler.state !== SettlerState.MovingToTool) {
		return // Invalid transition
	}
	
	const pendingAssignment = settler.stateContext.pendingAssignment
	if (!pendingAssignment) {
		// No assignment, just picked up tool - go to Idle
		transitionToIdle(settler)
		return
	}
	
	// Change profession
	const oldProfession = settler.profession
	settler.profession = pendingAssignment.requiredProfession!
	
	// Get building position
	const building = buildingManager.getBuildingInstance(pendingAssignment.buildingInstanceId)
	if (!building) {
		transitionToAssignmentFailed(settler, 'building_not_found')
		return
	}
	
	// Transition to MovingToBuilding
	settler.state = SettlerState.MovingToBuilding
	settler.stateContext = {
		targetId: pendingAssignment.buildingInstanceId,
		targetPosition: building.position,
		pendingAssignment: pendingAssignment
	}
	
	movementManager.moveToPosition(settler.id, building.position, {
		targetType: 'building',
		targetId: pendingAssignment.buildingInstanceId
	})
	
	emitProfessionChanged(settler, oldProfession, settler.profession)
	emitSettlerUpdated(settler)
}
```

#### 3. Idle → MovingToBuilding
**Trigger**: Worker request for building, settler has required profession (or no profession required)
**Conditions**:
- Settler is `Idle`
- Building needs workers
- Settler has required profession (or building doesn't require specific profession)

**Actions**:
- Set state to `MovingToBuilding`
- Set `stateContext.targetId` = buildingInstanceId
- Set `stateContext.targetPosition` = building position
- Set `stateContext.pendingAssignment` = { buildingInstanceId }
- Start movement to building position
- Emit `SettlerUpdated` event

#### 4. MovingToBuilding → Working
**Trigger**: Settler arrives at building position
**Conditions**:
- Settler is `MovingToBuilding`
- Settler arrived at building (MovementManager.PathComplete with targetType='building')
- Building still needs workers
- Pending assignment exists

**Actions**:
- Create JobAssignment
- Set state to `Working`
- Update `stateContext.buildingInstanceId` = buildingInstanceId
- Update `stateContext.jobId` = jobAssignment.jobId
- Clear `stateContext.pendingAssignment`
- Clear `stateContext.targetId` and `targetPosition`
- Assign worker to building (BuildingManager.assignWorker)
- Emit `WorkerAssigned` and `SettlerUpdated` events

**Code Example**:
```typescript
function onBuildingArrival(settler: Settler, buildingInstanceId: string): void {
	if (settler.state !== SettlerState.MovingToBuilding) {
		return // Invalid transition
	}
	
	const pendingAssignment = settler.stateContext.pendingAssignment
	if (!pendingAssignment || pendingAssignment.buildingInstanceId !== buildingInstanceId) {
		transitionToAssignmentFailed(settler, 'assignment_mismatch')
		return
	}
	
	// Verify building still needs workers
	const building = buildingManager.getBuildingInstance(buildingInstanceId)
	if (!building || !buildingManager.getBuildingNeedsWorkers(buildingInstanceId)) {
		transitionToIdle(settler)
		return
	}
	
	// Create job assignment
	const jobType = determineJobType(building)
	const jobAssignment = createJobAssignment(settler.id, buildingInstanceId, jobType)
	
	// Transition to Working
	settler.state = SettlerState.Working
	settler.stateContext = {
		buildingInstanceId: buildingInstanceId,
		jobId: jobAssignment.jobId
	}
	settler.currentJob = jobAssignment
	settler.buildingId = buildingInstanceId
	
	// Assign worker to building
	buildingManager.assignWorker(buildingInstanceId, settler.id)
	
	emitWorkerAssigned(settler, jobAssignment)
	emitSettlerUpdated(settler)
}
```

#### 5. Working → Idle
**Trigger**: Worker unassigned from building
**Conditions**:
- Settler is `Working`
- Unassign request received

**Actions**:
- Cancel movement if any
- Set state to `Idle`
- Clear `stateContext`
- Clear `currentJob` and `buildingId`
- Unassign worker from building (BuildingManager.unassignWorker)
- Emit `WorkerUnassigned` and `SettlerUpdated` events

#### 6. Any State → Idle (Error Recovery)
**Trigger**: Assignment failed, building not found, etc.
**Conditions**:
- Various error conditions

**Actions**:
- Cancel any ongoing movement
- Set state to `Idle`
- Clear `stateContext`
- Clear pending assignments
- Emit `SettlerUpdated` event

## Implementation Strategy

### Phase 1: Add State Machine Types

1. Update `SettlerState` enum with new states
2. Add `SettlerStateContext` interface
3. Update `Settler` interface to use `stateContext`
4. Create transition helper functions

### Phase 2: Refactor State Transitions

1. Create `SettlerStateMachine` class or module with transition methods
2. Replace scattered state transition logic with explicit transition calls
3. Add state validation (ensure valid transitions only)
4. Add logging for state transitions

### Phase 3: Update Event Handlers

1. Update `handleSettlerPickupItem` to use state machine transitions
2. Update `handleSettlerArrivedAtBuilding` to use state machine transitions
3. Update `orderSettlerToBuilding` to use state machine transitions
4. Update `orderSettlerToPickupTool` to use state machine transitions
5. Update `unassignWorker` to use state machine transitions

### Phase 4: Remove Old State System

1. Remove `targetType` and `targetId` from `Settler` (use `stateContext` instead)
2. Remove `PendingAssignmentStatus` enum (use state machine states instead)
3. Remove `pendingAssignments` map (use `stateContext.pendingAssignment` instead)
4. Update frontend to use new state system

## Benefits

### 1. Explicit State
- Current state is immediately clear from `settler.state`
- No need to check multiple properties to understand settler's situation
- Self-documenting code

### 2. Type Safety
- TypeScript can enforce valid state transitions
- Compile-time checking prevents invalid states
- Better IDE autocomplete and refactoring support

### 3. Easier Debugging
- Single source of truth for settler state
- Clear state transition logs
- Easy to add state visualization/debugging tools

### 4. Maintainability
- State transitions are centralized
- Easy to add new states or transitions
- Clear separation of concerns

### 5. Testability
- Easy to test state transitions in isolation
- Can verify valid/invalid transitions
- Can test state context updates

### 6. Error Handling
- Explicit error states (e.g., `AssignmentFailed`)
- Clear recovery paths
- Better error reporting

## Declarative State Machine Configuration

Instead of imperative `handleXYZ` methods scattered throughout the code, we can define **all state transitions upfront** in a clean, organized structure. Each transition is defined in its own file, making the state machine explicit, testable, and easier to understand.

### Key Benefits of Declarative Approach

1. **Organized Structure**: Each transition in its own file, grouped by from-state
2. **Single Source of Truth**: All transitions defined in one place (index file)
3. **Self-Documenting**: Each transition file serves as documentation
4. **Type-Safe**: TypeScript can validate transition definitions
5. **Testable**: Easy to test transitions in isolation
6. **Maintainable**: Adding/modifying transitions is straightforward
7. **Visualizable**: Can generate state diagrams from configuration
8. **Reusable**: Transitions can be imported and reused

### File Structure

```
packages/game/src/Population/
├── index.ts
├── types.ts
├── events.ts
└── transitions/
    ├── index.ts                    # Main transitions configuration
    ├── IdleToMovingToTool.ts       # Idle -> MovingToTool
    ├── IdleToMovingToBuilding.ts   # Idle -> MovingToBuilding
    ├── MovingToToolToMovingToBuilding.ts  # MovingToTool -> MovingToBuilding
    ├── MovingToToolToIdle.ts       # MovingToTool -> Idle
    ├── MovingToBuildingToWorking.ts # MovingToBuilding -> Working
    ├── MovingToBuildingToIdle.ts   # MovingToBuilding -> Idle (failed)
    └── WorkingToIdle.ts            # Working -> Idle
```

### Transition Definition

```typescript
export interface StateTransition<TContext = any> {
	condition?: (settler: Settler, context: TContext, managers: StateMachineManagers) => boolean // Optional condition check
	validate?: (settler: Settler, context: TContext, managers: StateMachineManagers) => boolean // Validation before transition
	action: (settler: Settler, context: TContext, managers: StateMachineManagers) => void // Action to perform on transition
}

export interface StateMachineManagers {
	movementManager: MovementManager
	buildingManager: BuildingManager
	eventManager: EventManager
	lootManager: LootManager
}

// Nested structure: fromState -> toState -> transition
export type StateTransitionsConfig = {
	[fromState in SettlerState]?: {
		[toState in SettlerState]?: StateTransition
	}
}
```

### Transition Context Types

For type safety, we can define specific context types for each transition:

```typescript
// packages/game/src/Population/transitions/types.ts
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
```

### Transition Table Overview

| From State | To State | Condition | File |
|------------|----------|-----------|------|
| `Idle` | `MovingToTool` | Settler lacks required profession | `IdleToMovingToTool.ts` |
| `Idle` | `MovingToBuilding` | Settler has required profession | `IdleToMovingToBuilding.ts` |
| `MovingToTool` | `MovingToBuilding` | Pending assignment exists | `MovingToToolToMovingToBuilding.ts` |
| `MovingToTool` | `Idle` | No pending assignment | `MovingToToolToIdle.ts` |
| `MovingToBuilding` | `Working` | Building needs workers | `MovingToBuildingToWorking.ts` |
| `MovingToBuilding` | `Idle` | Building doesn't need workers | `MovingToBuildingToIdle.ts` |
| `Working` | `Idle` | Unassign request | `WorkingToIdle.ts` |

### Individual Transition Files

Each transition is defined in its own file for maximum clarity and maintainability:

#### Example: IdleToMovingToTool.ts

```typescript
// packages/game/src/Population/transitions/IdleToMovingToTool.ts
import { StateTransition } from './types'
import { RequestWorkerNeedToolContext } from './types'
import { SettlerState, Settler } from '../types'
import { Receiver } from '../../events'
import { PopulationEvents } from '../events'

export const IdleToMovingToTool: StateTransition<RequestWorkerNeedToolContext> = {
	condition: (settler, context) => {
		// Settler doesn't have required profession
		return settler.profession !== context.requiredProfession
	},
	
	validate: (settler, context, managers) => {
		// Verify tool exists and is available
		return context.toolId !== undefined && context.toolPosition !== undefined
	},
	
	action: (settler, context, managers) => {
		// Update state
		settler.state = SettlerState.MovingToTool
		settler.stateContext = {
			targetId: context.toolId,
			targetPosition: context.toolPosition,
			pendingAssignment: {
				buildingInstanceId: context.buildingInstanceId,
				requiredProfession: context.requiredProfession
			}
		}
		
		// Start movement to tool
		managers.movementManager.moveToPosition(settler.id, context.toolPosition, {
			targetType: 'tool',
			targetId: context.toolId
		})
		
		// Emit state update
		managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
			settler
		}, settler.mapName)
	}
}
```

#### Example: MovingToBuildingToWorking.ts

```typescript
// packages/game/src/Population/transitions/MovingToBuildingToWorking.ts
import { StateTransition } from './types'
import { BuildingArrivalContext } from './types'
import { SettlerState, JobAssignment } from '../types'
import { Receiver } from '../../events'
import { PopulationEvents } from '../events'
import { ConstructionStage } from '../../Buildings/types'
import { uuidv4 } from '../../utils'

export const MovingToBuildingToWorking: StateTransition<BuildingArrivalContext> = {
	condition: (settler, context) => {
		// Settler has pending assignment for this building
		return settler.stateContext.pendingAssignment?.buildingInstanceId === context.buildingInstanceId
	},
	
	validate: (settler, context, managers) => {
		// Verify building still needs workers
		const building = managers.buildingManager.getBuildingInstance(context.buildingInstanceId)
		return building !== undefined && managers.buildingManager.getBuildingNeedsWorkers(context.buildingInstanceId)
	},
	
	action: (settler, context, managers) => {
		const building = managers.buildingManager.getBuildingInstance(context.buildingInstanceId)!
		const buildingDef = managers.buildingManager.getBuildingDefinition(building.buildingId)!
		
		// Determine job type from building state
		let jobType: 'construction' | 'production'
		if (building.stage === ConstructionStage.Foundation || building.stage === ConstructionStage.Constructing) {
			jobType = 'construction'
		} else {
			jobType = 'production'
		}
		
		// Create job assignment
		const jobAssignment: JobAssignment = {
			jobId: uuidv4(),
			settlerId: settler.id,
			buildingInstanceId: context.buildingInstanceId,
			jobType,
			priority: 1,
			assignedAt: Date.now(),
			status: 'active'
		}
		
		// Update state
		settler.state = SettlerState.Working
		settler.stateContext = {
			buildingInstanceId: context.buildingInstanceId,
			jobId: jobAssignment.jobId
		}
		settler.currentJob = jobAssignment
		settler.buildingId = context.buildingInstanceId
		
		// Assign worker to building
		managers.buildingManager.assignWorker(context.buildingInstanceId, settler.id)
		
		// Emit worker assigned event
		// Note: PopulationManager will listen to this event and store the job in its jobs map
		managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.WorkerAssigned, {
			jobAssignment,
			settlerId: settler.id,
			buildingInstanceId: context.buildingInstanceId
		}, settler.mapName)
		
		// Emit state update
		managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
			settler
		}, settler.mapName)
	}
}
```

### Note: Internal State Management

The state machine only receives **managers** to interact with the rest of the system. Internal state like `jobs` and `pendingAssignments` maps are managed by `PopulationManager`:

- **Jobs Map**: `PopulationManager` stores jobs in its `jobs` map. When a transition creates a `jobAssignment`, it sets it on `settler.currentJob` and emits a `WorkerAssigned` event. `PopulationManager` listens to this event to store the job in its map.

- **Pending Assignments Map**: `PopulationManager` can maintain a `pendingAssignments` map for quick lookup, but the source of truth is `settler.stateContext.pendingAssignment`. `PopulationManager` syncs its map when creating pending assignments (in `requestWorker`) and clears it when assignments complete (listening to `WorkerAssigned` event).

This separation keeps the state machine focused on state transitions and interactions with other managers, while `PopulationManager` handles its internal data structures for queries and bookkeeping.

### Main Transitions Configuration

All transitions are imported and organized in a nested structure:

```typescript
// packages/game/src/Population/transitions/index.ts
import { StateTransitionsConfig, SettlerState } from '../types'
import { IdleToMovingToTool } from './IdleToMovingToTool'
import { IdleToMovingToBuilding } from './IdleToMovingToBuilding'
import { MovingToToolToMovingToBuilding } from './MovingToToolToMovingToBuilding'
import { MovingToToolToIdle } from './MovingToToolToIdle'
import { MovingToBuildingToWorking } from './MovingToBuildingToWorking'
import { MovingToBuildingToIdle } from './MovingToBuildingToIdle'
import { WorkingToIdle } from './WorkingToIdle'

export const SETTLER_STATE_TRANSITIONS: StateTransitionsConfig = {
	[SettlerState.Idle]: {
		[SettlerState.MovingToTool]: IdleToMovingToTool,
		[SettlerState.MovingToBuilding]: IdleToMovingToBuilding
	},
	[SettlerState.MovingToTool]: {
		[SettlerState.MovingToBuilding]: MovingToToolToMovingToBuilding,
		[SettlerState.Idle]: MovingToToolToIdle
	},
	[SettlerState.MovingToBuilding]: {
		[SettlerState.Working]: MovingToBuildingToWorking,
		[SettlerState.Idle]: MovingToBuildingToIdle
	},
	[SettlerState.Working]: {
		[SettlerState.Idle]: WorkingToIdle
	}
}

// Export all transitions for testing
export {
	IdleToMovingToTool,
	IdleToMovingToBuilding,
	MovingToToolToMovingToBuilding,
	MovingToToolToIdle,
	MovingToBuildingToWorking,
	MovingToBuildingToIdle,
	WorkingToIdle
}
```

### State Machine Executor

The executor looks up transitions from the nested configuration structure:

```typescript
// packages/game/src/Population/StateMachine.ts
import { StateTransitionsConfig, StateTransition, StateMachineManagers, Settler, SettlerState } from './types'
import { SETTLER_STATE_TRANSITIONS } from './transitions'

export class SettlerStateMachine {
	private transitions: StateTransitionsConfig
	private managers: StateMachineManagers
	
	constructor(
		movementManager: MovementManager,
		buildingManager: BuildingManager,
		eventManager: EventManager,
		lootManager: LootManager,
		transitions: StateTransitionsConfig = SETTLER_STATE_TRANSITIONS
	) {
		// Store managers for use in transition actions
		this.managers = {
			movementManager,
			buildingManager,
			eventManager,
			lootManager
		}
		
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
		
		// Get all possible transitions from current state
		const fromStateTransitions = this.transitions[fromState]
		if (!fromStateTransitions) {
			console.warn(`[StateMachine] No transitions defined from state ${fromState}`)
			return false
		}
		
		// Get transition to target state
		const targetTransition = fromStateTransitions[toState] as StateTransition<TContext> | undefined
		if (!targetTransition) {
			console.warn(`[StateMachine] No transition found from ${fromState} to ${toState}`)
			return false
		}
		
		// Check condition (if provided)
		if (targetTransition.condition && !targetTransition.condition(settler, context, this.managers)) {
			console.debug(`[StateMachine] Condition not met for transition ${fromState} -> ${toState}`)
			return false
		}
		
		// Validate (if provided)
		if (targetTransition.validate && !targetTransition.validate(settler, context, this.managers)) {
			console.warn(`[StateMachine] Validation failed for transition ${fromState} -> ${toState}`)
			return false
		}
		
		// Execute transition action
		try {
			const previousState = settler.state
			targetTransition.action(settler, context, this.managers)
			
			// Verify state was updated correctly
			if (settler.state !== toState) {
				console.warn(`[StateMachine] Transition action did not update state to ${toState}, current state: ${settler.state}`)
				return false
			}
			
			console.log(`[StateMachine] ✓ Transition: ${previousState} -> ${settler.state}`)
			return true
		} catch (error) {
			console.error(`[StateMachine] ✗ Error executing transition ${fromState} -> ${toState}:`, error)
			return false
		}
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
```

### Benefits of Declarative Approach

1. **All Transitions in One Place**: The `SETTLER_STATE_TRANSITIONS` configuration object contains all state transitions, making it easy to see the complete state machine at a glance.

2. **No Scattered Logic**: Instead of having `handleSettlerPickupItem`, `handleSettlerArrivedAtBuilding`, etc., all transition logic is defined in the configuration.

3. **Easy to Modify**: To add a new transition, simply add a new entry to the configuration object. No need to modify multiple methods.

4. **Self-Documenting**: Each transition file serves as documentation with clear `condition`/`validate`/`action` functions.

5. **Type-Safe**: Context types can be defined for each transition, providing compile-time safety.

6. **Testable**: Transitions can be tested in isolation by calling `executeTransition` with mock data.

7. **Visualizable**: The transition configuration can be used to generate state diagrams automatically.

### Usage Example: PopulationManager Integration

Instead of multiple `handleXYZ` methods, `PopulationManager` becomes much simpler:

```typescript
// In PopulationManager
export class PopulationManager {
	private stateMachine: SettlerStateMachine
	
	constructor(
		event: EventManager,
		buildingManager: BuildingManager,
		scheduler: Scheduler,
		mapManager: MapManager,
		lootManager: LootManager,
		itemsManager: ItemsManager,
		movementManager: MovementManager
	) {
		// Initialize state machine with managers
		this.stateMachine = new SettlerStateMachine(
			movementManager,
			buildingManager,
			event,
			lootManager
		)
		
		this.setupEventHandlers()
	}
	
	private setupEventHandlers(): void {
		// Listen to WorkerAssigned event to store job in our jobs map
		// State machine emits this event, but PopulationManager manages the jobs map
		this.event.on(PopulationEvents.SC.WorkerAssigned, (data: { jobAssignment: JobAssignment }) => {
			this.jobs.set(data.jobAssignment.jobId, data.jobAssignment)
			// Clear pending assignment from our map (sync with settler.stateContext)
			const settler = this.settlers.get(data.jobAssignment.settlerId)
			if (settler?.stateContext.pendingAssignment) {
				this.pendingAssignments.delete(data.jobAssignment.settlerId)
			}
		})
		
		// Map movement events to state transitions
		this.event.on(MovementEvents.SS.PathComplete, (data: { entityId: string, targetType?: string, targetId?: string }) => {
			const settler = this.settlers.get(data.entityId)
			if (!settler) return
			
			// Map movement events to state transitions
			if (data.targetType === 'tool') {
				// Tool pickup - try transitions based on condition
				// Try MovingToBuilding first (if has pending assignment)
				if (settler.stateContext.pendingAssignment) {
					this.stateMachine.executeTransition(settler, SettlerState.MovingToBuilding, {
						toolId: data.targetId!
					})
				} else {
					// No assignment, go to Idle
					this.stateMachine.executeTransition(settler, SettlerState.Idle, {
						toolId: data.targetId!
					})
				}
			} else if (data.targetType === 'building') {
				// Building arrival - try to transition to Working
				this.stateMachine.executeTransition(settler, SettlerState.Working, {
					buildingInstanceId: data.targetId!
				})
			}
		})
	}
	
	// Request worker - simple, declarative transition
	private requestWorker(data: RequestWorkerData, client: EventClient): void {
		const building = this.buildingManager.getBuildingInstance(data.buildingInstanceId)
		const buildingDef = this.buildingManager.getBuildingDefinition(building.buildingId)
		const requiredProfession = buildingDef?.requiredProfession
		
		// Find available settler
		const workerResult = this.findWorkerForBuilding(...)
		if (!workerResult) {
			// Emit failure
			client.emit(Receiver.Sender, PopulationEvents.SC.WorkerRequestFailed, {
				reason: 'no_available_worker',
				buildingInstanceId: data.buildingInstanceId
			})
			return
		}
		
		const settler = this.settlers.get(workerResult.settlerId)!
		
		if (workerResult.needsTool) {
			// Store pending assignment in our map (sync with settler.stateContext)
			// State machine will set this in settler.stateContext during transition
			this.pendingAssignments.set(settler.id, {
				buildingInstanceId: data.buildingInstanceId,
				status: PendingAssignmentStatus.WaitingForTool
			})
			
			// Execute transition: Idle -> MovingToTool
			// State machine handles all the logic (state update, movement, events)
			this.stateMachine.executeTransition(settler, SettlerState.MovingToTool, {
				toolId: workerResult.toolId!,
				toolPosition: workerResult.toolPosition!,
				buildingInstanceId: data.buildingInstanceId,
				requiredProfession: requiredProfession!
			})
		} else {
			// Store pending assignment in our map (sync with settler.stateContext)
			this.pendingAssignments.set(settler.id, {
				buildingInstanceId: data.buildingInstanceId,
				status: PendingAssignmentStatus.WaitingForArrival
			})
			
			// Execute transition: Idle -> MovingToBuilding
			// State machine handles all the logic
			this.stateMachine.executeTransition(settler, SettlerState.MovingToBuilding, {
				buildingInstanceId: data.buildingInstanceId,
				buildingPosition: building.position,
				requiredProfession: requiredProfession
			})
		}
	}
	
	// Unassign worker - simple, declarative transition
	private unassignWorker(data: UnassignWorkerData, client: EventClient): void {
		const settler = this.settlers.get(data.settlerId)!
		
		// Execute transition: Working -> Idle
		// State machine handles cancellation, unassignment, events
		const success = this.stateMachine.executeTransition(settler, SettlerState.Idle, {})
		
		if (success) {
			// Handle internal state management after transition
			// State machine doesn't manage jobs map - PopulationManager does
			if (settler.currentJob) {
				this.jobs.delete(settler.currentJob.jobId)
			}
		}
	}
	
	// Note: handleSettlerPickupItem and handleSettlerArrivedAtBuilding are NO LONGER NEEDED!
	// The state machine handles these transitions automatically based on conditions
}
```

### Key Simplifications

1. **No More `handleSettlerPickupItem`**: Tool pickup is handled automatically by the state machine when movement completes, conditions determine which transition to execute.

2. **No More `handleSettlerArrivedAtBuilding`**: Building arrival is handled automatically by the state machine when movement completes, conditions determine which transition to execute.

3. **No More `orderSettlerToBuilding`**: Direct state machine transition replaces this method.

4. **No More `orderSettlerToPickupTool`**: Direct state machine transition replaces this method.

5. **Single Source of Truth**: All transition logic is in `SETTLER_STATE_TRANSITIONS` configuration.

6. **No Trigger Strings**: Transitions are identified by `toState` directly, making the API simpler and more type-safe.

### Event-Driven Integration

The state machine integrates seamlessly with the event system. Movement events automatically trigger state transitions:

```typescript
// MovementManager emits PathComplete event
MovementManager.completePath() 
  → emits MovementEvents.SS.PathComplete 
  → PopulationManager receives event
  → calls stateMachine.executeTransition(settler, SettlerState.MovingToBuilding | SettlerState.Working)
  → State machine looks up transition by toState
  → Checks condition
  → Executes transition action if condition passes
  → Settler state updated
  → Events emitted
```

### Multiple Transitions from Same State

The state machine handles multiple possible transitions from the same state based on conditions. When an event occurs, you try the most likely transition first, and the condition determines if it's valid:

```typescript
// From MovingToTool state, two possible transitions:
// When tool is picked up, try MovingToBuilding first (if has assignment)
if (settler.stateContext.pendingAssignment) {
	this.stateMachine.executeTransition(settler, SettlerState.MovingToBuilding, { toolId })
} else {
	// No assignment, go to Idle
	this.stateMachine.executeTransition(settler, SettlerState.Idle, { toolId })
}
```

Alternatively, you can try all possible transitions and let conditions decide:

```typescript
// Try all possible transitions from current state
const validTransitions = this.stateMachine.getValidTransitions(settler)
for (const { toState, transition } of validTransitions) {
	if (this.stateMachine.executeTransition(settler, toState, context)) {
		break // Transition succeeded
	}
}
```

## Migration Path

### Step 1: Add New Types (Non-Breaking)
- Add new `SettlerState` values (keep old ones)
- Add `SettlerStateContext` interface
- Make `stateContext` optional on `Settler`

### Step 2: Gradual Migration
- Update one transition at a time
- Keep old system working alongside new system
- Add migration helpers to convert between old and new systems

### Step 3: Update Frontend
- Update frontend to use new state system
- Update UI components to display new states
- Update state visualization/debugging tools

### Step 4: Remove Old System
- Remove old state values
- Remove `targetType` and `targetId`
- Remove `PendingAssignmentStatus` and `pendingAssignments` map

## Example: Complete State Machine Usage

```typescript
// Request worker for building
function requestWorker(buildingInstanceId: string): void {
	const building = buildingManager.getBuildingInstance(buildingInstanceId)
	const requiredProfession = building.definition.requiredProfession
	
	// Find available settler
	const settler = findAvailableSettler(requiredProfession)
	if (!settler) {
		// Try to find settler + tool
		const { settler, tool } = findSettlerWithTool(requiredProfession)
		if (settler && tool) {
			// Use state machine to transition to MovingToTool
			stateMachine.executeTransition(settler, SettlerState.MovingToTool, {
				toolId: tool.id,
				toolPosition: tool.position,
				buildingInstanceId,
				requiredProfession
			})
		}
	} else {
		// Settler has profession, go directly to building
		stateMachine.executeTransition(settler, SettlerState.MovingToBuilding, {
			buildingInstanceId,
			buildingPosition: building.position,
			requiredProfession
		})
	}
}

// Handle tool pickup
function onToolPickup(settlerId: string, toolId: string): void {
	const settler = settlers.get(settlerId)
	
	// Try MovingToBuilding first (if has assignment), otherwise Idle
	if (settler.stateContext.pendingAssignment) {
		stateMachine.executeTransition(settler, SettlerState.MovingToBuilding, { toolId })
	} else {
		stateMachine.executeTransition(settler, SettlerState.Idle, { toolId })
	}
}

// Handle building arrival
function onBuildingArrival(settlerId: string, buildingInstanceId: string): void {
	const settler = settlers.get(settlerId)
	
	// Transition to Working
	stateMachine.executeTransition(settler, SettlerState.Working, { buildingInstanceId })
}
```

## Conclusion

A well-designed state machine will make the settler system:
- **Clearer**: Explicit states instead of implicit combinations
- **Safer**: Type-safe transitions with validation
- **Easier to Debug**: Single source of truth for state
- **More Maintainable**: Centralized transition logic
- **More Testable**: Isolated, testable transitions

The proposed design maintains compatibility with the existing system while providing a clear path forward for improvement.

