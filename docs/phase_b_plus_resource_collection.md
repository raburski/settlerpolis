## Phase B+ — Resource Collection & Construction Plan

### Objective
Extend Phase B to enable carriers to collect resources (logs, stone) from the ground and deliver them to construction sites. Construction sites will have two phases: **resource collection** (carriers bring required resources) and **construction** (builders work on the building). Construction only progresses when all required resources are collected AND a builder is present at the building.

**Goal:** Carriers automatically pick up logs and stone from the ground and deliver them to construction sites. Once all resources are collected, builders can work on construction. No resources or no builder = no construction progress.

**Note:** This phase focuses on a simple resource collection flow: ground items → construction sites. Production buildings and complex storage systems will be added in Phase C.

---

### Existing Building Blocks

- **BuildingManager (`packages/game/src/Buildings`)**  
	Manages building instances and construction progress. Needs extension for resource collection phase and resource tracking. Delegates job creation to JobsManager.

- **PopulationManager (`packages/game/src/Population`)**  
	Tracks settlers by profession (Carrier, Builder). State machine handles worker assignment. Provides query methods for JobsManager (getAvailableCarriers, findWorkerForBuilding). Executes job assignments on settlers (state transitions, movement).

- **JobsManager (`packages/game/src/Jobs`)** - **NEW**  
	Handles job creation, tracking, and coordination. Creates transport jobs (carriers picking up items from ground). Creates worker jobs (construction/production). Tracks active jobs per building. Coordinates between BuildingManager and PopulationManager.

- **MovementManager (`packages/game/src/Movement`)**  
	Provides unified, entity-agnostic movement system. Used by settlers for all movement, including transport.

- **LootManager (`packages/game/src/Loot`)**  
	Manages dropped items on the map. Used as source for resources (logs, stone on the ground).

- **MapManager (`packages/game/src/Map`)**  
	Provides pathfinding for movement. Used by carriers to navigate to items and construction sites.

- **SettlerStateMachine (`packages/game/src/Population/StateMachine`)**  
	Manages settler state transitions. Needs new states for carrier transport jobs (picking up items from ground, carrying items to construction sites).

---

### Shared Game Package Additions (`packages/game`)

#### 1. Content Schema Extensions

**No new content schema extensions needed** - We reuse existing buildings, items, and professions.

**Extend `BuildingDefinition` to include (optional, defaults apply):**
- No changes needed - existing `costs` array defines required resources
- Construction sites automatically collect resources based on `costs`

#### 2. Type Definitions

**Extend `ConstructionStage` in `src/Buildings/types.ts`:**
```typescript
export enum ConstructionStage {
	CollectingResources = 'collecting_resources', // Building placed, resources being collected by carriers
	Constructing = 'constructing',                // Resources collected, builder working
	Completed = 'completed'
}
```

**Note:** 
- `Foundation` stage is removed - buildings start in `CollectingResources` immediately after placement
- `Cancelled` stage is removed - cancelled buildings are simply deleted, not kept in a cancelled state

**Extend `BuildingInstance` in `src/Buildings/types.ts`:**
```typescript
export interface BuildingInstance {
	id: string
	buildingId: BuildingId
	playerId: string
	mapName: string
	position: Position
	stage: ConstructionStage
	progress: number // 0-100 (construction progress, only advances during Constructing stage)
	startedAt: number // timestamp when construction started (when resources were collected)
	createdAt: number // timestamp when building was placed
	collectedResources: Map<string, number> // itemType -> quantity collected (NEW)
	requiredResources: BuildingCost[] // Required resources (derived from definition.costs) (NEW)
}
```

**Extend `SettlerState` in `src/Population/types.ts`:**
```typescript
export enum SettlerState {
	Idle = 'idle',
	Spawned = 'spawned',
	MovingToTool = 'moving_to_tool',
	MovingToBuilding = 'moving_to_building',
	Working = 'working',
	WaitingForWork = 'waiting_for_work',
	MovingToItem = 'moving_to_item',        // NEW: Moving to pick up item from ground
	CarryingItem = 'carrying_item',         // NEW: Carrying item and moving to construction site for delivery
	AssignmentFailed = 'assignment_failed'
}
```

**Extend `SettlerStateContext` in `src/Population/types.ts`:**
```typescript
export interface SettlerStateContext {
	targetId?: string              // ID of tool, building, or item being moved to
	targetPosition?: Position      // Target position for movement
	jobId?: string                 // Current job assignment ID
	errorReason?: string           // Reason for failure state
	// Note: buildingInstanceId, pendingAssignment, and carriedItemId removed
	// - Use jobId to look up JobAssignment for buildingInstanceId and requiredProfession
	// - For transport jobs, use JobAssignment.carriedItemId (or sourceItemId before pickup)
}
```

**Note:** 
- `buildingInstanceId` removed from `SettlerStateContext` - look up from `JobAssignment` using `jobId`
- `pendingAssignment` removed from `SettlerStateContext` - `JobAssignment` is created immediately with `status='pending'`, so `buildingInstanceId` and `requiredProfession` are in the job
- `carriedItemId` removed from `SettlerStateContext` - moved to `JobAssignment.carriedItemId` for transport jobs
- `carriedItemType` removed - item type can be looked up from `carriedItemId` via LootManager or ItemsManager
- `carriedQuantity` removed - always assumed to be 1 for ground items

