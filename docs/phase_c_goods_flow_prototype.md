## Phase C — Goods Flow Prototype Plan

### Objective
Implement a production and logistics system where buildings can produce goods (logs → planks), request input resources, and carriers transport goods between buildings and storage. This phase establishes the foundation for the economy loop by demonstrating the full flow: resource production → storage → transport → consumption.

**Goal:** Move wood from source (tree/woodcutter hut) to production building (sawmill) to storage (storehouse), with carriers automatically routing goods.

**Note:** Phase C focuses on a simple two-resource chain (logs → planks) and basic point-to-point carrier routing. Road networks, advanced logistics, and production queues will be added in later phases.

---

### Existing Building Blocks

- **BuildingManager (`packages/game/src/Buildings`)**  
	Manages building instances, construction progress, and worker assignments. Needs extension for production pipelines, input/output buffers, and status management.

- **PopulationManager (`packages/game/src/Population`)**  
	Tracks settlers by profession (including Carrier). State machine handles worker assignment. Needs extension for carrier job assignment and transport tasks.

- **MovementManager (`packages/game/src/Movement`)**  
	Provides unified, entity-agnostic movement system. Used by settlers for all movement, including transport.

- **InventoryManager (`packages/game/src/Inventory`)**  
	Manages player inventories. Used for building costs. Will be extended to support building storage buffers.

- **LootManager (`packages/game/src/Loot`)**  
	Manages dropped items on the map. Can be used as a source for raw resources (trees drop logs).

- **MapManager (`packages/game/src/Map`)**  
	Provides pathfinding for movement. CarrierRoutingService will leverage this for transport pathfinding.

- **Scheduler (`packages/game/src/Scheduler`)**  
	Provides timed event infrastructure. Used for production ticks and periodic state updates.

- **SettlerStateMachine (`packages/game/src/Population/StateMachine`)**  
	Manages settler state transitions. Needs new states for carrying goods and transport jobs.

---

### Shared Game Package Additions (`packages/game`)

#### 1. Content Schema Extensions

**Extend `GameContent` with:**
- `productionPipelines?: ProductionPipelineDefinition[]` - Define production recipes (inputs → outputs)
- `storageConfigs?: StorageConfigDefinition[]` - Define storage capacities and classes

**Extend `BuildingDefinition` to include:**
- `productionPipelineId?: string` - ID of production pipeline this building uses
- `inputBufferSize?: number` - Maximum input items this building can store
- `outputBufferSize?: number` - Maximum output items this building can store
- `productionTime?: number` - Time (seconds) to produce one batch of output
- `requiresCarrier?: boolean` - Whether this building requires carriers to transport inputs/outputs

**Extend `ItemMetadata` to include:**
- `storageClass?: StorageClass` - Storage class for organization (raw, refined, food, etc.)
- `productionTime?: number` - Time to produce this item (for production pipelines)
- `isRawResource?: boolean` - Whether this is a raw resource (can be harvested)

**New Type Definitions (`src/Storage/types.ts`):**
```typescript
export enum StorageClass {
	Raw = 'raw',           // Raw resources (logs, stone, ore)
	Refined = 'refined',   // Processed goods (planks, bricks, tools)
	Food = 'food',         // Food items (bread, meat)
	Luxury = 'luxury'      // Luxury goods (jewelry, wine)
}

export interface StorageConfigDefinition {
	id: string
	name: string
	buildingId: string // Building this storage config applies to
	capacity: number   // Maximum items this building can store
	storageClasses: StorageClass[] // Which storage classes this building accepts
}

export interface BuildingStorage {
	buildingInstanceId: string
	inputBuffer: Map<string, number>  // itemType -> quantity
	outputBuffer: Map<string, number> // itemType -> quantity
	reservedInputs: Map<string, number>  // itemType -> reserved quantity (for incoming deliveries)
	reservedOutputs: Map<string, number> // itemType -> reserved quantity (for outgoing deliveries)
	maxInputBuffer: number
	maxOutputBuffer: number
	storageClasses: StorageClass[]
}

export interface StorageReservation {
	reservationId: string
	buildingInstanceId: string
	itemType: string
	quantity: number
	reservedBy: string // carrierId or buildingInstanceId
	status: 'pending' | 'in_transit' | 'delivered' | 'cancelled'
	createdAt: number
}
```

