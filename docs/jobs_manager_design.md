# JobsManager Design Proposal

## Problem

Currently, job creation and assignment logic is scattered:
- **BuildingManager**: Finds carriers, finds items, creates transport jobs
- **PopulationManager**: Creates JobAssignments, tracks jobs, assigns workers
- **Cross-dependencies**: BuildingManager calls PopulationManager methods, PopulationManager tracks jobs for BuildingManager

This violates separation of concerns and creates tight coupling.

## Solution: JobsManager

A dedicated `JobsManager` to handle all job-related logic:
- Job creation (transport, construction, production)
- Job tracking (active jobs per building)
- Job assignment coordination (finding workers, delegating to PopulationManager)
- Job completion/cancellation

---

## Architecture

### Responsibilities

**JobsManager:**
- Create jobs (transport, construction, production)
- Track active jobs per building
- Find available workers (query PopulationManager)
- Coordinate job assignment (call PopulationManager to assign worker)
- Handle job completion/cancellation
- Emit job-related events

**BuildingManager:**
- Manage buildings, resources, construction stages
- Call `JobsManager.requestResourceCollection()` when resources needed
- Call `JobsManager.requestWorker()` when workers needed
- **No knowledge** of carriers, settlers, or job assignment logic

**PopulationManager:**
- Manage settlers, professions, states
- Provide query methods for JobsManager (`getAvailableCarriers()`, `getAvailableWorkers()`)
- Execute job assignments on settlers (state transitions, movement)
- **No knowledge** of job creation or tracking

---

## JobsManager Interface

### Core Methods

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
	
	// Transport Jobs
	requestResourceCollection(buildingInstanceId: string, itemType: string): void
	
	// Worker Jobs (construction/production)
	requestWorker(buildingInstanceId: string): void
	
	// Job Tracking
	getActiveJobsForBuilding(buildingInstanceId: string): JobAssignment[]
	hasActiveJobForBuilding(buildingInstanceId: string, itemType?: string): boolean
	getJob(jobId: string): JobAssignment | undefined
	
	// Job Completion
	completeJob(jobId: string): void
	cancelJob(jobId: string, reason?: string): void
	
	// Internal job assignment (called by PopulationManager on arrival)
	assignWorkerToJob(jobId: string, settlerId: string): void
}
```

---

## Events (`src/Jobs/events.ts`)

**Note:** No `JobsEvents` needed for Phase B+ - job state is surfaced through existing events:
- **Settler state**: `PopulationEvents.SC.SettlerUpdated` (settler state changes reflect job assignments)
  - `MovingToItem` → transport job active
  - `CarryingItem` → transport job in progress
  - `MovingToBuilding` → worker job active
  - `Working` → worker job active
  - `Idle` → no active job
- **Building state**: `BuildingsEvents.SC.ResourceDelivered`, `BuildingsEvents.SC.ResourcesCollected`, `BuildingsEvents.SC.StageChanged` (reflect transport job completion)
- **Movement**: `MovementEvents.SS.PathComplete` (with `targetType='item'` or `targetType='building'`) for internal coordination
- **Worker assignment**: `PopulationEvents.SC.WorkerAssigned`, `PopulationEvents.SC.WorkerUnassigned` (already exist for worker jobs)
- **Worker request failure**: `PopulationEvents.SC.WorkerRequestFailed` (already exists)

**No separate `CarrierEvents` needed** - carrier functionality is covered by:
- **Settler state changes**: `PopulationEvents.SC.SettlerUpdated` (state changes reflect carrier job progress)
- **Movement**: `MovementEvents.SS.PathComplete` (with `targetType='item'` or `targetType='building'`)
- **Resource delivery**: `BuildingsEvents.SC.ResourceDelivered` (resource delivered to building)

---

## Implementation Details

### 1. Transport Job Creation

```typescript
// JobsManager
// Note: Import JobType and JobAssignment at the top of the file
// import { JobType, JobAssignment } from '../Population/types'