**Add `JobType` enum and extend `JobAssignment` in `src/Population/types.ts`:**
```typescript
export enum JobType {
	Construction = 'construction',  // Building under construction
	Production = 'production',      // Completed building with worker slots
	Transport = 'transport'         // Carrier transport job
}

export interface JobAssignment {
	jobId: string
	settlerId: SettlerId
	buildingInstanceId: string
	jobType: JobType // Construction, Production, or Transport
	priority: number
	assignedAt: number
	status: 'pending' | 'active' | 'completed' | 'cancelled'
	// Transport-specific fields (only populated when jobType === JobType.Transport)
	sourceItemId?: string        // Item ID on the ground (from LootManager) - before pickup
	carriedItemId?: string       // Item ID being carried - after pickup (item removed from LootManager)
	sourcePosition?: Position    // Position of item on the ground
	itemType?: string            // Item type to transport (logs, stone, etc.)
	quantity?: number            // Quantity to transport (always 1 for ground items)
	// Worker assignment fields (for construction/production jobs that need tool pickup first)
	requiredProfession?: ProfessionType // Required profession for this job (if settler needs tool)
}
```

**Note:** 
- `JobType` enum provides type safety and consistency for job types
- Removed `CarrierJob` interface - transport job details are now part of `JobAssignment`
- Transport-specific fields are optional and only used when `jobType === JobType.Transport`
- This eliminates redundancy and cross-manager dependencies
- `JobsManager` tracks active transport jobs by storing `jobId` references

#### 3. Events

**Note:** No `JobsEvents` needed - job state is surfaced through existing events:
- **Settler state**: `PopulationEvents.SC.SettlerUpdated` (settler state changes reflect job assignments)
  - `MovingToItem` → transport job active
  - `CarryingItem` → transport job in progress
  - `MovingToBuilding` → worker job active
  - `Working` → worker job active
  - `Idle` → no active job
- **Building state**: `BuildingsEvents.SC.ResourceDelivered`, `BuildingsEvents.SC.ResourcesCollected`, `BuildingsEvents.SC.StageChanged` (reflect transport job completion)
- **Movement**: `MovementEvents.SS.PathComplete` (with `targetType='item'` or `targetType='building'`) for internal coordination
- **Worker assignment**: `PopulationEvents.SC.WorkerAssigned`, `PopulationEvents.SC.WorkerUnassigned` (already exist)
- **Worker request failure**: `PopulationEvents.SC.WorkerRequestFailed` (already exists)

**Extend Building Events (`src/Buildings/events.ts`):**
```typescript
export const BuildingsEvents = {
	CS: {
		Place: 'cs:buildings:place',
		Cancel: 'cs:buildings:cancel',
		RequestPreview: 'cs:buildings:request-preview'
	},
	SC: {
		Placed: 'sc:buildings:placed',
		Progress: 'sc:buildings:progress',
		Completed: 'sc:buildings:completed',
		Cancelled: 'sc:buildings:cancelled',
		Catalog: 'sc:buildings:catalog',
		ResourcesCollected: 'sc:buildings:resources-collected', // NEW: Resources collected for construction site
		ResourceDelivered: 'sc:buildings:resource-delivered',   // NEW: Single resource delivered
		StageChanged: 'sc:buildings:stage-changed'              // NEW: Construction stage changed
	},
	SS: {
		Tick: 'ss:buildings:tick',
		HouseCompleted: 'ss:buildings:house-completed',
		// ResourceNeeded event removed - BuildingManager calls JobsManager directly
	}
} as const
```

#### 4. JobsManager (`src/Jobs/index.ts`) - NEW

**New Manager:**
```typescript
export class JobsManager {
	constructor(
		private event: EventManager,
		private buildingManager: BuildingManager,
		private populationManager: PopulationManager,
		private lootManager: LootManager,
		private mapManager: MapManager
	) {
		this.setupEventHandlers()
	}
	
	private jobs = new Map<string, JobAssignment>() // jobId -> JobAssignment
	private activeJobsByBuilding = new Map<string, Set<string>>() // buildingInstanceId -> Set<jobId>
	
	// Transport Jobs
	public requestResourceCollection(buildingInstanceId: string, itemType: string): void
	
	// Worker Jobs (construction/production)
	public requestWorker(buildingInstanceId: string): void
	
	// Job Tracking
	public getActiveJobsForBuilding(buildingInstanceId: string): JobAssignment[]
	public hasActiveJobForBuilding(buildingInstanceId: string, itemType?: string): boolean
	public getJob(jobId: string): JobAssignment | undefined
	
	// Job Completion
	public completeJob(jobId: string): void
	public cancelJob(jobId: string, reason?: string): void
	public assignWorkerToJob(jobId: string, settlerId: string): void
}
```

**See `docs/jobs_manager_design.md` for detailed implementation.**

#### 5. BuildingManager Extensions (`src/Buildings/index.ts`)

**Constructor Changes:**
```typescript
export class BuildingManager {
	constructor(
		private event: EventManager,
		private mapManager: MapManager,
		private inventoryManager: InventoryManager,
		private mapObjectsManager: MapObjectsManager,
		private jobsManager: JobsManager  // NEW: Inject JobsManager
	) {
		// ...
	}
	
	// ... existing properties ...
	private resourceRequests: Map<string, Set<string>> = new Map() // buildingInstanceId -> Set<itemType> (resources still needed)
	// Note: activeTransportJobs removed - JobsManager tracks jobs now
}
```

