# Frontend Movement Controller Proposal

## Objective

Create a generic, reusable movement controller system for the frontend that handles sprite movement, orientation updates, and animation state management. This system should work with the unified movement system on the backend and can be composed or inherited by any entity type (NPCs, Settlers, Players, etc.).

## Current State Analysis

### NPC Movement (NPCView)

**Location**: `packages/frontend/src/game/entities/NPC/View.tsx`

**Current Implementation**:
- Tracks `targetPosition`, `startPosition`, `movementStartTime`, `movementDuration`
- `setTargetPosition()` calculates movement duration based on distance and speed
- `preUpdate()` performs linear interpolation between start and target positions
- Updates direction based on movement delta (dx, dy)
- Updates state (Idle/Walking) based on movement progress
- Updates sprite animations based on direction and state
- Updates depth based on Y position for proper rendering order
- Handles sprite-based rendering with animations

**Strengths**:
- Smooth interpolation-based movement
- Automatic direction calculation
- Animation state management
- Depth sorting

**Limitations**:
- Movement logic is tightly coupled to NPCView
- Cannot be reused by other entity types
- Manual event subscription in Controller

### Settler Movement (SettlerView)

**Location**: `packages/frontend/src/game/entities/Settler/View.ts`

**Current Implementation**:
- Similar movement tracking (`targetPosition`, `startPosition`, etc.)
- `setTargetPosition()` calculates movement duration
- `preUpdate()` performs linear interpolation
- Updates direction based on movement delta
- Updates state (Idle/Moving/Working) based on movement progress
- Handles graphics-based rendering (simple circle)
- Updates depth based on Y position

**Strengths**:
- Smooth interpolation-based movement
- Automatic direction calculation
- State management

**Limitations**:
- Movement logic duplicated from NPCView
- Cannot be reused by other entity types
- Manual event subscription in Controller
- No animation support (graphics-based)

## Proposed Solution

### Architecture Overview

```
MovementController (composition pattern)
├── MovementController (standalone class)
│   ├── setTargetPosition(x, y, currentX, currentY)
│   ├── update(currentX, currentY)
│   ├── getDirection()
│   ├── getState()
│   └── isMoving()
├── BaseMovementView (base class, uses composition)
│   ├── movementController: MovementController (property)
│   ├── setTargetPosition(x, y)
│   ├── updatePosition(x, y)
│   ├── preUpdate() (calls movementController.update())
│   └── updateDepth()
└── AnimationController (optional, for sprite-based entities)
    ├── updateAnimation(state, direction)
    └── playAnimation(key)
```

### Core Components

#### 1. MovementController

**Purpose**: Handles movement interpolation, direction calculation, and state management

**Location**: `packages/frontend/src/game/entities/Movement/MovementController.ts`

**Interface**:
```typescript
export interface MovementControllerOptions {
  speed: number // pixels per second
  onMovementStart?: () => void
  onMovementComplete?: () => void
  onDirectionChange?: (direction: Direction) => void
  onStateChange?: (state: 'idle' | 'moving') => void
}

export class MovementController {
  private targetPosition: { x: number, y: number } | null = null
  private startPosition: { x: number, y: number } | null = null
  private movementStartTime: number = 0
  private movementDuration: number = 0
  private currentDirection: Direction = Direction.Down
  private currentState: 'idle' | 'moving' = 'idle'
  private speed: number
  
  constructor(options: MovementControllerOptions)
  
  // Set target position and start movement
  setTargetPosition(x: number, y: number, currentX: number, currentY: number): void
  
  // Update movement (called in preUpdate/update loop)
  update(currentX: number, currentY: number): { x: number, y: number, direction: Direction, state: 'idle' | 'moving' }
  
  // Get current direction
  getDirection(): Direction
  
  // Get current state
  getState(): 'idle' | 'moving'
  
  // Check if moving
  isMoving(): boolean
  
  // Cancel movement
  cancelMovement(): void
}
```

#### 2. BaseMovementView

**Purpose**: Base class that entities can extend to get movement capabilities. Uses composition - has a MovementController instance.

**Location**: `packages/frontend/src/game/entities/Movement/BaseMovementView.ts`