**New Type Definitions (`src/Production/types.ts`):**
```typescript
export interface ProductionPipelineDefinition {
	id: string
	name: string
	description: string
	inputs: Array<{
		itemType: string
		quantity: number
	}>
	outputs: Array<{
		itemType: string
		quantity: number
	}>
	productionTime: number // Time in seconds to produce one batch
	requiresWorker: boolean // Whether a worker is required for production
}
```

**New Type Definitions (`src/Carrier/types.ts`):**
```typescript
export interface CarrierJob {
	jobId: string
	carrierId: string // settlerId of the carrier
	sourceBuildingInstanceId: string
	targetBuildingInstanceId: string
	itemType: string
	quantity: number
	status: 'pending' | 'picking_up' | 'transporting' | 'delivering' | 'completed' | 'cancelled'
	reservationId?: string // Storage reservation ID
	createdAt: number
	startedAt?: number
	completedAt?: number
}

export interface TransportRequest {
	requestId: string
	sourceBuildingInstanceId: string
	targetBuildingInstanceId: string
	itemType: string
	quantity: number
	priority: number
	createdAt: number
}
```

**Extend `SettlerState` enum in `src/Population/types.ts`:**
```typescript
export enum SettlerState {
	Idle = 'idle',
	Spawned = 'spawned',
	MovingToTool = 'moving_to_tool',
	MovingToBuilding = 'moving_to_building',
	Working = 'working',
	WaitingForWork = 'waiting_for_work',
	Carrying = 'carrying',              // NEW: Carrying goods between buildings
	MovingToPickup = 'moving_to_pickup', // NEW: Moving to pickup goods
	MovingToDelivery = 'moving_to_delivery', // NEW: Moving to deliver goods
	AssignmentFailed = 'assignment_failed'
}
```

**Extend `SettlerStateContext` in `src/Population/types.ts`:**
```typescript
export interface SettlerStateContext {
	targetId?: string
	targetPosition?: Position
	buildingInstanceId?: string
	jobId?: string
	carrierJobId?: string              // NEW: Carrier job ID when carrying goods
	carriedItemType?: string           // NEW: Item type being carried
	carriedQuantity?: number           // NEW: Quantity being carried
	pendingAssignment?: {
		buildingInstanceId: string
		requiredProfession?: ProfessionType
	}
	errorReason?: string
}
```

**Extend `JobAssignment` in `src/Population/types.ts`:**
```typescript
export interface JobAssignment {
	jobId: string
	settlerId: SettlerId
	buildingInstanceId: string
	jobType: 'construction' | 'production' | 'transport' // NEW: Added 'transport'
	priority: number
	assignedAt: number
	status: 'pending' | 'active' | 'completed' | 'cancelled'
}
```

#### 2. Events (`src/Storage/events.ts`, `src/Production/events.ts`, `src/Carrier/events.ts`)

**Storage Events:**
```typescript
export const StorageEvents = {
	CS: {
		RequestStorage: 'cs:storage:request-storage',      // Request storage space
		ReleaseStorage: 'cs:storage:release-storage'       // Release storage reservation
	},
	SC: {
		StorageUpdated: 'sc:storage:storage-updated',      // Building storage updated
		ReservationCreated: 'sc:storage:reservation-created',
		ReservationCancelled: 'sc:storage:reservation-cancelled'
	},
	SS: {
		StorageTick: 'ss:storage:storage-tick',            // Internal storage management tick
		InputRequested: 'ss:storage:input-requested',      // Building requested input
		OutputReady: 'ss:storage:output-ready'             // Building output ready for pickup
	}
} as const
```

**Production Events:**
```typescript
export const ProductionEvents = {
	CS: {
		StartProduction: 'cs:production:start-production',
		StopProduction: 'cs:production:stop-production'
	},
	SC: {
		ProductionStarted: 'sc:production:production-started',
		ProductionStopped: 'sc:production:production-stopped',
		ProductionProgress: 'sc:production:production-progress',
		ProductionCompleted: 'sc:production:production-completed',
		StatusChanged: 'sc:production:status-changed'      // no_input, in_production, output_ready, idle
	},
	SS: {
		ProductionTick: 'ss:production:production-tick'    // Internal production processing tick
	}
} as const
```