**New Methods:**
```typescript
// Initialize building with resource collection
private initializeBuildingResources(building: BuildingInstance, definition: BuildingDefinition): void {
	// Initialize collectedResources map
	building.collectedResources = new Map()
	
	// Initialize requiredResources from definition.costs
	building.requiredResources = definition.costs.map(cost => ({
		itemType: cost.itemType,
		quantity: cost.quantity
	}))
	
	// Initialize resourceRequests set with all required item types
	const neededResources = new Set<string>()
	for (const cost of building.requiredResources) {
		neededResources.add(cost.itemType)
	}
	this.resourceRequests.set(building.id, neededResources)
	
	// Set stage to CollectingResources
	building.stage = ConstructionStage.CollectingResources
	building.progress = 0
}

// Check if building has all required resources
private hasAllRequiredResources(building: BuildingInstance): boolean {
	for (const cost of building.requiredResources) {
		const collected = building.collectedResources.get(cost.itemType) || 0
		if (collected < cost.quantity) {
			return false
		}
	}
	return true
}

// Add resource to building (called when carrier delivers)
public addResourceToBuilding(buildingInstanceId: string, itemType: string, quantity: number): boolean {
	const building = this.buildings.get(buildingInstanceId)
	if (!building) {
		return false
	}
	
	// Check if building still needs this resource
	const neededResources = this.resourceRequests.get(buildingInstanceId)
	if (!neededResources || !neededResources.has(itemType)) {
		return false // Building doesn't need this resource anymore
	}
	
	// Get required quantity
	const requiredCost = building.requiredResources.find(cost => cost.itemType === itemType)
	if (!requiredCost) {
		return false
	}
	
	// Add to collected resources
	const currentCollected = building.collectedResources.get(itemType) || 0
	const newCollected = Math.min(currentCollected + quantity, requiredCost.quantity)
	building.collectedResources.set(itemType, newCollected)
	
	// If resource is fully collected, remove from needed resources
	if (newCollected >= requiredCost.quantity) {
		neededResources.delete(itemType)
		if (neededResources.size === 0) {
			this.resourceRequests.delete(buildingInstanceId)
		}
	}
	
	// Emit resource delivered event
	this.event.emit(Receiver.Group, BuildingsEvents.SC.ResourceDelivered, {
		buildingInstanceId: building.id,
		itemType,
		quantity: newCollected,
		requiredQuantity: requiredCost.quantity
	}, building.mapName)
	
	// Check if all resources are collected
	if (this.hasAllRequiredResources(building)) {
		// Transition to Constructing stage
		building.stage = ConstructionStage.Constructing
		building.startedAt = Date.now() // Start construction timer
		
		// Emit stage changed event
		this.event.emit(Receiver.Group, BuildingsEvents.SC.StageChanged, {
			buildingInstanceId: building.id,
			stage: building.stage
		}, building.mapName)
		
		// Emit resources collected event
		this.event.emit(Receiver.Group, BuildingsEvents.SC.ResourcesCollected, {
			buildingInstanceId: building.id
		}, building.mapName)
	}
	
	return true
}

// Request carrier to collect resource (delegate to JobsManager)
public requestResourceCollection(buildingInstanceId: string, itemType: string): void {
	// Simply delegate to JobsManager
	this.jobsManager.requestResourceCollection(buildingInstanceId, itemType)
}

// Check if construction can progress (resources collected AND builder present)
private canConstructionProgress(building: BuildingInstance): boolean {
	// Check if all resources are collected
	if (!this.hasAllRequiredResources(building)) {
		return false
	}
	
	// Check if builder is assigned to building
	const assignedWorkers = this.getBuildingWorkers(building.id)
	if (assignedWorkers.length === 0) {
		return false // No builder assigned
	}
	
	// Check if builder is at the building (arrived and working)
	// This is handled by PopulationManager - builder must be in Working state
	return true
}

// Updated tick method
private tick() {
	const now = Date.now()
	const buildingsToUpdate: BuildingInstance[] = []

	// Collect all buildings that are under construction
	for (const building of this.buildings.values()) {
		if (building.stage === ConstructionStage.CollectingResources) {
			// Check if resources are still needed and request carriers
			this.processResourceCollection(building)
		} else if (building.stage === ConstructionStage.Constructing) {
			// Check if construction can progress
			if (this.canConstructionProgress(building)) {
				buildingsToUpdate.push(building)
			}
		}
		// Note: Completed buildings are not processed in the tick loop
	}

	// Update progress for buildings in Constructing stage with builders
	for (const building of buildingsToUpdate) {
		const definition = this.definitions.get(building.buildingId)
		if (!definition) continue

		const elapsed = (now - building.startedAt) / 1000 // elapsed time in seconds
		const progress = this.calculateConstructionProgress(building, elapsed)

		// Update building progress
		building.progress = progress
		building.stage = progress < 100 ? ConstructionStage.Constructing : ConstructionStage.Completed

		// Emit progress update
		const progressData: BuildingProgressData = {
			buildingInstanceId: building.id,
			progress,
			stage: building.stage
		}
		this.event.emit(Receiver.Group, BuildingsEvents.SC.Progress, progressData, building.mapName)

		// Check if construction is complete
		if (progress >= 100 && building.stage === ConstructionStage.Completed) {
			this.completeBuilding(building)
		}
	}
}

// Process resource collection for a building
private processResourceCollection(building: BuildingInstance): void {
	const neededResources = this.resourceRequests.get(building.id)
	if (!neededResources || neededResources.size === 0) {
		return // All resources collected
	}
	
	// Check for each needed resource type
	for (const itemType of neededResources) {
		// Check if we already have an active transport job for this resource type
		// JobsManager tracks active jobs per building
		if (!this.jobsManager.hasActiveJobForBuilding(building.id, itemType)) {
			// Request carrier to collect this resource (delegate to JobsManager)
			this.requestResourceCollection(building.id, itemType)
		}
	}
}
```

**Updated Methods:**
- `placeBuilding`: Initialize building with `CollectingResources` stage (removed `Foundation` stage)
- `completeBuilding`: Clean up resource requests (JobsManager handles job cleanup)
- `cancelBuilding`: Clean up resource requests, refund collected resources, then delete building (no `Cancelled` stage). JobsManager will cancel active jobs.

#### 6. PopulationManager Extensions (`src/Population/index.ts`)

