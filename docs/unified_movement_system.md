# Unified Movement System Proposal

## Objective

Create a unified, entity-agnostic movement system that handles pathfinding, path execution, and arrival callbacks for all game entities (NPCs, Settlers, and future entities like animals, carts, etc.). This system will use a single timeout-based movement strategy (the same as the current NPC system) to provide a consistent API for movement operations with arrival detection support.

## Current State Analysis

### NPC Movement System

**Location**: `packages/game/src/NPC/index.ts`

**Current Implementation**:
- **Scheduling**: Timeout-based (`scheduleNPCMovement`)
- **Processing**: `processNPCMovement` moves one step per timeout
- **Timing**: Dynamic timing based on distance and speed (`timeToNextMove = (distance / speed) * 1000`)
- **Step Lag**: `MOVEMENT_STEP_LAG = 100ms` between steps
- **Completion**: Clears timeout and updates state to `Idle` when path completes
- **Events**: Emits `NPCEvents.SC.Go` for position updates
- **Path Storage**: `npc.path: Position[]`

**Strengths**:
- Dynamic timing based on distance (more realistic)
- Efficient (only processes when moving)
- Clear completion handling

**Limitations**:
- No arrival callbacks for specific targets
- No arrival detection mechanism
- Tightly coupled to NPC type

### Settler Movement System

**Location**: `packages/game/src/Population/index.ts`

**Current Implementation**:
- **Scheduling**: Tick-based loop (`startMovementTickLoop`)
- **Processing**: `processSettlerMovement` processes all moving settlers every tick
- **Timing**: Fixed interval (`MOVEMENT_TICK_INTERVAL = 500ms`)
- **Step Movement**: Moves one tile per tick
- **Arrival Detection**: `checkSettlerArrival` detects when settler reaches tool/building
- **Threshold**: `ARRIVAL_THRESHOLD = 32px` (1 tile)
- **Events**: Emits `PopulationEvents.SC.SettlerPositionUpdate` for position updates
- **Path Storage**: `settler.path: Position[]`
- **Target Tracking**: `targetType: 'tool' | 'building'`, `targetId: string`

**Strengths**:
- Arrival detection for specific targets
- Callback support for tool pickup and building arrival
- Supports target tracking

**Limitations**:
- Fixed tick interval (less efficient, less realistic timing)
- Processes all settlers every tick (even if not moving)
- Tightly coupled to Settler type
- Different movement strategy than NPCs (inconsistency)

## Proposed Unified Movement System

### Design Principles

1. **Single Strategy**: Use timeout-based movement for all entities (same as current NPC system)
2. **Entity-Agnostic**: Movement system has no knowledge of entity types - it only tracks entity IDs
3. **Callback-Driven**: Use callbacks for step completion, path completion, and arrival events
4. **Event-Based**: Emit generic movement events (entity managers route to entity-specific events based on their own entity registries)
5. **Efficient**: Only process entities that are actively moving (timeout-based scheduling)

### Architecture Overview

```
MovementManager (new)
├── MovementEntity (interface)
│   ├── id: string
│   ├── position: Position
│   ├── mapName: string
│   └── speed: number
├── MovementTask (internal)
│   ├── entityId: string
│   ├── path: Position[]
│   ├── currentStep: number
│   ├── targetType?: string
│   ├── targetId?: string
│   ├── targetPosition?: Position
│   ├── arrivalThreshold?: number
│   ├── onStepComplete?: (position: Position) => void
│   ├── onPathComplete?: () => void
│   └── onArrival?: (targetType: string, targetId: string) => void
└── Timeout-based Movement (single strategy)
    └── Dynamic timing based on distance and speed
```

### Core Components

#### 1. MovementManager

**Responsibilities**:
- Manage all movement tasks for all entities (entity-agnostic)
- Emit generic movement events (entity managers handle routing)
- Handle pathfinding integration
- Provide timeout-based movement processing
- Provide arrival detection

**Location**: `packages/game/src/Movement/index.ts`

**Key Methods**:
```typescript
class MovementManager {
  // Register entity for movement (called by entity managers)
  registerEntity(entity: MovementEntity): void
  
  // Unregister entity (cleanup)
  unregisterEntity(entityId: string): void
  
  // Order entity to move to position
  moveToPosition(
    entityId: string, 
    targetPosition: Position, 
    callbacks?: MovementCallbacks
  ): boolean // Returns true if movement started, false if failed
  
  // Order entity to move to target (tool, building, etc.)
  moveToTarget(
    entityId: string,
    targetType: string,
    targetId: string,
    targetPosition: Position,
    arrivalThreshold?: number, // Distance threshold for arrival (default: 32px)
    callbacks?: MovementCallbacks
  ): boolean // Returns true if movement started, false if failed
  
  // Cancel movement for entity
  cancelMovement(entityId: string): void
  
  // Process movement step (called by timeout)
  private processMovementStep(entityId: string): void
  
  // Check if entity has arrived at target
  private checkArrival(task: MovementTask): void
}
```