**Interface**:
```typescript
export abstract class BaseMovementView extends Phaser.GameObjects.Container {
  protected movementController: MovementController
  protected baseDepth: number = 100
  
  constructor(scene: GameScene, x: number, y: number, speed: number)
  
  // Abstract methods for subclasses to implement
  protected abstract updateVisuals(direction: Direction, state: 'idle' | 'moving'): void
  protected abstract setupVisuals(): void
  
  // Movement methods (uses MovementController via composition)
  public setTargetPosition(x: number, y: number): void
  public updatePosition(x: number, y: number): void
  public preUpdate(): void
  protected updateDepth(): void
  
  // Protected hooks for subclasses (optional overrides)
  protected onMovementStart(): void
  protected onMovementComplete(): void
  protected onDirectionChange(direction: Direction): void
  protected onStateChange(state: 'idle' | 'moving'): void
}
```

#### 4. AnimationController (Optional)

**Purpose**: Handles sprite animation based on movement state and direction

**Location**: `packages/frontend/src/game/entities/Movement/AnimationController.ts`

**Interface**:
```typescript
export interface AnimationControllerOptions {
  sprite: Phaser.GameObjects.Sprite
  animationPrefix: string // e.g., 'npc', 'player', 'settler'
  defaultState?: 'idle' | 'moving'
}

export class AnimationController {
  private sprite: Phaser.GameObjects.Sprite
  private animationPrefix: string
  private currentAnimation: string | null = null
  
  constructor(options: AnimationControllerOptions)
  
  // Update animation based on state and direction
  updateAnimation(state: 'idle' | 'moving', direction: Direction): void
  
  // Play specific animation
  playAnimation(key: string): void
  
  // Get current animation key
  getAnimationKey(state: 'idle' | 'moving', direction: Direction): string
}
```

### Integration with Unified Movement System

#### Event Subscription

**Direct Movement Event Listener** (No Entity-Specific Events):
```typescript
// In entity controller (NPCController, SettlerController, etc.)
// Controllers listen directly to MovementEvents - no entity-specific routing needed
private setupMovementListener(): void {
  // Listen for movement orders (interpolated movement)
  // Backend emits this for each step along the path
  // Frontend doesn't need to know about targets - just interpolate to each position
  EventBus.on(Event.Movement.SC.MoveToPosition, (data: MoveToPositionData) => {
    // Check if this event is for our entity
    if (data.entityId === this.entity.id) {
      // Update view target position (triggers interpolated movement)
      // Backend handles pathfinding and emits MoveToPosition for each step
      this.view.setTargetPosition(data.targetPosition.x, data.targetPosition.y)
    }
  })
  
  // Listen for position updates (teleport/sync, no interpolation)
  // Used for player join, map transitions, position corrections, etc.
  EventBus.on(Event.Movement.SC.PositionUpdated, (data: PositionUpdatedData) => {
    // Check if this event is for our entity
    if (data.entityId === this.entity.id) {
      // Update view position immediately (teleport/sync)
      this.view.updatePosition(data.position.x, data.position.y)
    }
  })
}

// OLD WAY (removed):
// EventBus.on(Event.NPC.SC.Go, ...)  // ❌ Removed
// EventBus.on(Event.Population.SC.SettlerPositionUpdate, ...)  // ❌ Removed

// NEW WAY:
// EventBus.on(Event.Movement.SC.MoveToPosition, ...)  // ✅ Unified event
// EventBus.on(Event.Movement.SC.PositionUpdated, ...)  // ✅ Unified event
```
<｜tool▁calls▁begin｜><｜tool▁call▁begin｜>
read_file

#### Movement Flow