**Constructor Changes:**
```typescript
export class PopulationManager {
	constructor(
		private event: EventManager,
		private buildingManager: BuildingManager,
		private scheduler: Scheduler,
		private mapManager: MapManager,
		private lootManager: LootManager,
		private itemsManager: ItemsManager,
		private movementManager: MovementManager,
		private jobsManager: JobsManager  // NEW: Inject JobsManager for job completion
	) {
		// ...
	}
	
	// ... existing properties ...
	// Note: jobs map removed - JobsManager tracks jobs now
}
```

**New Methods (Query methods for JobsManager):**
```typescript
// Get available carriers (Carrier profession, Idle state)
public getAvailableCarriers(mapName: string, playerId: string): Settler[] {
	return Array.from(this.settlers.values()).filter(settler =>
		settler.mapName === mapName &&
		settler.playerId === playerId &&
		settler.profession === ProfessionType.Carrier &&
		settler.state === SettlerState.Idle
	)
}

// Find worker for building (handles profession requirements and tool pickup)
public findWorkerForBuilding(
	buildingInstanceId: string,
	requiredProfession?: ProfessionType,
	mapName?: string,
	playerId?: string
): Settler | null {
	// Finds available worker with required profession
	// Handles tool pickup if needed
	// Returns closest available settler or null
}

// Assign worker to transport job (called by JobsManager)
public assignWorkerToTransportJob(
	settlerId: string,
	jobId: string,
	jobAssignment: JobAssignment
): void {
	const settler = this.settlers.get(settlerId)
	if (!settler) {
		return
	}
	
	// Assign job to settler
	settler.currentJob = jobAssignment
	settler.stateContext.jobId = jobId
	
	// Execute state transition: Idle -> MovingToItem
	// Only jobId needed - transition will look up job details
	this.stateMachine.executeTransition(settler, SettlerState.MovingToItem, {
		jobId: jobAssignment.jobId
	})
}

// Handle carrier item pickup (called when carrier arrives at item)
public handleCarrierItemPickup(carrierId: string, itemId: string, jobId: string): void {
	const settler = this.settlers.get(carrierId)
	if (!settler) {
		return
	}
	
	// Get job from JobsManager
	const job = this.jobsManager.getJob(jobId)
	if (!job || job.settlerId !== carrierId || job.jobType !== JobType.Transport) {
		return
	}
	
	// Transport job details are in the job assignment
	if (!job.sourceItemId || !job.itemType || !job.buildingInstanceId) {
		return
	}
	
	// Pick up item from ground (using LootManager)
	const fakeClient: EventClient = {
		id: settler.playerId,
		currentGroup: settler.mapName,
		emit: (receiver, event, data, target?) => {
			this.event.emit(receiver, event, data, target)
		},
		setGroup: (group: string) => {
			// No-op for fake client
		}
	}
	
	const pickedItem = this.lootManager.pickItem(itemId, fakeClient)
	if (!pickedItem) {
		// Item was already picked up or doesn't exist
		// Cancel transport job
		this.jobsManager.cancelJob(jobId, 'item_not_found')
		return
	}
	
	// Update job with carried item ID (item removed from LootManager)
	job.carriedItemId = itemId
	job.sourceItemId = undefined // Clear sourceItemId after pickup
	
	// Execute state transition: MovingToItem -> CarryingItem
	this.stateMachine.executeTransition(settler, SettlerState.CarryingItem, {
		jobId: jobId
	})
	
	// Emit settler updated event (item pickup is a state change)
	// Job completion will be handled by JobsManager and emit JobsEvents.SC.JobCompleted
	this.event.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
		settler
	}, settler.mapName)
}

// Handle carrier item delivery (called when carrier arrives at construction site)
public handleCarrierItemDelivery(carrierId: string, buildingInstanceId: string, jobId: string): void {
	const settler = this.settlers.get(carrierId)
	if (!settler) {
		return
	}
	
	// Get job from JobsManager
	const job = this.jobsManager.getJob(jobId)
	if (!job || job.settlerId !== carrierId || job.jobType !== JobType.Transport) {
		return
	}
	
	// Transport job details are in the job assignment
	if (!job.itemType) {
		return
	}
	
	// Deliver item to building (using BuildingManager)
	// Quantity is always 1 for ground items
	this.buildingManager.addResourceToBuilding(buildingInstanceId, job.itemType, 1)
	
	// Job will be completed by JobsManager - carriedItemId will be cleared
	
	// Clear job from settler
	settler.currentJob = undefined
	
	// Complete transport job (JobsManager handles job cleanup)
	this.jobsManager.completeJob(jobId)
	
	// Execute state transition: CarryingItem -> Idle
	this.stateMachine.executeTransition(settler, SettlerState.Idle, {})
	
	// Emit settler updated event (state changed to Idle)
	this.event.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
		settler
	}, settler.mapName)
	
	// Note: JobsManager.completeJob() already emits JobsEvents.SC.JobCompleted
	// Note: BuildingManager.addResourceToBuilding() already emits BuildingsEvents.SC.ResourceDelivered
}

// Note: Job cancellation is handled by JobsManager
// PopulationManager only handles settler state and movement
// If a job is cancelled, JobsManager will call PopulationManager methods to clean up settler state
```

**Constructor Updates:**
- Add `jobsManager` as dependency (injected via constructor)
- Remove job tracking (JobsManager handles jobs)
- Remove `jobs` map (JobsManager tracks jobs)

#### 6. State Machine Extensions (`src/Population/StateMachine.ts`)

**New State Transitions:**