#### 2. MovementEntity Interface

**Purpose**: Abstract interface that any entity can implement. The movement system is completely agnostic about entity types.

```typescript
interface MovementEntity {
  id: string
  position: Position
  mapName: string
  speed: number // pixels per second
}
```

#### 3. MovementTask

**Purpose**: Internal representation of a movement operation. No entity type information is stored.

```typescript
interface MovementTask {
  entityId: string
  path: Position[]
  currentStep: number
  targetType?: string // 'tool', 'building', 'spot', etc.
  targetId?: string
  targetPosition?: Position // For arrival detection
  arrivalThreshold?: number // Distance threshold for arrival (default: 32px)
  timeoutId?: NodeJS.Timeout // Timeout ID for cleanup
  onStepComplete?: (task: MovementTask, position: Position) => void
  onPathComplete?: (task: MovementTask) => void
  onArrival?: (task: MovementTask, targetType: string, targetId: string) => void
  onCancelled?: (task: MovementTask) => void
  createdAt: number
  lastProcessed: number
}
```

#### 4. MovementCallbacks

**Purpose**: Callbacks for movement events

```typescript
interface MovementCallbacks {
  onStepComplete?: (position: Position) => void // Called after each step
  onPathComplete?: () => void // Called when path is fully traversed
  onArrival?: (targetType: string, targetId: string) => void // Called when arriving at target
  onCancelled?: () => void // Called if movement is cancelled
}
```

#### 5. Movement Processing

**Purpose**: Single timeout-based movement strategy for all entities

**Implementation**: Uses `setTimeout` for dynamic timing based on distance and speed, similar to current NPC system.

**Key Features**:
- Dynamic timing: `timeToNextMove = (distance / speed) * 1000` milliseconds
- Step lag: `MOVEMENT_STEP_LAG = 100ms` between steps (configurable)
- Efficient: Only processes entities that are actively moving
- Realistic: Movement speed varies based on distance to next step

### Event System

#### New Events

**Location**: `packages/game/src/Movement/events.ts`

```typescript
export const MovementEvents = {
  SS: {
    MoveToPosition: 'ss:movement:move-to-position',
    MoveToTarget: 'ss:movement:move-to-target',
    CancelMovement: 'ss:movement:cancel',
    StepComplete: 'ss:movement:step-complete',
    PathComplete: 'ss:movement:path-complete',
    Arrival: 'ss:movement:arrival'
  },
  SC: {
    MoveToPosition: 'sc:movement:move-to-position', // Order entity to move to position (interpolated movement)
    PositionUpdated: 'sc:movement:position-updated' // Entity position changed (teleport/sync, no interpolation)
  }
}
```

#### Event Data Structures

```typescript
// Server-to-Client: Order entity to move to position (interpolated movement)
// Backend emits this for each step along the path - frontend just interpolates to the target position
interface MoveToPositionData {
  entityId: string
  targetPosition: Position
  mapName: string
}

// Server-to-Client: Entity position changed (teleport/sync, no interpolation)
// Used for player join, map transitions, position corrections, etc.
interface PositionUpdatedData {
  entityId: string
  position: Position
  mapName: string
}
```

### Integration with Existing Systems

#### NPCManager Integration

**Changes Required**:
1. Remove `processNPCMovement`, `scheduleNPCMovement`, `movementTimeouts`, `clearNPCMovement`
2. Remove `NPCEvents.SC.Go` event (replaced by `MovementEvents.SC.MoveToPosition`)
3. Register NPCs with `MovementManager` on load
4. Use `MovementManager.moveToPosition()` instead of direct path manipulation
5. Update NPC state on path completion via callbacks
6. Frontend listens directly to `MovementEvents.SC.MoveToPosition` (no entity-specific events)

**Example**:
```typescript
// Old way
const path = this.mapManager.findPath(npc.mapId, npc.position, targetPosition)
npc.path = path
this.scheduleNPCMovement(npc.id, 0)
// Emitted NPCEvents.SC.Go

// New way
this.movementManager.moveToPosition(npc.id, targetPosition, {
  onPathComplete: () => {
    npc.state = NPCState.Idle
  }
})
// MovementManager emits MovementEvents.SC.MoveToPosition directly
```