**Interpolated Movement (MoveToPosition)**:
1. **Backend calculates path**: MovementManager finds path to target (tool, building, position, etc.)
2. **Backend processes movement**: For each step along the path, backend emits `MovementEvents.SC.MoveToPosition` with `entityId` and `targetPosition` (next step position)
3. **Entity Controller receives event**: Checks if `entityId` matches entity
4. **View updates target position**: Calls `view.setTargetPosition(x, y)` (triggers interpolated movement)
5. **MovementController calculates movement**: Determines duration, direction, etc. based on distance and speed
6. **View interpolates position**: `preUpdate()` calls `movementController.update()` - smoothly interpolates to target
7. **View updates visuals**: Direction changes trigger animation updates
8. **Movement completes**: State changes to 'idle', animations update
9. **Backend detects arrival**: Backend checks if entity reached target (tool, building, etc.) and handles arrival logic internally
10. **Backend emits next step**: If path continues, backend emits next `MoveToPosition` event

**Note**: Frontend doesn't know about targets (tools, buildings) - it only receives position updates. Backend handles all target logic, pathfinding, and arrival detection.

**Teleport/Sync (PositionUpdated)**:
1. **Backend emits position update**: `MovementEvents.SC.PositionUpdated` with `entityId` and `position`
2. **Entity Controller receives event**: Checks if `entityId` matches entity
3. **View updates position immediately**: Calls `view.updatePosition(x, y)` (no interpolation)
4. **View updates visuals**: Position changed, update depth, etc.
5. **Use cases**: Player join/initial spawn, map transitions, position corrections, teleportation

### Usage Examples

#### Example 1: NPC with Sprite Animations

```typescript
// NPCView extends BaseMovementView
export class NPCView extends BaseMovementView {
  private sprite: Phaser.GameObjects.Sprite
  private animationController: AnimationController
  
  constructor(scene: GameScene, x: number, y: number, npcId: string, speed: number) {
    super(scene, x, y, speed)
    this.baseDepth = 100 // NPC base depth
    
    // Setup sprite
    this.sprite = scene.add.sprite(0, 0, 'npc-sprite')
    this.add(this.sprite)
    
    // Setup animation controller
    this.animationController = new AnimationController({
      sprite: this.sprite,
      animationPrefix: 'npc'
    })
    
    // Setup visuals
    this.setupVisuals()
  }
  
  protected setupVisuals(): void {
    // Setup sprite, animations, etc.
    // This is called after movement controller is initialized
  }
  
  protected updateVisuals(direction: Direction, state: 'idle' | 'moving'): void {
    // Update animation based on direction and state
    this.animationController.updateAnimation(state, direction)
  }
  
  protected onDirectionChange(direction: Direction): void {
    super.onDirectionChange(direction)
    // Additional direction change handling if needed
  }
  
  protected onStateChange(state: 'idle' | 'moving'): void {
    super.onStateChange(state)
    // Additional state change handling if needed
  }
}
```

#### Example 2: Settler with Graphics

```typescript
// SettlerView extends BaseMovementView
export class SettlerView extends BaseMovementView {
  private graphics: Phaser.GameObjects.Graphics
  private emojiText: Phaser.GameObjects.Text
  
  constructor(scene: GameScene, x: number, y: number, settlerId: string, profession: ProfessionType, speed: number) {
    super(scene, x, y, speed)
    this.baseDepth = 150 // Settler base depth
    
    // Setup graphics
    this.graphics = scene.add.graphics()
    this.add(this.graphics)
    
    // Setup emoji text
    this.emojiText = scene.add.text(0, 0, '👤')
    this.add(this.emojiText)
    
    // Setup visuals
    this.setupVisuals()
  }
  
  protected setupVisuals(): void {
    // Draw graphics circle, setup emoji, etc.
    this.updateGraphics()
  }
  
  protected updateVisuals(direction: Direction, state: 'idle' | 'moving'): void {
    // Update graphics based on state (e.g., alpha, scale)
    if (state === 'moving') {
      this.setAlpha(1.0)
    } else {
      this.setAlpha(0.9)
    }
  }
  
  private updateGraphics(): void {
    // Draw graphics circle, update emoji, etc.
  }
}
```

#### Example 3: Composition Pattern (Alternative)