**IdleToMovingToItem.ts:**
```typescript
import { StateTransition } from './types'
import { SettlerState } from '../types'
import { Receiver } from '../../Receiver'
import { PopulationEvents } from '../events'

export interface MovingToItemContext {
	jobId: string
	// Note: All job details (itemId, itemPosition, buildingInstanceId, itemType) are in JobAssignment
	// Look up job using jobId to get these details
}

export const IdleToMovingToItem: StateTransition<MovingToItemContext> = {
	condition: (settler, context) => {
		// Settler is Carrier and has a transport job
		return settler.profession === ProfessionType.Carrier && context.jobId !== undefined
	},
	
	validate: (settler, context, managers) => {
		// Verify item exists (check LootManager)
		const mapItems = managers.lootManager.getMapItems(settler.mapName)
		const item = mapItems.find(item => item.id === context.itemId)
		return item !== undefined
	},
	
	action: (settler, context, managers) => {
		// Get job to get item details
		const job = managers.jobsManager.getJob(context.jobId)
		if (!job || !job.sourceItemId || !job.sourcePosition) {
			throw new Error(`[IdleToMovingToItem] Job ${context.jobId} not found or missing source item`)
		}
		
		// Update state
		settler.state = SettlerState.MovingToItem
		settler.stateContext = {
			jobId: context.jobId,
			targetId: job.sourceItemId,
			targetPosition: job.sourcePosition
		}
		
		// Start movement to item
		managers.movementManager.moveToPosition(settler.id, job.sourcePosition, {
			targetType: 'item',
			targetId: job.sourceItemId
		})
		
		// Emit state update
		managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
			settler
		}, settler.mapName)
	},
	
	completed: (settler, managers) => {
		// When movement completes, transition to CarryingItem
		// This is handled by PopulationManager.handleCarrierItemPickup
		return SettlerState.CarryingItem
	}
}
```

**MovingToItemToCarryingItem.ts:**
```typescript
import { StateTransition } from './types'
import { SettlerState } from '../types'
import { Receiver } from '../../Receiver'
import { PopulationEvents } from '../events'

export interface ItemPickupContext {
	jobId: string
	// Note: itemId, buildingInstanceId, itemType can be looked up from JobAssignment using jobId
}

export const MovingToItemToCarryingItem: StateTransition<ItemPickupContext> = {
	condition: (settler, context) => {
		// Settler has transport job and arrived at item
		return settler.stateContext.jobId === context.jobId
	},
	
	action: (settler, context, managers) => {
		// Get job to get building details
		const job = managers.jobsManager.getJob(context.jobId)
		if (!job) {
			throw new Error(`[MovingToItemToCarryingItem] Job ${context.jobId} not found`)
		}
		
		// Job.carriedItemId should already be set by PopulationManager.handleCarrierItemPickup
		// before this transition is called
		
		// Get building position
		const buildingPosition = managers.buildingManager.getBuildingPosition(job.buildingInstanceId)
		if (!buildingPosition) {
			throw new Error(`[MovingToItemToCarryingItem] Building ${job.buildingInstanceId} not found`)
		}
		
		// Update state
		settler.state = SettlerState.CarryingItem
		settler.stateContext = {
			jobId: context.jobId,
			targetId: job.buildingInstanceId, // Target building for delivery
			targetPosition: buildingPosition
		}
		
		// Start movement to building
		managers.movementManager.moveToPosition(settler.id, buildingPosition, {
			targetType: 'building',
			targetId: job.buildingInstanceId
		})
		
		// Emit state update
		managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
			settler
		}, settler.mapName)
	},
	
	completed: (settler, managers) => {
		// When movement completes, transition to Idle (delivery complete)
		// This is handled by PopulationManager.handleCarrierItemDelivery
		return SettlerState.Idle
	}
}
```

**CarryingItemToIdle.ts:**
```typescript
import { StateTransition } from './types'
import { SettlerState } from '../types'
import { Receiver } from '../../Receiver'
import { PopulationEvents } from '../events'

export interface ItemDeliveryContext {
	jobId: string
	// Note: buildingInstanceId, itemType can be looked up from JobAssignment using jobId
}

export const CarryingItemToIdle: StateTransition<ItemDeliveryContext> = {
	condition: (settler, context, managers) => {
		// Settler is carrying item and arrived at building
		const job = managers.jobsManager.getJob(context.jobId)
		return settler.state === SettlerState.CarryingItem &&
			settler.stateContext.jobId === context.jobId &&
			job !== undefined
	},
	
	action: (settler, context, managers) => {
		// Get job to verify delivery
		const job = managers.jobsManager.getJob(context.jobId)
		if (!job) {
			throw new Error(`[CarryingItemToIdle] Job ${context.jobId} not found`)
		}
		
		// Note: Actual item delivery is handled by PopulationManager.handleCarrierItemDelivery
		// when it receives MovementEvents.SS.PathComplete with targetType='building'
		// This transition just clears the state
		
		// Clear state (job will be completed by PopulationManager)
		settler.state = SettlerState.Idle
		settler.stateContext = {}
		settler.currentJob = undefined
		
		// Emit state update
		managers.eventManager.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
			settler
		}, settler.mapName)
	}
}
```

**Update `src/Population/transitions/index.ts`:**
```typescript
import { StateTransitionsConfig, SettlerState } from '../types'
import { IdleToMovingToTool } from './IdleToMovingToTool'
import { IdleToMovingToBuilding } from './IdleToMovingToBuilding'
import { IdleToMovingToItem } from './IdleToMovingToItem' // NEW
import { MovingToToolToMovingToBuilding } from './MovingToToolToMovingToBuilding'
import { MovingToToolToIdle } from './MovingToToolToIdle'
import { MovingToBuildingToWorking } from './MovingToBuildingToWorking'
import { MovingToBuildingToIdle } from './MovingToBuildingToIdle'
import { MovingToItemToCarryingItem } from './MovingToItemToCarryingItem' // NEW
import { CarryingItemToIdle } from './CarryingItemToIdle' // NEW
import { WorkingToIdle } from './WorkingToIdle'

export const SETTLER_STATE_TRANSITIONS: StateTransitionsConfig = {
	[SettlerState.Idle]: {
		[SettlerState.MovingToTool]: IdleToMovingToTool,
		[SettlerState.MovingToBuilding]: IdleToMovingToBuilding,
		[SettlerState.MovingToItem]: IdleToMovingToItem // NEW
	},
	[SettlerState.MovingToTool]: {
		[SettlerState.MovingToBuilding]: MovingToToolToMovingToBuilding,
		[SettlerState.Idle]: MovingToToolToIdle
	},
	[SettlerState.MovingToBuilding]: {
		[SettlerState.Working]: MovingToBuildingToWorking,
		[SettlerState.Idle]: MovingToBuildingToIdle
	},
	[SettlerState.MovingToItem]: {
		[SettlerState.CarryingItem]: MovingToItemToCarryingItem // NEW
	},
	[SettlerState.CarryingItem]: {
		[SettlerState.Idle]: CarryingItemToIdle // NEW
	},
	[SettlerState.Working]: {
		[SettlerState.Idle]: WorkingToIdle
	}
}
```