**Carrier Events:**
```typescript
export const CarrierEvents = {
	CS: {
		RequestTransport: 'cs:carrier:request-transport',  // Request carrier to transport goods
		CancelTransport: 'cs:carrier:cancel-transport'
	},
	SC: {
		TransportRequested: 'sc:carrier:transport-requested',
		TransportAssigned: 'sc:carrier:transport-assigned',
		TransportCompleted: 'sc:carrier:transport-completed',
		TransportCancelled: 'sc:carrier:transport-cancelled',
		CarrierJobUpdated: 'sc:carrier:carrier-job-updated'
	},
	SS: {
		TransportTick: 'ss:carrier:transport-tick',        // Internal transport processing tick
		PickupCompleted: 'ss:carrier:pickup-completed',    // Carrier picked up goods
		DeliveryCompleted: 'ss:carrier:delivery-completed' // Carrier delivered goods
	}
} as const
```

#### 3. StorageManager (`src/Storage/index.ts`)

**Responsibilities:**
- Manage per-building storage buffers (input/output)
- Handle storage reservations for incoming/outgoing deliveries
- Track storage capacity and storage classes
- Emit storage update events
- Provide APIs for buildings to request/release storage

**Key Methods:**
```typescript
export class StorageManager {
	private buildingStorages: Map<string, BuildingStorage> = new Map() // buildingInstanceId -> BuildingStorage
	private reservations: Map<string, StorageReservation> = new Map()  // reservationId -> StorageReservation
	private storageConfigs: Map<string, StorageConfigDefinition> = new Map() // configId -> StorageConfigDefinition

	constructor(
		private event: EventManager,
		private buildingManager: BuildingManager,
		private itemsManager: ItemsManager
	) {
		this.setupEventHandlers()
		this.startStorageTickLoop()
	}

	// Initialize storage for a building
	public initializeBuildingStorage(buildingInstanceId: string, buildingId: string): void

	// Get building storage
	public getBuildingStorage(buildingInstanceId: string): BuildingStorage | undefined

	// Reserve storage space for incoming delivery
	public reserveInputStorage(buildingInstanceId: string, itemType: string, quantity: number, reservedBy: string): string | null // Returns reservationId

	// Reserve storage space for outgoing delivery
	public reserveOutputStorage(buildingInstanceId: string, itemType: string, quantity: number, reservedBy: string): string | null // Returns reservationId

	// Add items to building storage (input buffer)
	public addToInputBuffer(buildingInstanceId: string, itemType: string, quantity: number): boolean

	// Remove items from building storage (input buffer)
	public removeFromInputBuffer(buildingInstanceId: string, itemType: string, quantity: number): boolean

	// Add items to building storage (output buffer)
	public addToOutputBuffer(buildingInstanceId: string, itemType: string, quantity: number): boolean

	// Remove items from building storage (output buffer)
	public removeFromOutputBuffer(buildingInstanceId: string, itemType: string, quantity: number): boolean

	// Check if building has available input storage
	public hasAvailableInputStorage(buildingInstanceId: string, itemType: string, quantity: number): boolean

	// Check if building has available output storage
	public hasAvailableOutputStorage(buildingInstanceId: string, itemType: string, quantity: number): boolean

	// Get available input quantity for an item type
	public getAvailableInputQuantity(buildingInstanceId: string, itemType: string): number

	// Get available output quantity for an item type
	public getAvailableOutputQuantity(buildingInstanceId: string, itemType: string): number

	// Release storage reservation
	public releaseReservation(reservationId: string): void

	// Storage tick loop (periodic storage management)
	private startStorageTickLoop(): void
	private storageTick(): void
}
```

#### 4. ProductionManager (`src/Production/index.ts`)

**Responsibilities:**
- Manage production pipelines for buildings
- Process production ticks (convert inputs to outputs)
- Track production progress and status
- Emit production status updates (no_input, in_production, output_ready, idle)
- Integrate with StorageManager for input/output buffers