```typescript
// EntityView uses MovementController via composition
export class EntityView extends Phaser.GameObjects.Container {
  private movementController: MovementController
  private sprite: Phaser.GameObjects.Sprite
  
  constructor(scene: GameScene, x: number, y: number, speed: number) {
    super(scene, x, y)
    
    // Create movement controller
    this.movementController = new MovementController({
      speed,
      onDirectionChange: (direction) => {
        this.updateAnimation(direction)
      },
      onStateChange: (state) => {
        this.updateAnimationState(state)
      }
    })
    
    // Setup sprite
    this.sprite = scene.add.sprite(0, 0, 'entity-sprite')
    this.add(this.sprite)
  }
  
  public setTargetPosition(x: number, y: number): void {
    this.movementController.setTargetPosition(x, y, this.x, this.y)
  }
  
  public preUpdate(): void {
    if (this.movementController.isMoving()) {
      const result = this.movementController.update(this.x, this.y)
      this.x = result.x
      this.y = result.y
      this.updateDepth()
    }
  }
  
  private updateAnimation(direction: Direction): void {
    // Update sprite animation based on direction
  }
  
  private updateAnimationState(state: 'idle' | 'moving'): void {
    // Update sprite animation based on state
  }
  
  private updateDepth(): void {
    this.setDepth(100 + this.y * 0.1)
  }
}
```

### Event Integration

#### Movement Event Handler

```typescript
// In entity controller
export class EntityController {
  constructor(
    private view: BaseMovementView,
    private entity: Entity
  ) {
    this.setupMovementListener()
  }
  
  private setupMovementListener(): void {
    // Listen for movement orders (interpolated movement)
    // Backend emits this for each step along the path - frontend just interpolates
    EventBus.on(Event.Movement.SC.MoveToPosition, this.handleMoveToPosition, this)
    
    // Listen for position updates (teleport/sync, no interpolation)
    // Used for player join, map transitions, position corrections, etc.
    EventBus.on(Event.Movement.SC.PositionUpdated, this.handlePositionUpdated, this)
  }
  
  private handleMoveToPosition = (data: MoveToPositionData): void => {
    if (data.entityId === this.entity.id) {
      // Update view target position (triggers interpolated movement)
      // Backend handles pathfinding and emits MoveToPosition for each step
      // Frontend just smoothly interpolates to each target position
      this.view.setTargetPosition(data.targetPosition.x, data.targetPosition.y)
    }
  }
  
  private handlePositionUpdated = (data: PositionUpdatedData): void => {
    if (data.entityId === this.entity.id) {
      // Update view position immediately (teleport/sync, no interpolation)
      // Used for initial spawn, map transitions, position corrections
      this.view.updatePosition(data.position.x, data.position.y)
    }
  }
  
  public destroy(): void {
    EventBus.off(Event.Movement.SC.MoveToPosition, this.handleMoveToPosition, this)
    EventBus.off(Event.Movement.SC.PositionUpdated, this.handlePositionUpdated, this)
    this.view.destroy()
  }
}
```

### Depth Management

#### Automatic Depth Updates

```typescript
// In BaseMovementView
protected updateDepth(): void {
  // Update depth based on Y position for proper rendering order
  this.setDepth(this.baseDepth + this.y * 0.1)
}

// Called in preUpdate after position update
public preUpdate(): void {
  if (this.movementController.isMoving()) {
    const result = this.movementController.update(this.x, this.y)
    this.x = result.x
    this.y = result.y
    this.updateDepth() // Update depth after position change
  }
}
```

### Animation Support

#### Sprite Animation Integration

```typescript
// AnimationController handles sprite animations
export class AnimationController {
  updateAnimation(state: 'idle' | 'moving', direction: Direction): void {
    const animationKey = this.getAnimationKey(state, direction)
    
    if (this.sprite.anims.currentAnim?.key !== animationKey) {
      this.sprite.play(animationKey)
    }
  }
  
  private getAnimationKey(state: 'idle' | 'moving', direction: Direction): string {
    return `${this.animationPrefix}-${state}-${direction.toLowerCase()}`
  }
}
```

### Migration Plan

#### Phase 1: Create Movement System
1. Create `packages/frontend/src/game/entities/Movement/` directory
2. Implement `MovementController` class
3. Implement `BaseMovementView` abstract class
4. Implement `AnimationController` class (optional)
5. Add movement event types and interfaces