public requestResourceCollection(buildingInstanceId: string, itemType: string): void {
	// 1. Get building from BuildingManager
	const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
	if (!building) {
		return
	}
	
	// 2. Check if already has active job for this resource type
	if (this.hasActiveJobForBuilding(buildingInstanceId, itemType)) {
		return // Already has an active transport job
	}
	
	// 3. Find item on the ground
	const mapItems = this.lootManager.getMapItems(building.mapName)
	const nearbyItems = mapItems.filter(item => 
		item.itemType === itemType &&
		this.isItemNearBuilding(item.position, building.position, 500)
	)
	
	if (nearbyItems.length === 0) {
		return // No items found
	}
	
	const closestItem = this.findClosestItem(nearbyItems, building.position)
	if (!closestItem) {
		return
	}
	
	// 4. Find available carrier
	const availableCarriers = this.populationManager.getAvailableCarriers(
		building.mapName,
		building.playerId
	)
	
	if (availableCarriers.length === 0) {
		return // No available carriers
	}
	
	const closestCarrier = this.findClosestCarrier(availableCarriers, closestItem.position)
	if (!closestCarrier) {
		return
	}
	
	// 5. Create transport job
	const jobAssignment: JobAssignment = {
		jobId: uuidv4(),
		settlerId: closestCarrier.id,
		buildingInstanceId: buildingInstanceId,
		jobType: JobType.Transport,
		priority: 1,
		assignedAt: Date.now(),
		status: 'active',
		// Transport-specific fields
		sourceItemId: closestItem.id,
		sourcePosition: closestItem.position,
		itemType: itemType,
		quantity: 1
	}
	
	// 6. Store job
	this.jobs.set(jobAssignment.jobId, jobAssignment)
	if (!this.activeJobsByBuilding.has(buildingInstanceId)) {
		this.activeJobsByBuilding.set(buildingInstanceId, new Set())
	}
	this.activeJobsByBuilding.get(buildingInstanceId)!.add(jobAssignment.jobId)
	
	// 7. Assign worker to job (delegate to PopulationManager)
	this.populationManager.assignWorkerToTransportJob(
		closestCarrier.id,
		jobAssignment.jobId,
		jobAssignment
	)
	
	// 8. No event needed - settler state change (MovingToItem) will be emitted by PopulationManager
	// via PopulationEvents.SC.SettlerUpdated
}
```

### 2. Worker Job Creation (Construction/Production)

```typescript
// JobsManager
public requestWorker(buildingInstanceId: string): void {
	// 1. Get building from BuildingManager
	const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
	if (!building) {
		return
	}
	
	// 2. Check if building needs workers
	if (!this.buildingManager.getBuildingNeedsWorkers(buildingInstanceId)) {
		return
	}
	
	// 3. Get building definition
	const buildingDef = this.buildingManager.getBuildingDefinition(building.buildingId)
	if (!buildingDef) {
		return
	}
	
	// 4. Determine job type from building state
	let jobType: JobType
	if (building.stage === ConstructionStage.CollectingResources ||
		building.stage === ConstructionStage.Constructing) {
		jobType = JobType.Construction
	} else if (building.stage === ConstructionStage.Completed && buildingDef.workerSlots) {
		jobType = JobType.Production
	} else {
		return // Building doesn't need workers
	}
	
	// 5. Find available worker (delegate to PopulationManager)
	const worker = this.populationManager.findWorkerForBuilding(
		buildingInstanceId,
		buildingDef.requiredProfession,
		building.mapName,
		building.playerId
	)
	
	if (!worker) {
		// No worker available - emit failure event (use existing PopulationEvents)
		this.event.emit(Receiver.Group, PopulationEvents.SC.WorkerRequestFailed, {
			buildingInstanceId: buildingInstanceId,
			reason: 'no_worker_available'
		}, building.mapName)
		return
	}
	
	// 6. Create job assignment immediately with status='pending'
	// This allows us to store jobId in SettlerStateContext and look up all job details from the job
	const jobAssignment: JobAssignment = {
		jobId: uuidv4(),
		settlerId: worker.id,
		buildingInstanceId: buildingInstanceId,
		jobType: jobType,
		priority: 1,
		assignedAt: Date.now(),
		status: 'pending', // Will be 'active' when worker arrives
		requiredProfession: buildingDef.requiredProfession // Store required profession in job
	}
	
	// 7. Store job
	this.jobs.set(jobAssignment.jobId, jobAssignment)
	if (!this.activeJobsByBuilding.has(buildingInstanceId)) {
		this.activeJobsByBuilding.set(buildingInstanceId, new Set())
	}
	this.activeJobsByBuilding.get(buildingInstanceId)!.add(jobAssignment.jobId)
	
	// 8. Assign worker to job (delegate to PopulationManager)
	// PopulationManager will store jobId in settler.stateContext and execute state transition
	this.populationManager.assignWorkerToJob(
		worker.id,
		jobAssignment.jobId,
		jobAssignment
	)
	
	// 9. No event needed - settler state change (MovingToTool or MovingToBuilding) will be emitted by PopulationManager
	// via PopulationEvents.SC.SettlerUpdated
}
```

### 3. Job Tracking

```typescript
// JobsManager
private jobs = new Map<string, JobAssignment>() // jobId -> JobAssignment
private activeJobsByBuilding = new Map<string, Set<string>>() // buildingInstanceId -> Set<jobId>