#### PopulationManager Integration

**Changes Required**:
1. Remove `processSettlerMovement`, `startMovementTickLoop`, `checkSettlerArrival`
2. Remove `PopulationEvents.SC.SettlerPositionUpdate` event (replaced by `MovementEvents.SC.MoveToPosition`)
3. Register Settlers with `MovementManager` on spawn
4. Use `MovementManager.moveToTarget()` for tool pickup and building arrival
5. Handle arrival via callbacks (no events needed)
6. Frontend listens directly to `MovementEvents.SC.MoveToPosition` (no entity-specific events)

**Example**:
```typescript
// Old way
const path = this.mapManager.findPath(mapName, settler.position, toolPosition)
settler.path = path
settler.targetType = 'tool'
settler.targetId = toolId
// ... wait for arrival detection in checkSettlerArrival

// New way
await this.movementManager.moveToTarget(
  settler.id,
  'tool',
  toolId,
  toolPosition,
  {
    onArrival: (targetType, targetId) => {
      if (targetType === 'tool') {
        this.handleSettlerPickupItem(settler.id, targetId)
      }
    }
  }
)
```

### Arrival Detection

**Mechanism**:
1. When `moveToTarget()` is called, store `targetPosition` and `arrivalThreshold` in `MovementTask`
2. After each movement step, check distance to target position
3. If distance <= `arrivalThreshold`, trigger `onArrival` callback
4. Emit `MovementEvents.SS.Arrival` event
5. Complete movement task

**Implementation**:
```typescript
private checkArrival(task: MovementTask, currentPosition: Position): boolean {
  if (!task.targetPosition) return false
  
  const dx = currentPosition.x - task.targetPosition.x
  const dy = currentPosition.y - task.targetPosition.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  const threshold = task.arrivalThreshold || 32 // Default: 1 tile
  
  return distance <= threshold
}
```

### Pathfinding Integration

**Current State**: Both NPCs and Settlers use `MapManager.findPath()`

**Proposed**: MovementManager should handle pathfinding internally

```typescript
private async calculatePath(
  mapName: string,
  startPosition: Position,
  targetPosition: Position
): Promise<Position[] | null> {
  return this.mapManager.findPath(mapName, startPosition, targetPosition)
}
```

### Movement Processing Strategy

#### Timeout-Based Movement (Single Strategy)

**Behavior**:
- Calculate time to next step based on distance and speed: `timeToNextMove = (distance / speed) * 1000` milliseconds
- Use `setTimeout` to schedule next step
- Add step lag between movements: `MOVEMENT_STEP_LAG = 100ms` (configurable)
- Only processes entities that are actively moving (efficient)
- Realistic timing (movement speed varies based on distance)
- Processes arrival detection after each step

**Use Case**: All entities (NPCs, Settlers, animals, carts, etc.)

**Advantages**:
- Efficient: Only processes moving entities
- Realistic: Dynamic timing based on distance
- Scalable: No performance impact from fixed tick loops
- Consistent: Same movement behavior for all entities

### Event Emission

**Simplified Approach**: MovementManager emits generic events directly. Frontend listens to these events directly - no entity-specific routing needed.

```typescript
// MovementManager emits movement order for each step along the path
// Frontend receives this directly and interpolates to the target position
this.event.emit(Receiver.Group, MovementEvents.SC.MoveToPosition, {
  entityId: 'settler-1',
  targetPosition: nextStepPosition,
  mapName: 'map1'
}, mapName)

// MovementManager emits position update for teleport/sync (e.g., player join, map transition)
this.event.emit(Receiver.Group, MovementEvents.SC.PositionUpdated, {
  entityId: 'settler-1',
  position: currentPosition,
  mapName: 'map1'
}, mapName)

// Backend entity managers update internal state only (no event routing)
// PopulationManager updates settler position internally
const settler = this.settlers.get(entityId)
if (settler) {
  settler.position = targetPosition
}

// NPCManager updates NPC position internally
const npc = this.npcs.get(entityId)
if (npc) {
  npc.position = targetPosition
}

// Frontend listens directly to MovementEvents (no entity-specific events)
// Entity controllers check entityId to determine if event is for their entity
EventBus.on(Event.Movement.SC.MoveToPosition, (data) => {
  if (data.entityId === this.entity.id) {
    this.view.setTargetPosition(data.targetPosition.x, data.targetPosition.y)
  }
})
```