#### 7. BuildingManager Constructor Updates

**Add Dependencies:**
```typescript
constructor(
	private event: EventManager,
	private inventoryManager: InventoryManager,
	private mapObjectsManager: MapObjectsManager,
	private itemsManager: ItemsManager,
	private mapManager: MapManager,
	private lootManager: LootManager,        // NEW
	private populationManager: PopulationManager // NEW
) {
	// ... existing code ...
}
```

**Note:** This creates a circular dependency (BuildingManager needs PopulationManager, PopulationManager needs BuildingManager). We'll resolve this by:
1. Passing `populationManager` as a parameter to methods that need it (not storing it as a property)
2. Or using events for communication between managers
3. Or initializing `populationManager` reference after both managers are created

**Recommended Approach:** Use events for communication. `BuildingManager` emits `ss:buildings:resource-needed` events, and `PopulationManager` listens to these events to assign carriers.

#### 8. Event-Based Communication

**BuildingManager emits resource request events:**
```typescript
// In processResourceCollection
// BuildingManager calls JobsManager directly (no event needed)
this.jobsManager.requestResourceCollection(building.id, itemType)
```

**JobsManager handles resource collection requests:**
```typescript
// BuildingManager calls JobsManager in processResourceCollection
this.jobsManager.requestResourceCollection(building.id, itemType)

// JobsManager:
// 1. Gets building from BuildingManager
// 2. Checks if active job exists for this resource type
// 3. Finds item on ground (uses LootManager)
// 4. Finds available carrier (queries PopulationManager.getAvailableCarriers())
// 5. Creates JobAssignment with transport details
// 6. Calls PopulationManager.assignWorkerToTransportJob()
// 7. PopulationManager executes state transition and movement
```

**Event Flow:**
- `BuildingManager.processResourceCollection()` → `JobsManager.requestResourceCollection()`
- `JobsManager` creates job and assigns worker
- `PopulationManager` emits `PopulationEvents.SC.SettlerUpdated` (settler state: `MovingToItem`)

---

### Backend Adapter Touchpoints

**No new backend files needed** - Events auto-routed via `EventBusManager`.

**Event Routing:**
- `cs:jobs:*` → Routed to JobsManager (if needed in future)
- `sc:jobs:*`, `sc:buildings:resource-delivered`, `sc:buildings:resources-collected`, `sc:buildings:stage-changed`, `sc:population:settler-updated` → Broadcast to clients in map group
- No `ss:carrier:*` events needed - all handled by existing event systems

---

### Frontend Adapter Scope

#### 1. Building Info Panel Updates

**BuildingInfoPanel.tsx:**
- Display construction stage (CollectingResources, Constructing, Completed)
- Display collected resources (logs: 5/10, stone: 3/5)
- Display resource collection progress bar
- Show carrier assignments for resource collection
- Show builder assignment for construction
- Display construction progress (only when in Constructing stage)

#### 2. Game Scene Updates

**GameScene.ts:**
- Handle `sc:buildings:resource-delivered` events
- Handle `sc:buildings:resources-collected` events
- Handle `sc:buildings:stage-changed` events
- Handle `sc:jobs:transport-job-completed` events
- Update building visuals based on construction stage
- Display resource collection indicators on buildings
- Show carrier movement with carried items

#### 3. Services

**JobsService.ts (or extend BuildingService):**
- Cache transport jobs
- Subscribe to job events (`sc:jobs:*`)
- Provide methods to query active jobs for buildings

**BuildingService.ts (existing):**
- Extend to handle resource collection events
- Cache building resource collection state
- Provide methods to query building resources

---

### Content Pack Updates

**No content changes needed** - Existing buildings and items are used.

**Optional: Add more items to ground for testing:**
- Spawn logs and stone on the ground via content pack or LootManager
- Or use existing starting items that are dropped on the ground

---

### Event/State Lifecycle

#### 1. Building Placement & Resource Collection

1. Player places building
2. `BuildingManager.placeBuilding()` called
3. Building initialized with `CollectingResources` stage
4. `BuildingManager.tick()` detects building needs resources
5. `BuildingManager.processResourceCollection()` called
6. For each needed resource, `BuildingManager.requestResourceCollection()` called
7. `BuildingManager.requestResourceCollection()` calls `JobsManager.requestResourceCollection()`
8. `JobsManager` creates transport job and assigns carrier via `PopulationManager.assignWorkerToTransportJob()`
9. `PopulationManager` executes state transition: `Idle -> MovingToItem`
10. Carrier moves to item on ground

#### 2. Carrier Item Pickup