**Key Methods:**
```typescript
export class ProductionManager {
	private productionPipelines: Map<string, ProductionPipelineDefinition> = new Map() // pipelineId -> ProductionPipelineDefinition
	private buildingProductions: Map<string, BuildingProduction> = new Map() // buildingInstanceId -> BuildingProduction

	constructor(
		private event: EventManager,
		private buildingManager: BuildingManager,
		private storageManager: StorageManager,
		private populationManager: PopulationManager
	) {
		this.setupEventHandlers()
		this.startProductionTickLoop()
	}

	// Initialize production for a building
	public initializeBuildingProduction(buildingInstanceId: string, pipelineId: string): void

	// Start production for a building
	public startProduction(buildingInstanceId: string): boolean

	// Stop production for a building
	public stopProduction(buildingInstanceId: string): void

	// Process production tick (convert inputs to outputs)
	private processProduction(buildingInstanceId: string): void

	// Check if building has required inputs
	private hasRequiredInputs(buildingInstanceId: string, pipeline: ProductionPipelineDefinition): boolean

	// Consume inputs from storage
	private consumeInputs(buildingInstanceId: string, pipeline: ProductionPipelineDefinition): boolean

	// Produce outputs to storage
	private produceOutputs(buildingInstanceId: string, pipeline: ProductionPipelineDefinition): void

	// Get production status (no_input, in_production, output_ready, idle)
	public getProductionStatus(buildingInstanceId: string): ProductionStatus

	// Production tick loop
	private startProductionTickLoop(): void
	private productionTick(): void

	// Request input resources (emit event for CarrierRoutingService)
	private requestInputResources(buildingInstanceId: string, pipeline: ProductionPipelineDefinition): void
}
```

**BuildingProduction Interface:**
```typescript
export interface BuildingProduction {
	buildingInstanceId: string
	pipelineId: string
	status: ProductionStatus
	progress: number // 0-100
	currentBatchStartTime?: number
	isProducing: boolean
}

export enum ProductionStatus {
	Idle = 'idle',
	NoInput = 'no_input',
	InProduction = 'in_production',
	OutputReady = 'output_ready',
	NoWorker = 'no_worker' // Building requires worker but none assigned
}
```

#### 5. CarrierRoutingService (`src/Carrier/index.ts`)

**Responsibilities:**
- Manage carrier jobs (transport requests)
- Assign carriers to transport jobs
- Route goods from source buildings to target buildings
- Integrate with MovementManager for carrier movement
- Handle pickup and delivery at buildings
- Integrate with StorageManager for reservations

**Key Methods:**
```typescript
export class CarrierRoutingService {
	private carrierJobs: Map<string, CarrierJob> = new Map() // jobId -> CarrierJob
	private transportRequests: Map<string, TransportRequest> = new Map() // requestId -> TransportRequest
	private activeCarriers: Map<string, string> = new Map() // carrierId -> jobId

	constructor(
		private event: EventManager,
		private populationManager: PopulationManager,
		private storageManager: StorageManager,
		private buildingManager: BuildingManager,
		private movementManager: MovementManager,
		private mapManager: MapManager
	) {
		this.setupEventHandlers()
		this.startTransportTickLoop()
	}

	// Request transport from source to target building
	public requestTransport(
		sourceBuildingInstanceId: string,
		targetBuildingInstanceId: string,
		itemType: string,
		quantity: number,
		priority: number
	): string | null // Returns requestId

	// Assign carrier to transport job
	private assignCarrierToJob(jobId: string): boolean

	// Find available carrier for transport job
	private findAvailableCarrier(job: CarrierJob): Settler | null

	// Start carrier job (move to pickup location)
	private startCarrierJob(carrierId: string, jobId: string): void

	// Handle carrier pickup (remove from source storage, add to carrier inventory)
	private handlePickup(carrierId: string, jobId: string): void

	// Handle carrier delivery (remove from carrier inventory, add to target storage)
	private handleDelivery(carrierId: string, jobId: string): void

	// Complete carrier job
	private completeCarrierJob(jobId: string): void

	// Cancel carrier job
	public cancelCarrierJob(jobId: string): void

	// Transport tick loop
	private startTransportTickLoop(): void
	private transportTick(): void
}
```

#### 6. BuildingManager Integration

**New Methods:**
```typescript
// Initialize building production and storage
public initializeBuildingProduction(buildingInstanceId: string): void

// Get building production status
public getBuildingProductionStatus(buildingInstanceId: string): ProductionStatus | null

// Get building storage
public getBuildingStorage(buildingInstanceId: string): BuildingStorage | undefined

// Request input resources (delegate to ProductionManager)
public requestInputResources(buildingInstanceId: string): void
```

**Updated Methods:**
- `completeBuilding`: Initialize production and storage when building completes
- `tick`: Include production tick processing

#### 7. PopulationManager Integration