**Key Principle**: 
- Backend: MovementManager emits generic events, entity managers update internal state only
- Frontend: Entity controllers listen to generic movement events and check `entityId` to filter events for their entity
- No entity-specific movement events needed - everything uses the unified movement system

### Migration Plan

#### Phase 1: Create MovementManager
1. Create `packages/game/src/Movement/` directory
2. Implement `MovementManager` with timeout-based movement
3. Implement movement task management
4. Implement arrival detection
5. Add movement events
6. Integrate with `MapManager` for pathfinding
7. Add callback system for movement events

#### Phase 2: Migrate NPCs
1. Update `NPCManager` to use `MovementManager`
2. Remove NPC movement code (`processNPCMovement`, `scheduleNPCMovement`, `movementTimeouts`)
3. Remove `NPCEvents.SC.Go` event (frontend uses `MovementEvents.SC.MoveToPosition` directly)
4. Update NPC routines to use `MovementManager.moveToPosition()`
5. Update frontend `NPCController` to listen to `MovementEvents.SC.MoveToPosition` instead of `NPCEvents.SC.Go`
6. Test NPC movement and routines
7. Verify event emissions

#### Phase 3: Migrate Settlers
1. Update `PopulationManager` to use `MovementManager`
2. Remove settler movement code (`processSettlerMovement`, `startMovementTickLoop`, `checkSettlerArrival`)
3. Remove `PopulationEvents.SC.SettlerPositionUpdate` event (frontend uses `MovementEvents.SC.MoveToPosition` directly)
4. Update arrival detection to use `MovementManager.moveToTarget()` with callbacks
5. Update frontend `SettlerController` to listen to `MovementEvents.SC.MoveToPosition` instead of `PopulationEvents.SC.SettlerPositionUpdate`
6. Test settler movement, tool pickup, and building arrival
7. Verify event emissions

#### Phase 4: Cleanup and Optimization
1. Remove old movement code
2. Optimize movement processing
3. Add unit tests
4. Update documentation

### Benefits

1. **Code Reusability**: Single movement system for all entities
2. **Consistency**: Unified API and behavior (same movement strategy for all)
3. **Maintainability**: Centralized movement logic
4. **Extensibility**: Easy to add new entity types
5. **Efficiency**: Timeout-based scheduling (only processes moving entities)
6. **Realistic Timing**: Dynamic timing based on distance and speed
7. **Arrival Detection**: Built-in support for target arrival
8. **Callbacks**: Flexible callback system for movement events
9. **Unified Events**: Single event system - no entity-specific movement events needed
10. **Simplicity**: Single movement strategy (easier to understand and maintain)
11. **Cleaner Architecture**: Frontend listens directly to movement events - no routing layer
12. **Less Code**: Removed entity-specific movement events (NPCEvents.SC.Go, PopulationEvents.SC.SettlerPositionUpdate)

### Potential Challenges

1. **State Management**: Entities need to maintain movement state
   - **Solution**: MovementManager tracks movement tasks (by entityId only), entities track their own state in their respective managers
   
2. **Timeout Management**: Need to clean up timeouts when entities are removed
   - **Solution**: Store timeout IDs in MovementTask and clear on unregister/cancel. Entity managers call `unregisterEntity()` when removing entities.
   
3. **Path Recalculation**: Paths may become invalid if obstacles appear
   - **Solution**: Future enhancement - detect path blocking and recalculate
   
4. **Event Filtering**: Frontend controllers need to filter events for their entity
   - **Solution**: Each entity controller checks `entityId` in event data. MovementManager emits events with `entityId`, and controllers filter by checking if `data.entityId === this.entity.id`. This is efficient and keeps the movement system completely agnostic.

### File Structure

```
packages/game/src/Movement/
├── index.ts                 # MovementManager class
├── types.ts                 # MovementEntity, MovementTask, MovementCallbacks
├── events.ts                # Movement events
└── utils.ts                 # Helper functions (arrival detection, distance calculation, etc.)
```

### Example Usage

#### NPC Movement
```typescript
// In NPCManager
const npc: MovementEntity = {
  id: npc.id,
  position: npc.position,
  mapName: npc.mapId,
  speed: npc.speed
}

this.movementManager.registerEntity(npc)

// Listen for movement events for our NPCs
this.event.on(MovementEvents.SC.PositionUpdate, (data) => {
  if (this.npcs.has(data.entityId)) {
    // Update NPC position and emit NPC-specific event
    const npc = this.npcs.get(data.entityId)
    if (npc) {
      npc.position = data.position
      this.event.emit(Receiver.Group, NPCEvents.SC.Go, {
        npcId: data.entityId,
        position: data.position
      }, data.mapName)
    }
  }
})

// Move to spot
this.movementManager.moveToPosition(npc.id, targetPosition, {
  onPathComplete: () => {
    const npc = this.npcs.get(npc.id)
    if (npc) {
      npc.state = NPCState.Idle
    }
  }
})
```