#### Phase 2: Migrate NPCs
1. Update `NPCView` to extend `BaseMovementView`
2. Integrate `AnimationController` for sprite animations
3. Update `NPCController` to listen to `Event.Movement.SC.MoveToPosition` instead of `Event.NPC.SC.Go`
4. Remove `Event.NPC.SC.Go` event handler
5. Remove `NPCEvents.SC.Go` from events.ts (no longer needed)
6. Test NPC movement and animations
7. Remove old movement code from `NPCView`

#### Phase 3: Migrate Settlers
1. Update `SettlerView` to extend `BaseMovementView`
2. Update `SettlerController` to listen to `Event.Movement.SC.MoveToPosition` instead of `Event.Population.SC.SettlerPositionUpdate`
3. Remove `Event.Population.SC.SettlerPositionUpdate` event handler
4. Remove `PopulationEvents.SC.SettlerPositionUpdate` from events.ts (no longer needed)
5. Test settler movement
6. Remove old movement code from `SettlerView`

#### Phase 4: Update Other Entities
1. Update `PlayerView` to use movement system (if needed)
2. Update any other entity types
3. Clean up duplicate movement code

#### Phase 5: Integration with Backend
1. Update event listeners to use `Event.Movement.SC.MoveToPosition` and `SC.PositionUpdated`
2. Test end-to-end movement flow (backend handles pathfinding and arrival detection)
3. Verify animation and orientation updates
4. Test depth sorting
5. Verify frontend doesn't need to know about targets (tools, buildings)

### Benefits

1. **Code Reusability**: Single movement system for all entities
2. **Consistency**: Unified movement behavior across all entity types
3. **Maintainability**: Centralized movement logic
4. **Extensibility**: Easy to add new entity types
5. **Simple Composition**: MovementController used via composition (no mixins)
6. **Flexible**: Can use BaseMovementView (inheritance) or manual composition
7. **Animation Support**: Built-in animation controller for sprite-based entities
8. **Event Integration**: Seamless integration with unified movement system
9. **Depth Management**: Automatic depth sorting based on Y position
10. **Clear Ownership**: MovementController is a property, not mixed in - easier to understand and debug

### Potential Challenges

1. **Phaser Container Inheritance**: Phaser containers have specific requirements
   - **Solution**: Use composition or careful inheritance patterns
   
2. **Animation Key Naming**: Different entities may use different animation naming conventions
   - **Solution**: Make animation prefix configurable, allow custom animation key generation
   
3. **State Management**: Entities may have different state types (Idle/Moving/Working vs Idle/Walking)
   - **Solution**: Movement controller uses generic 'idle' | 'moving', entities map to their own states
   
4. **Performance**: Interpolation calculations every frame
   - **Solution**: Only update when moving, optimize calculations
   
5. **Event Routing**: Generic movement events need to be routed to correct entities
   - **Solution**: Entity controllers check entityId in event data

### File Structure

```
packages/frontend/src/game/entities/Movement/
├── MovementController.ts       # Core movement logic (standalone class)
├── BaseMovementView.ts         # Base class for movement views (uses composition)
├── AnimationController.ts      # Animation controller for sprites (optional)
├── types.ts                    # Types and interfaces
└── utils.ts                    # Helper functions
```

### Example Implementation

#### MovementController.ts