public getJob(jobId: string): JobAssignment | undefined {
	return this.jobs.get(jobId)
}

public getActiveJobsForBuilding(buildingInstanceId: string): JobAssignment[] {
	const jobIds = this.activeJobsByBuilding.get(buildingInstanceId) || new Set()
	return Array.from(jobIds)
		.map(jobId => this.jobs.get(jobId))
		.filter(job => job !== undefined && job.status !== 'completed' && job.status !== 'cancelled') as JobAssignment[]
}

public hasActiveJobForBuilding(buildingInstanceId: string, itemType?: string): boolean {
	const jobs = this.getActiveJobsForBuilding(buildingInstanceId)
	if (itemType) {
		return jobs.some(job => 
			job.jobType === JobType.Transport && job.itemType === itemType
		)
	}
	return jobs.length > 0
}
```

### 4. Job Completion

```typescript
// JobsManager
public completeJob(jobId: string): void {
	const job = this.jobs.get(jobId)
	if (!job) {
		return
	}
	
	job.status = 'completed'
	
	// Remove from active jobs
	const buildingJobs = this.activeJobsByBuilding.get(job.buildingInstanceId)
	if (buildingJobs) {
		buildingJobs.delete(jobId)
		if (buildingJobs.size === 0) {
			this.activeJobsByBuilding.delete(job.buildingInstanceId)
		}
	}
	
	// Get mapName from building
	const building = this.buildingManager.getBuildingInstance(job.buildingInstanceId)
	if (!building) {
		return
	}
	
	// No event needed - job completion is reflected by:
	// - Settler state change to Idle (PopulationEvents.SC.SettlerUpdated)
	// - Building resource delivery (BuildingsEvents.SC.ResourceDelivered) for transport jobs
	// - Building stage change (BuildingsEvents.SC.StageChanged) when resources collected
}

public cancelJob(jobId: string, reason?: string): void {
	const job = this.jobs.get(jobId)
	if (!job) {
		return
	}
	
	job.status = 'cancelled'
	
	// Remove from active jobs
	const buildingJobs = this.activeJobsByBuilding.get(job.buildingInstanceId)
	if (buildingJobs) {
		buildingJobs.delete(jobId)
		if (buildingJobs.size === 0) {
			this.activeJobsByBuilding.delete(job.buildingInstanceId)
		}
	}
	
	// Get mapName from building
	const building = this.buildingManager.getBuildingInstance(job.buildingInstanceId)
	if (!building) {
		return
	}
	
	// No event needed - job cancellation is reflected by:
	// - Settler state change to Idle (PopulationEvents.SC.SettlerUpdated)
	// - Building state remains unchanged (no resource delivered)
}
```

---

## Integration with Existing Systems

### BuildingManager Changes

**Before:**
```typescript
// BuildingManager
public requestResourceCollection(...): void {
	// Finds carriers, finds items, creates jobs
	populationManager.assignCarrierToTransportJob(...)
}
```

**After:**
```typescript
// BuildingManager
constructor(
	private event: EventManager,
	private mapManager: MapManager,
	private inventoryManager: InventoryManager,
	private mapObjectsManager: MapObjectsManager,
	private jobsManager: JobsManager  // NEW: Inject JobsManager
) {
	// ...
}