**New Methods:**
```typescript
// Assign carrier to transport job
public assignCarrierToJob(carrierId: string, jobId: string): boolean

// Handle carrier pickup
public handleCarrierPickup(carrierId: string, jobId: string): void

// Handle carrier delivery
public handleCarrierDelivery(carrierId: string, jobId: string): void
```

**New State Transitions:**
- `Idle -> MovingToPickup`: Carrier assigned to transport job, moving to pickup location
- `MovingToPickup -> Carrying`: Carrier picked up goods, moving to delivery location
- `Carrying -> MovingToDelivery`: Carrier moving to deliver goods (redundant, but explicit)
- `MovingToDelivery -> Idle`: Carrier delivered goods, job complete

**New State Transition Files:**
- `IdleToMovingToPickup.ts`: Assign carrier to transport job, start movement to pickup
- `MovingToPickupToCarrying.ts`: Handle pickup, start movement to delivery
- `CarryingToIdle.ts`: Handle delivery, complete job

#### 8. Content Loader Updates

**Load Production Pipelines:**
```typescript
private async loadProductionPipelines(): Promise<void> {
	if (!this.content.productionPipelines) return

	for (const pipeline of this.content.productionPipelines) {
		this.productionManager.loadPipeline(pipeline)
	}
}
```

**Load Storage Configs:**
```typescript
private async loadStorageConfigs(): Promise<void> {
	if (!this.content.storageConfigs) return

	for (const config of this.content.storageConfigs) {
		this.storageManager.loadStorageConfig(config)
	}
}
```

---

### Backend Adapter Touchpoints

**No new backend files needed** - Events auto-routed via `EventBusManager`.

**Event Routing:**
- `cs:storage:*`, `cs:production:*`, `cs:carrier:*` → Routed to respective managers
- `sc:storage:*`, `sc:production:*`, `sc:carrier:*` → Broadcast to clients in map group
- `ss:storage:*`, `ss:production:*`, `ss:carrier:*` → Internal server events

---

### Frontend Adapter Scope

#### 1. Storage UI Components

**BuildingStoragePanel.tsx:**
- Display building input/output buffers
- Show storage capacity and usage
- Display reserved storage
- Show storage classes

#### 2. Production UI Components

**BuildingProductionPanel.tsx:**
- Display production status (no_input, in_production, output_ready, idle)
- Show production progress bar
- Display input requirements and current inputs
- Display output items and quantities
- Start/stop production buttons

#### 3. Carrier UI Components

**CarrierJobPanel.tsx:**
- Display active carrier jobs
- Show carrier assignments
- Display transport requests queue
- Cancel transport requests

#### 4. Building Info Panel Updates

**BuildingInfoPanel.tsx:**
- Add production status section
- Add storage section (input/output buffers)
- Add transport requests section
- Show carrier assignments

#### 5. Game Scene Updates

**GameScene.ts:**
- Handle `sc:storage:storage-updated` events
- Handle `sc:production:status-changed` events
- Handle `sc:carrier:carrier-job-updated` events
- Update building visuals based on production status
- Display storage indicators on buildings

#### 6. Services

**StorageService.ts:**
- Cache building storage state
- Subscribe to storage update events
- Provide methods to query storage

**ProductionService.ts:**
- Cache building production state
- Subscribe to production status events
- Provide methods to query production status

**CarrierService.ts:**
- Cache carrier jobs and transport requests
- Subscribe to carrier events
- Provide methods to request transport

---

### Content Pack Updates

#### 1. Production Pipelines (`content/<pack>/productionPipelines.ts`)

```typescript
import { ProductionPipelineDefinition } from '@rugged/game'

export const productionPipelines: ProductionPipelineDefinition[] = [
	{
		id: 'logs_to_planks',
		name: 'Logs to Planks',
		description: 'Convert logs into planks',
		inputs: [
			{ itemType: 'logs', quantity: 2 }
		],
		outputs: [
			{ itemType: 'planks', quantity: 1 }
		],
		productionTime: 10, // 10 seconds
		requiresWorker: true
	}
]
```

#### 2. Storage Configs (`content/<pack>/storageConfigs.ts`)

```typescript
import { StorageConfigDefinition, StorageClass } from '@rugged/game'

export const storageConfigs: StorageConfigDefinition[] = [
	{
		id: 'storehouse_storage',
		name: 'Storehouse Storage',
		buildingId: 'storehouse',
		capacity: 100,
		storageClasses: [StorageClass.Raw, StorageClass.Refined, StorageClass.Food, StorageClass.Luxury]
	},
	{
		id: 'woodcutter_hut_storage',
		name: 'Woodcutter Hut Storage',
		buildingId: 'woodcutter_hut',
		capacity: 20,
		storageClasses: [StorageClass.Raw, StorageClass.Refined]
	}
]
```