```typescript
import { Direction } from '@rugged/game'

export interface MovementControllerOptions {
  speed: number
  onMovementStart?: () => void
  onMovementComplete?: () => void
  onDirectionChange?: (direction: Direction) => void
  onStateChange?: (state: 'idle' | 'moving') => void
}

export class MovementController {
  private targetPosition: { x: number, y: number } | null = null
  private startPosition: { x: number, y: number } | null = null
  private movementStartTime: number = 0
  private movementDuration: number = 0
  private currentDirection: Direction = Direction.Down
  private currentState: 'idle' | 'moving' = 'idle'
  private speed: number
  private options: MovementControllerOptions
  
  constructor(options: MovementControllerOptions) {
    this.speed = options.speed
    this.options = options
  }
  
  setTargetPosition(x: number, y: number, currentX: number, currentY: number): void {
    const dx = x - currentX
    const dy = y - currentY
    const distance = Math.sqrt(dx * dx + dy * dy)
    
    if (distance < 1) {
      // Already at target
      this.targetPosition = null
      this.startPosition = null
      this.setState('idle')
      return
    }
    
    this.startPosition = { x: currentX, y: currentY }
    this.targetPosition = { x, y }
    this.movementStartTime = Date.now()
    this.movementDuration = (distance / this.speed) * 1000 // Convert to milliseconds
    this.setState('moving')
    this.options.onMovementStart?.()
  }
  
  update(currentX: number, currentY: number): { x: number, y: number, direction: Direction, state: 'idle' | 'moving' } {
    if (!this.targetPosition || !this.startPosition) {
      return {
        x: currentX,
        y: currentY,
        direction: this.currentDirection,
        state: this.currentState
      }
    }
    
    const currentTime = Date.now()
    const elapsed = currentTime - this.movementStartTime
    const progress = Math.min(elapsed / this.movementDuration, 1)
    
    // Calculate new position using linear interpolation
    const newX = this.startPosition.x + (this.targetPosition.x - this.startPosition.x) * progress
    const newY = this.startPosition.y + (this.targetPosition.y - this.startPosition.y) * progress
    
    // Update direction based on movement
    const dx = this.targetPosition.x - this.startPosition.x
    const dy = this.targetPosition.y - this.startPosition.y
    let newDirection = this.currentDirection
    
    if (Math.abs(dx) > Math.abs(dy)) {
      newDirection = dx > 0 ? Direction.Right : Direction.Left
    } else {
      newDirection = dy > 0 ? Direction.Down : Direction.Up
    }
    
    if (newDirection !== this.currentDirection) {
      this.setDirection(newDirection)
    }
    
    // Check if movement is complete
    if (progress >= 1) {
      this.targetPosition = null
      this.startPosition = null
      this.setState('idle')
      this.options.onMovementComplete?.()
    }
    
    return {
      x: newX,
      y: newY,
      direction: this.currentDirection,
      state: this.currentState
    }
  }
  
  getDirection(): Direction {
    return this.currentDirection
  }
  
  getState(): 'idle' | 'moving' {
    return this.currentState
  }
  
  isMoving(): boolean {
    return this.currentState === 'moving'
  }
  
  cancelMovement(): void {
    this.targetPosition = null
    this.startPosition = null
    this.setState('idle')
  }
  
  private setDirection(direction: Direction): void {
    if (this.currentDirection !== direction) {
      this.currentDirection = direction
      this.options.onDirectionChange?.(direction)
    }
  }
  
  private setState(state: 'idle' | 'moving'): void {
    if (this.currentState !== state) {
      this.currentState = state
      this.options.onStateChange?.(state)
    }
  }
}
```

## Design Decision: Composition Over Mixins

**Why Composition?**
- **Clear Ownership**: MovementController is a property of the view, not mixed in - easier to understand and debug
- **Type Safety**: TypeScript works better with composition than mixins
- **Flexibility**: Can easily swap or extend MovementController without affecting the view hierarchy
- **Simplicity**: No complex mixin application logic - just create an instance
- **Testability**: Easier to test MovementController in isolation
- **Phaser Compatibility**: Phaser containers work better with composition than mixins

**Two Usage Patterns**:

1. **BaseMovementView (Recommended)**: Extend this base class for standard entities
   - Provides movement functionality out of the box
   - Handles depth sorting, position updates, and movement interpolation
   - Subclasses implement `updateVisuals()` and `setupVisuals()`

2. **Manual Composition (Advanced)**: Create MovementController instance directly
   - Use when you need more control or can't extend BaseMovementView
   - Handle movement updates manually in your update loop
   - More flexible but requires more boilerplate

## Conclusion

This frontend movement controller system provides a reusable, flexible solution for entity movement that integrates seamlessly with the unified movement system on the backend. It uses composition (MovementController as a property) rather than mixins, making it easier to understand, test, and maintain. The system handles position interpolation, direction calculation, state management, animation updates, and depth sorting automatically, reducing code duplication and improving maintainability. Entities can either extend BaseMovementView for standard cases or use manual composition for advanced scenarios.