1. Carrier arrives at item on ground
2. `MovementEvents.SS.PathComplete` event emitted (targetType: 'item', targetId: itemId)
3. `PopulationManager.handleCarrierItemPickup()` called
4. Item picked up from ground (LootManager)
5. Job updated with `carriedItemId` (item stored in JobAssignment)
6. State transition: `MovingToItem -> CarryingItem`
7. Carrier starts moving to construction site
8. `PopulationEvents.SC.SettlerUpdated` event emitted (settler state changed to CarryingItem)

#### 3. Carrier Item Delivery

1. Carrier arrives at construction site
2. `MovementEvents.SS.PathComplete` event emitted (targetType: 'building', targetId: buildingInstanceId)
3. `PopulationManager.handleCarrierItemDelivery()` called
4. Item delivered to building (BuildingManager.addResourceToBuilding)
5. `BuildingsEvents.SC.ResourceDelivered` event emitted (by BuildingManager)
6. Building resource count updated
7. If all resources collected:
	- Building stage changes to `Constructing`
	- `BuildingsEvents.SC.StageChanged` event emitted
	- `BuildingsEvents.SC.ResourcesCollected` event emitted
8. Transport job completed (JobsManager.completeJob)
9. `JobsEvents.SC.JobCompleted` event emitted (by JobsManager)
10. State transition: `CarryingItem -> Idle`
11. `PopulationEvents.SC.SettlerUpdated` event emitted (settler state changed to Idle)

#### 4. Construction Progress

1. Building in `Constructing` stage
2. `BuildingManager.tick()` checks if construction can progress
3. `BuildingManager.canConstructionProgress()` checks:
	- All resources collected? ✓
	- Builder assigned and working? ✓
4. If both conditions met, construction progresses
5. Construction progress calculated based on elapsed time and builder presence
6. `BuildingsEvents.SC.Progress` event emitted
7. When progress reaches 100%, building completes
8. `BuildingsEvents.SC.Completed` event emitted

#### 5. Builder Assignment

1. Player requests worker for building (existing Phase B flow)
2. Building in `Constructing` stage (resources collected)
3. Builder assigned to building
4. Builder moves to building
5. Builder arrives at building
6. Builder state: `Working`
7. Construction can now progress

---

### Design Decisions

#### 1. Resource Collection Phase

**Rationale:** Construction sites need resources before construction can start. This creates a two-phase system: resource collection (carriers) and construction (builders).

**Implementation:**
- Building starts in `CollectingResources` stage
- Carriers automatically collect required resources from ground
- Building transitions to `Constructing` stage when all resources are collected
- Construction only progresses when builder is present

#### 2. Ground Items as Resource Source

**Rationale:** For Phase B+, we use items on the ground (logs, stone) as the resource source. This is simpler than production buildings and storage systems.

**Implementation:**
- Items on the ground are managed by LootManager
- Carriers find nearby items and pick them up
- Items are delivered directly to construction sites
- No intermediate storage needed

#### 3. Construction Progress Gating

**Rationale:** Construction should only progress when both conditions are met: resources collected AND builder present. This ensures realistic construction flow.

**Implementation:**
- `BuildingManager.canConstructionProgress()` checks both conditions
- Construction progress is calculated only when builder is working
- If builder leaves, construction pauses
- If resources are missing, construction cannot start

#### 4. JobsManager System

**Rationale:** Job creation and tracking should be separated from BuildingManager and PopulationManager. JobsManager coordinates between managers and handles all job-related logic.

**Implementation:**
- JobsManager creates transport jobs when resources are needed
- Jobs track: source item, target building, item type, status
- Jobs are stored in JobsManager (single source of truth)
- JobsManager coordinates between BuildingManager and PopulationManager
- PopulationManager handles settler state and movement execution

#### 5. Constructor Injection Pattern

**Rationale:** All managers use constructor injection for dependencies, following the existing codebase pattern. JobsManager is injected into BuildingManager and PopulationManager.

**Implementation:**
- JobsManager receives BuildingManager, PopulationManager, LootManager, MapManager via constructor
- BuildingManager receives JobsManager via constructor
- PopulationManager receives JobsManager via constructor
- No circular dependencies (JobsManager depends on BuildingManager/PopulationManager, but not vice versa)

#### 6. Event-Based Communication

**Rationale:** Events provide loose coupling between managers for state updates and notifications.

**Implementation:**
- Job state is surfaced through settler state (`PopulationEvents.SC.SettlerUpdated`) and building state (`BuildingsEvents.SC.ResourceDelivered`, `BuildingsEvents.SC.StageChanged`)
- BuildingManager emits building-related events (`BuildingsEvents.SC.ResourceDelivered`, `BuildingsEvents.SC.StageChanged`)
- PopulationManager emits population-related events (`PopulationEvents.SC.SettlerUpdated`)

---

### Edge Cases & Error Handling

#### 1. Item Already Picked Up

**Scenario:** Multiple carriers assigned to same item, or item picked up by player.

**Handling:**
- Check if item exists before pickup
- If item doesn't exist, cancel carrier job
- Return carrier to Idle state
- Request new resource collection

#### 2. Building Destroyed During Transport

**Scenario:** Building cancelled or destroyed while carrier is transporting.

**Handling:**
- Cancel carrier job when building is destroyed
- If carrier is carrying item, drop it at current location
- Return carrier to Idle state
- Clean up carrier jobs in BuildingManager

#### 3. No Items Available

**Scenario:** No items on the ground for required resource type.

**Handling:**
- Building stays in `CollectingResources` stage
- Periodically check for items (in tick loop)
- Emit UI event for feedback (no resources available)
- Player can manually place items or wait for items to spawn

#### 4. No Carriers Available

**Scenario:** No available carriers when resource is needed.

**Handling:**
- Building stays in `CollectingResources` stage
- Periodically check for available carriers (in tick loop)
- Emit UI event for feedback (no carriers available)
- Player can wait for carriers to become available or spawn more

#### 5. Builder Leaves During Construction

**Scenario:** Builder unassigned or moves away during construction.