#### 3. Building Definitions Updates (`content/<pack>/buildings.ts`)

```typescript
{
	id: 'woodcutter_hut',
	// ... existing properties ...
	productionPipelineId: 'logs_to_planks',
	inputBufferSize: 20,
	outputBufferSize: 10,
	productionTime: 10,
	requiresCarrier: true,
	workerSlots: 1,
	requiredProfession: 'woodcutter'
}
```

#### 4. Item Metadata Updates (`content/<pack>/items/planks.ts`)

```typescript
import { ItemMetadata, ItemCategory, StorageClass } from '@rugged/game'

export default {
	id: 'planks',
	name: 'Planks',
	emoji: '🪵',
	description: 'Processed wooden planks',
	category: ItemCategory.Material,
	stackable: true,
	maxStackSize: 50,
	storageClass: StorageClass.Refined
} as ItemMetadata
```

---

### Event/State Lifecycle

#### 1. Building Completion & Production Initialization

1. Building completes construction
2. `BuildingManager.completeBuilding()` called
3. `StorageManager.initializeBuildingStorage()` called
4. `ProductionManager.initializeBuildingProduction()` called (if building has production pipeline)
5. `sc:buildings:completed` event emitted
6. Frontend receives event and updates building visual

#### 2. Production Start & Input Request

1. Building has production pipeline and worker assigned
2. `ProductionManager.startProduction()` called
3. Check if building has required inputs in storage
4. If no inputs:
	- Set status to `no_input`
	- `ProductionManager.requestInputResources()` called
	- `ss:storage:input-requested` event emitted
	- `CarrierRoutingService.requestTransport()` called to find source
5. If inputs available:
	- Set status to `in_production`
	- Start production timer
	- `sc:production:production-started` event emitted

#### 3. Carrier Assignment & Transport

1. `CarrierRoutingService.requestTransport()` called
2. Find available carrier (Carrier profession, Idle state)
3. Create `CarrierJob` and assign to carrier
4. Reserve storage at source and target buildings
5. `PopulationManager.assignCarrierToJob()` called
6. State transition: `Idle -> MovingToPickup`
7. Carrier moves to source building using `MovementManager`
8. `sc:carrier:transport-assigned` event emitted

#### 4. Carrier Pickup

1. Carrier arrives at source building
2. `MovementEvents.SS.PathComplete` event emitted (targetType: 'pickup', targetId: jobId)
3. `CarrierRoutingService.handlePickup()` called
4. Remove items from source building output buffer
5. Add items to carrier inventory (stored in `SettlerStateContext`)
6. Update carrier state: `MovingToPickup -> Carrying`
7. `ss:carrier:pickup-completed` event emitted
8. Carrier starts moving to target building
9. `sc:carrier:carrier-job-updated` event emitted

#### 5. Carrier Delivery

1. Carrier arrives at target building
2. `MovementEvents.SS.PathComplete` event emitted (targetType: 'delivery', targetId: jobId)
3. `CarrierRoutingService.handleDelivery()` called
4. Remove items from carrier inventory
5. Add items to target building input buffer
6. Release storage reservations
7. Update carrier state: `Carrying -> Idle`
8. Complete carrier job
9. `ss:carrier:delivery-completed` event emitted
10. `sc:carrier:transport-completed` event emitted
11. `sc:storage:storage-updated` event emitted for target building

#### 6. Production Completion

1. Production timer completes
2. `ProductionManager.processProduction()` called
3. Consume inputs from storage
4. Produce outputs to storage
5. `sc:production:production-completed` event emitted
6. If output buffer full:
	- Set status to `output_ready`
	- Request carrier to transport outputs (if `requiresCarrier` is true)
7. If inputs available:
	- Start next production batch
8. If no inputs:
	- Set status to `no_input`
	- Request input resources

---

### Design Decisions

#### 1. Storage Reservations

**Rationale:** Prevent multiple carriers from picking up the same items or delivering to a full storage. Reservations are created when a transport request is made and released when delivery is complete or cancelled.