public requestResourceCollection(buildingInstanceId: string, itemType: string): void {
	// Simply delegate to JobsManager
	this.jobsManager.requestResourceCollection(buildingInstanceId, itemType)
}
```

### PopulationManager Changes

**Before:**
```typescript
// PopulationManager
public assignCarrierToTransportJob(...): void {
	// Creates JobAssignment, tracks job, assigns worker
}
```

**After:**
```typescript
// PopulationManager
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

public assignWorkerToTransportJob(
	settlerId: string,
	jobId: string,
	jobAssignment: JobAssignment
): void {
	// Only handles settler state and movement
	// Job creation and tracking is handled by JobsManager
	const settler = this.settlers.get(settlerId)
	if (!settler) {
		return
	}
	
	settler.currentJob = jobAssignment
	
	// Execute state transition
	this.stateMachine.executeTransition(settler, SettlerState.MovingToItem, {
		jobId: jobAssignment.jobId,
		itemId: jobAssignment.sourceItemId!,
		itemPosition: jobAssignment.sourcePosition!,
		buildingInstanceId: jobAssignment.buildingInstanceId,
		itemType: jobAssignment.itemType!
	})
}

// Query methods for JobsManager
public getAvailableCarriers(mapName: string, playerId: string): Settler[] {
	return Array.from(this.settlers.values()).filter(settler =>
		settler.mapName === mapName &&
		settler.playerId === playerId &&
		settler.profession === ProfessionType.Carrier &&
		settler.state === SettlerState.Idle
	)
}

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
```

---

## Event Flow

### Transport Job Creation

1. **BuildingManager** calls `JobsManager.requestResourceCollection()`
2. **JobsManager** finds item and carrier
3. **JobsManager** creates `JobAssignment`
4. **JobsManager** calls `PopulationManager.assignWorkerToTransportJob()`
5. **PopulationManager** assigns worker and starts movement
6. **PopulationManager** emits `PopulationEvents.SC.SettlerUpdated` (settler state: `MovingToItem`)

### Transport Job Completion

1. **Settler** arrives at building (MovementManager emits `PathComplete`)
2. **PopulationManager** handles item delivery:
   - Gets job from `JobsManager.getJob(jobId)`
   - Calls `BuildingManager.addResourceToBuilding()` with item from job
   - Calls `JobsManager.completeJob(jobId)`
3. **BuildingManager** emits `BuildingsEvents.SC.ResourceDelivered` (resource delivered)
4. **PopulationManager** emits `PopulationEvents.SC.SettlerUpdated` (settler state: `Idle`)
5. If all resources collected, **BuildingManager** emits `BuildingsEvents.SC.ResourcesCollected` and `BuildingsEvents.SC.StageChanged` (stage: `Constructing`)

### Worker Job Creation

1. **BuildingManager** (or player) calls `JobsManager.requestWorker()`
2. **JobsManager** finds available worker
3. **JobsManager** creates `JobAssignment` (status: 'pending')
4. **JobsManager** calls `PopulationManager.assignWorkerToJob()`
5. **PopulationManager** orders worker to move to building (or tool)
6. **PopulationManager** emits `PopulationEvents.SC.SettlerUpdated` (settler state: `MovingToTool` or `MovingToBuilding`)

### Worker Job Assignment (on arrival)

1. **Settler** arrives at building (MovementManager emits `PathComplete`)
2. **PopulationManager** handles worker assignment:
   - Gets job from `JobsManager.getJob(jobId)`
   - Updates settler state to `Working`
   - Calls `JobsManager.assignWorkerToJob(jobId, settlerId)`
3. **JobsManager** updates job status to 'active'
4. **JobsManager** calls `BuildingManager.assignWorker()`
5. **PopulationManager** emits `PopulationEvents.SC.WorkerAssigned` (already exists)

---

## Benefits

1. **Separation of Concerns**
   - BuildingManager: Buildings and resources only
   - PopulationManager: Settlers and states only
   - JobsManager: Jobs and coordination only

2. **No Cross-Dependencies**
   - BuildingManager doesn't know about carriers or job assignment
   - PopulationManager doesn't know about job creation or tracking
   - JobsManager coordinates between them

3. **Easier to Test**
   - Each manager has clear responsibilities
   - Can mock dependencies easily

4. **Easier to Extend**
   - New job types can be added to JobsManager
   - BuildingManager and PopulationManager don't need changes

5. **Single Source of Truth**
   - All jobs tracked in JobsManager
   - No duplicate job tracking

---

## File Structure

```
packages/game/src/Jobs/
├── index.ts          # JobsManager class
├── types.ts          # JobAssignment, JobEvents, etc.
├── events.ts         # Job-related events
└── utils.ts          # Helper functions (findClosestItem, etc.)
```

---

## Migration Plan

1. **Create JobsManager**
   - Move job creation logic from BuildingManager and PopulationManager
   - Move job tracking from PopulationManager

2. **Update BuildingManager**
   - Remove carrier/item finding logic
   - Remove job creation logic
   - Call JobsManager methods instead

3. **Update PopulationManager**
   - Remove job creation logic
   - Remove job tracking
   - Keep only worker assignment execution
   - Add query methods for JobsManager

4. **Update Events**
   - Move job-related events to JobsEvents
   - Update event listeners

5. **Update State Machine**
   - State transitions call JobsManager for job completion
   - JobsManager calls BuildingManager for resource delivery

---

## Constructor Injection Pattern

All managers are injected through constructor, following the existing pattern in the codebase:

```typescript
// GameManager initializes all managers
export class GameManager {
	private jobsManager: JobsManager
	private buildingManager: BuildingManager
	private populationManager: PopulationManager
	// ... other managers
	