**Handling:**
- Construction progress pauses
- Building remains in `Constructing` stage
- Construction resumes when builder is reassigned
- Progress is calculated based on elapsed time when builder is present

#### 6. Resources Collected But No Builder

**Scenario:** All resources collected but no builder assigned.

**Handling:**
- Building transitions to `Constructing` stage
- Construction progress is 0% (no builder)
- Construction cannot progress until builder is assigned
- UI shows "Waiting for builder" status

---

### Files To Touch (Implementation)

#### Game Core (`packages/game/src`)
- `src/Buildings/types.ts` - Extend ConstructionStage, BuildingInstance
- `src/Buildings/events.ts` - Add resource collection events
- `src/Buildings/index.ts` - Add resource collection logic, carrier job management
- `src/Population/types.ts` - Extend SettlerState, SettlerStateContext, JobAssignment
- `src/Population/transitions/` - Add new state transitions:
	- `IdleToMovingToItem.ts`
	- `MovingToItemToCarryingItem.ts`
	- `CarryingItemToIdle.ts`
- `src/Population/transitions/index.ts` - Register new transitions
- `src/Population/transitions/types.ts` - Add new context types
- `src/Population/index.ts` - Add carrier transport job methods (assignWorkerToTransportJob, handleCarrierItemPickup, handleCarrierItemDelivery)
- `src/Population/StateMachine.ts` - No changes needed (uses existing state machine with new transitions)
- `src/Jobs/index.ts` - New JobsManager class
- `src/Jobs/events.ts` - Not needed (no job events - state surfaced through settler/building events)
- `src/Jobs/types.ts` - JobAssignment types (already in Population/types.ts, just need to export)
- `src/events.ts` - Register Jobs namespace
- `src/index.ts` - Update BuildingManager and PopulationManager constructors to inject JobsManager

#### Backend (`packages/backend/src`)
- No new files needed (events auto-routed)

#### Frontend (`packages/frontend/src/game`)
- `components/BuildingInfoPanel.tsx` - Add resource collection display
- `services/BuildingService.ts` - Extend to handle resource collection events (`JobsEvents`, `BuildingsEvents`)
- `services/PopulationService.ts` - Already handles `PopulationEvents.SC.SettlerUpdated` for carrier state changes
- `scenes/base/GameScene.ts` - Handle resource collection events (no carrier-specific events needed)

#### Content (`content/<pack>/`)
- No content changes needed (optional: add more ground items for testing)

---

### Testing & Verification

#### Unit Tests
- Test `BuildingManager` resource collection initialization
- Test `BuildingManager` resource delivery and stage transitions
- Test `BuildingManager` construction progress gating (resources + builder)
- Test `PopulationManager` carrier job assignment
- Test `PopulationManager` carrier item pickup and delivery
- Test state transitions for carrier jobs

#### Integration Tests
- Test building placement initializes resource collection
- Test carrier picks up item from ground
- Test carrier delivers item to construction site
- Test building transitions to Constructing stage when resources collected
- Test construction progresses only when builder is present
- Test construction pauses when builder leaves
- Test carrier job cancellation when building is destroyed

#### Manual Testing
1. **Local Simulation - Resource Collection:**
	- Place building (e.g., house)
	- Verify building is in `CollectingResources` stage
	- Place logs and stone on the ground near building
	- Verify carrier is assigned to collect resources
	- Verify carrier picks up item from ground
	- Verify carrier delivers item to construction site
	- Verify building resource count updates
	- Verify building transitions to `Constructing` stage when all resources collected

2. **Local Simulation - Construction with Builder:**
	- Place building and wait for resources to be collected
	- Verify building is in `Constructing` stage
	- Request builder for building
	- Verify builder moves to building
	- Verify builder arrives and starts working
	- Verify construction progress advances
	- Verify building completes when progress reaches 100%

3. **Local Simulation - Construction Without Builder:**
	- Place building and wait for resources to be collected
	- Verify building is in `Constructing` stage
	- Verify construction progress is 0% (no builder)
	- Request builder for building
	- Verify construction progresses after builder arrives

4. **Local Simulation - Builder Leaves:**
	- Place building with builder working
	- Verify construction is progressing
	- Unassign builder from building
	- Verify construction progress pauses
	- Reassign builder to building
	- Verify construction resumes

5. **Local Simulation - Multiple Carriers:**
	- Place building requiring multiple resources
	- Place multiple items on the ground
	- Verify multiple carriers are assigned
	- Verify carriers collect and deliver resources
	- Verify building collects all resources

6. **Multiplayer:**
	- Two players place buildings
	- Verify resource collection syncs across clients
	- Verify carrier jobs sync across clients
	- Verify construction progress syncs across clients
	- Verify stage changes sync across clients

---

### Future Hooks

#### Phase C (Production & Storage)
- Production buildings that produce resources
- Storage buildings for resource management
- Advanced carrier routing with multiple stops
- Resource prioritization and queues

#### Phase D+ (Advanced Logistics)
- Road networks for faster carrier movement
- Warehouse management and stockpiling
- Production chains (logs → planks → buildings)
- Economic AI and automation

---

### Summary

Phase B+ extends Phase B with resource collection and construction phases:

1. **Resource Collection Phase** - Carriers automatically collect required resources from the ground and deliver them to construction sites
2. **Construction Phase** - Builders work on construction only when all resources are collected AND builder is present
3. **Construction Progress Gating** - Construction only progresses when both conditions are met (resources + builder)
4. **Carrier Job System** - Simple carrier job system for transporting items from ground to construction sites
5. **Event-Based Communication** - Loose coupling between BuildingManager and PopulationManager via events

This phase establishes the foundation for resource management and logistics, enabling players to build structures that require resources and workers, with carriers automatically collecting resources from the ground.