**Implementation:**
- Reservations track reserved quantity for incoming/outgoing deliveries
- Reservations have status: `pending`, `in_transit`, `delivered`, `cancelled`
- Storage capacity checks include reserved quantities

#### 2. Carrier Inventory

**Rationale:** Carriers need to carry items between buildings. Instead of creating physical item entities, we store carried items in `SettlerStateContext` for simplicity.

**Implementation:**
- `SettlerStateContext.carriedItemType` and `carriedQuantity` track carried items
- Items are removed from source storage on pickup and added to target storage on delivery
- No physical item entities are created for transport

#### 3. Production Status

**Rationale:** Buildings need to communicate their state to the UI and other systems. Status indicates whether building is idle, waiting for inputs, producing, or has outputs ready.

**Implementation:**
- Status enum: `idle`, `no_input`, `in_production`, `output_ready`, `no_worker`
- Status changes trigger `sc:production:status-changed` events
- UI can display status indicators on buildings

#### 4. Automatic Input Request

**Rationale:** Buildings should automatically request inputs when they run out, rather than requiring manual player intervention. This enables autonomous production chains.

**Implementation:**
- `ProductionManager` checks for required inputs before starting production
- If inputs are missing, `requestInputResources()` is called
- `CarrierRoutingService` finds available source buildings and assigns carriers
- Source buildings are found by checking which buildings have the required item type in their output buffer

#### 5. Point-to-Point Routing

**Rationale:** Phase C focuses on simple point-to-point routing. Advanced routing (multiple stops, road networks, priority queues) will be added in later phases.

**Implementation:**
- `CarrierRoutingService` routes directly from source to target building
- Uses `MapManager.findPath()` for pathfinding
- No road network bonuses or multi-stop routing in Phase C

---

### Edge Cases & Error Handling

#### 1. Storage Full

**Scenario:** Target building storage is full when carrier arrives.

**Handling:**
- Check storage availability before creating transport request
- Reserve storage space when transport request is created
- If storage becomes full after reservation, carrier waits or job is cancelled
- Emit `sc:storage:storage-full` event for UI feedback

#### 2. Source Building Empty

**Scenario:** Source building output buffer is empty when carrier arrives.

**Handling:**
- Check output availability before creating transport request
- Reserve output items when transport request is created
- If output becomes unavailable after reservation, job is cancelled
- Emit `sc:carrier:transport-cancelled` event

#### 3. Carrier Unavailable

**Scenario:** No available carriers when transport request is made.

**Handling:**
- Transport request is queued
- When carrier becomes available, assign to queued request
- Emit `sc:carrier:transport-requested` event for UI feedback
- UI can show pending transport requests

#### 4. Building Destroyed During Transport

**Scenario:** Source or target building is destroyed while carrier is transporting.

**Handling:**
- Cancel transport request when building is destroyed
- Release storage reservations
- Return carrier to Idle state
- If carrier is carrying items, drop them at current location (using LootManager)

#### 5. Production Interruption

**Scenario:** Building loses worker or inputs during production.

**Handling:**
- Pause production if worker is unassigned
- Set status to `no_worker` or `no_input`
- Emit `sc:production:status-changed` event
- Resume production when worker is reassigned or inputs are available

---

### Files To Touch (Implementation)

#### Game Core (`packages/game/src`)
- `src/types.ts` - Extend `GameContent` with `productionPipelines`, `storageConfigs`
- `src/events.ts` - Register `Storage`, `Production`, `Carrier` namespaces
- `src/Storage/` - New directory:
	- `types.ts` - Storage-related types
	- `events.ts` - Storage events
	- `index.ts` - StorageManager implementation
- `src/Production/` - New directory:
	- `types.ts` - Production-related types
	- `events.ts` - Production events
	- `index.ts` - ProductionManager implementation
- `src/Carrier/` - New directory:
	- `types.ts` - Carrier-related types
	- `events.ts` - Carrier events
	- `index.ts` - CarrierRoutingService implementation
- `src/Buildings/types.ts` - Extend BuildingDefinition with production/storage properties
- `src/Buildings/index.ts` - Add production/storage integration methods
- `src/Items/types.ts` - Extend ItemMetadata with storage class properties
- `src/Population/types.ts` - Extend SettlerState, SettlerStateContext, JobAssignment
- `src/Population/transitions/` - Add new state transitions:
	- `IdleToMovingToPickup.ts`
	- `MovingToPickupToCarrying.ts`
	- `CarryingToIdle.ts`