	constructor() {
		// Initialize managers in dependency order
		this.eventManager = new EventManager(...)
		this.mapManager = new MapManager(...)
		this.lootManager = new LootManager(...)
		this.buildingManager = new BuildingManager(...)
		this.populationManager = new PopulationManager(...)
		
		// JobsManager depends on BuildingManager and PopulationManager
		this.jobsManager = new JobsManager(
			this.eventManager,
			this.buildingManager,
			this.populationManager,
			this.lootManager,
			this.mapManager
		)
		
		// BuildingManager and PopulationManager need JobsManager reference
		// So we need to either:
		// 1. Pass JobsManager to BuildingManager/PopulationManager constructors
		// 2. Set JobsManager after construction (less ideal)
		// 3. Use event-based communication (no direct dependency)
		
		// Option 1: Pass JobsManager to BuildingManager
		// This creates a circular dependency: BuildingManager -> JobsManager -> BuildingManager
		// Solution: BuildingManager doesn't need JobsManager in constructor
		// Instead, BuildingManager calls JobsManager methods via events or direct call
		// But JobsManager is created after BuildingManager, so we need to set it after
		
		// Option 2: Set JobsManager after construction (recommended for now)
		this.buildingManager.setJobsManager(this.jobsManager)
		this.populationManager.setJobsManager(this.jobsManager)
	}
}
```

**Alternative: Event-Based Communication (No Direct Dependency)**
- BuildingManager emits `JobsEvents.SS.RequestResourceCollection` event
- JobsManager listens to event and creates job
- No direct dependency, but requires event setup

**Recommendation**: Use constructor injection for JobsManager dependencies (BuildingManager, PopulationManager, LootManager, MapManager), and use a setter or event-based communication for BuildingManager/PopulationManager to communicate with JobsManager to avoid circular dependencies.