#### Settler Movement
```typescript
// In PopulationManager
const settler: MovementEntity = {
  id: settler.id,
  position: settler.position,
  mapName: settler.mapName,
  speed: settler.speed
}

this.movementManager.registerEntity(settler)

// Backend updates internal state only (no event routing)
// MovementManager emits MovementEvents.SC.MoveToPosition directly
// Frontend SettlerController listens to MovementEvents.SC.MoveToPosition directly

// Move to tool (backend-only - frontend doesn't know about targets)
// Backend internally:
// 1. Calculates path to tool position using MapManager.findPath()
// 2. For each step along the path, emits MoveToPosition to frontend (frontend interpolates)
// 3. Detects arrival when entity reaches tool (backend-only logic)
// 4. Calls onArrival callback to handle tool pickup (backend-only)
this.movementManager.moveToTarget(
  settler.id,
  'tool',
  toolId,
  toolPosition,
  32, // arrival threshold (1 tile)
  {
    onArrival: (targetType, targetId) => {
      // Backend callback - handles arrival logic internally
      // Frontend never sees this - it only receives MoveToPosition events for each step
      if (targetType === 'tool') {
        this.handleSettlerPickupItem(settler.id, targetId)
      }
    }
  }
)

// Move to building (backend-only - frontend doesn't know about targets)
// Same pattern - backend handles everything internally
this.movementManager.moveToTarget(
  settler.id,
  'building',
  buildingInstanceId,
  buildingPosition,
  32, // arrival threshold (1 tile)
  {
    onArrival: (targetType, targetId) => {
      // Backend callback - handles arrival logic internally
      if (targetType === 'building') {
        this.handleSettlerArrivedAtBuilding(settler.id, targetId)
      }
    }
  }
)

// Note: Frontend is completely agnostic about targets
// - Frontend only listens to MoveToPosition events (for each step along the path)
// - Frontend smoothly interpolates to each target position
// - Backend handles all pathfinding, arrival detection, and target logic internally
// - moveToTarget is backend-only API - frontend never calls it or knows about it
// - SS.Arrival events are server-side only (not sent to clients)
```

## Implementation Details

### Movement Processing Flow

1. **Movement Request**: Entity manager calls `moveToPosition()` or `moveToTarget()`
2. **Path Calculation**: MovementManager calculates path using `MapManager.findPath()`
3. **Task Creation**: Create `MovementTask` with path, target, and callbacks
4. **Scheduling**: Schedule first movement step using `setTimeout`
5. **Step Processing**: When timeout fires, move entity one step, emit position update
6. **Arrival Check**: After each step, check if entity has arrived at target
7. **Next Step**: If path not complete and not arrived, schedule next step
8. **Completion**: When path complete or arrived, trigger callbacks and clean up

### Timeout Calculation

```typescript
private calculateStepDelay(distance: number, speed: number): number {
  const MOVEMENT_STEP_LAG = 100 // milliseconds between steps
  const timeToNextMove = (distance / speed) * 1000 // Convert to milliseconds
  return timeToNextMove + MOVEMENT_STEP_LAG
}
```

### Arrival Detection

```typescript
private checkArrival(task: MovementTask, currentPosition: Position): boolean {
  if (!task.targetPosition) return false
  
  const dx = currentPosition.x - task.targetPosition.x
  const dy = currentPosition.y - task.targetPosition.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  const threshold = task.arrivalThreshold || 32 // Default: 1 tile (32px)
  
  return distance <= threshold
}
```

### Task Management

- Store active tasks in `Map<string, MovementTask>` (entityId -> task)
- Store timeout IDs in `MovementTask.timeoutId` for cleanup
- Clear timeout and remove task on completion, cancellation, or entity unregister
- Handle entity removal gracefully (cancel movement and clean up)

## Conclusion

This unified movement system will provide a consistent, efficient, and maintainable solution for entity movement across the game. By using a single timeout-based strategy (the same as the current NPC system), we eliminate code duplication, improve consistency, and make it easier to add new entity types in the future. The system provides built-in arrival detection and callback support, ensuring that settlers only pick up tools after arriving at the destination, and all entities have consistent movement behavior.