- `src/Population/transitions/index.ts` - Register new transitions
- `src/Population/StateMachine.ts` - Handle carrier job state transitions
- `src/Population/index.ts` - Add carrier job assignment methods
- `src/ContentLoader/index.ts` - Load production pipelines and storage configs
- `src/index.ts` - Initialize StorageManager, ProductionManager, CarrierRoutingService in GameManager

#### Backend (`packages/backend/src`)
- No new files needed (events auto-routed)

#### Frontend (`packages/frontend/src/game`)
- `components/BuildingStoragePanel.tsx` - Storage UI component
- `components/BuildingProductionPanel.tsx` - Production UI component
- `components/CarrierJobPanel.tsx` - Carrier job UI component
- `components/BuildingInfoPanel.tsx` - Add production/storage sections
- `components/UIContainer.tsx` - Include new components
- `services/StorageService.ts` - Storage state management
- `services/ProductionService.ts` - Production state management
- `services/CarrierService.ts` - Carrier job state management
- `scenes/base/GameScene.ts` - Handle storage/production/carrier events
- `network/index.ts` - Initialize new services

#### Content (`content/<pack>/`)
- `productionPipelines.ts` - Production pipeline definitions
- `storageConfigs.ts` - Storage config definitions
- `buildings.ts` - Extend with production/storage properties
- `items/planks.ts` - New item: planks
- `items/index.ts` - Export planks item
- `index.ts` - Export production pipelines and storage configs

---

### Testing & Verification

#### Unit Tests
- Test `StorageManager` storage buffer management
- Test `StorageManager` reservation system
- Test `ProductionManager` production pipeline processing
- Test `ProductionManager` input/output handling
- Test `CarrierRoutingService` transport request handling
- Test `CarrierRoutingService` carrier assignment
- Test state transitions for carrier jobs

#### Integration Tests
- Test building completion initializes production and storage
- Test production requests inputs when missing
- Test carrier transports goods from source to target
- Test production completes when inputs are available
- Test storage reservations prevent double-booking
- Test carrier job cancellation releases reservations

#### Manual Testing
1. **Local Simulation - Basic Production:**
	- Place woodcutter hut
	- Wait for completion
	- Assign woodcutter worker
	- Add logs to input buffer (manually or via carrier)
	- Verify production starts
	- Verify planks are produced to output buffer
	- Verify production status updates

2. **Local Simulation - Carrier Transport:**
	- Place storehouse (source) and woodcutter hut (target)
	- Add logs to storehouse output buffer
	- Verify carrier is assigned to transport job
	- Verify carrier moves to storehouse
	- Verify carrier picks up logs
	- Verify carrier moves to woodcutter hut
	- Verify carrier delivers logs
	- Verify logs are added to woodcutter hut input buffer

3. **Local Simulation - Production Chain:**
	- Place storehouse with logs
	- Place woodcutter hut
	- Assign woodcutter worker
	- Verify carrier transports logs from storehouse to woodcutter hut
	- Verify production starts when logs arrive
	- Verify planks are produced
	- Verify carrier can transport planks to storehouse

4. **Local Simulation - Storage Full:**
	- Fill target building storage
	- Request transport to full storage
	- Verify transport request is rejected or queued
	- Verify UI shows storage full message

5. **Multiplayer:**
	- Two players place production buildings
	- Verify production syncs across clients
	- Verify carrier jobs sync across clients
	- Verify storage updates sync across clients

---

### Future Hooks

#### Phase D+ (Advanced Logistics)
- Road network bonuses for carrier movement speed
- Multi-stop routing for carriers
- Transport priority queues
- Warehouse management and stockpiling
- Production queues and batch processing

#### Phase E+ (Advanced Economy)
- Resource depletion and regeneration
- Production efficiency modifiers
- Trade routes and markets
- Economic AI and automation
- Supply chain optimization

---

### Summary

Phase C establishes the foundation for the economy loop by implementing:
1. **Storage System** - Per-building storage buffers with reservations
2. **Production System** - Production pipelines that convert inputs to outputs
3. **Carrier System** - Automatic transport of goods between buildings
4. **Integration** - Seamless integration with existing building and population systems

The phase demonstrates the full flow: resource production → storage → transport → consumption, enabling players to build sustainable production chains and manage their settlement's economy.

