## Phase C — Goods Flow Prototype Plan

### Objective
Implement a production and logistics system where buildings can produce goods (logs → planks), request input resources, and carriers transport goods between buildings and storage. This phase establishes the foundation for the economy loop by demonstrating the full flow: resource production → storage → transport → consumption.

**Goal:** Move wood from source (tree/woodcutter hut) to production building (sawmill) to storage (storehouse), with carriers automatically routing goods.

**Note:** Phase C focuses on a simple two-resource chain (logs → planks) and basic point-to-point carrier routing. Road networks, advanced logistics, and production queues will be added in later phases.

**Important:** This phase builds on Phase B+ which introduced `JobsManager` for centralized job management and transport jobs for construction resource collection. Phase C extends the existing transport system to support building-to-building transport and adds production/storage systems.

---

### Existing Building Blocks (from Phase B+)

- **JobsManager (`packages/game/src/Jobs`)**  
	Centralized job management for all job types (Construction, Production, Transport). Handles job creation, tracking, assignment coordination, and completion/cancellation. Already supports transport jobs for construction resource collection (ground items → buildings).

- **BuildingManager (`packages/game/src/Buildings`)**  
	Manages building instances, construction progress, and worker assignments. Already integrated with JobsManager for resource collection and worker assignment.

- **PopulationManager (`packages/game/src/Population`)**  
	Tracks settlers by profession (including Carrier). State machine handles worker assignment and transport jobs. Already supports transport state transitions (`MovingToItem`, `CarryingItem`).

- **MovementManager (`packages/game/src/Movement`)**  
	Provides unified, entity-agnostic movement system. Used by settlers for all movement, including transport.

- **LootManager (`packages/game/src/Loot`)**  
	Manages dropped items on the map. Currently used as source for construction resources. In Phase C, also used as fallback source for production inputs (priority 2, after building storage).

- **MapManager (`packages/game/src/Map`)**  
	Provides pathfinding for movement. Already used by JobsManager for transport pathfinding.

- **Scheduler (`packages/game/src/Scheduler`)**  
	Provides timed event infrastructure. Used for production ticks and periodic state updates.

- **SettlerStateMachine (`packages/game/src/Population/StateMachine`)**  
	Manages settler state transitions. Already supports `MovingToItem` and `CarryingItem` states for transport jobs.

---

### Shared Game Package Additions (`packages/game`)

#### 1. Content Schema Extensions

**Note:** No changes to `GameContent` needed - storage capacities and production recipes are defined directly on `BuildingDefinition`.

**Extend `BuildingDefinition` to include:**
- `productionRecipe?: ProductionRecipe` - Production recipe (inputs → outputs) - if defined, building can produce items
- `storage?: StorageCapacity` - Storage capacity per item type (used for both inputs and outputs - item types won't collide)

**Note:** All storage items are moved by carriers - no `requiresCarrier` property needed.
**Note:** Input and output item types are different (e.g., logs → planks), so a single storage buffer is sufficient.

**Note:** ItemMetadata does not need changes - items are generic and don't define how they're produced or stored. Production and storage are building-specific concerns.

**New Type Definitions (`src/Storage/types.ts`):**
```typescript
export interface StorageCapacity {
	// Record of itemType -> maximum capacity for that item type
	// If itemType is not in the record, that item type cannot be stored
	// Empty record = no storage capacity
	capacities: Record<string, number> // itemType -> max capacity
}

export interface BuildingStorage {
	buildingInstanceId: string
	buffer: Map<string, number>  // itemType -> quantity (runtime only)
	reserved: Map<string, number>  // itemType -> reserved quantity (for incoming/outgoing deliveries) (runtime only)
	// Note: Storage capacities are defined in BuildingDefinition, not stored here
	// StorageManager reads capacities from BuildingDefinition when needed
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
export interface ProductionRecipe {
	inputs: Array<{
		itemType: string
		quantity: number
	}>
	outputs: Array<{
		itemType: string
		quantity: number
	}>
	productionTime: number // Time in seconds to produce one batch
}

export interface BuildingProduction {
	buildingInstanceId: string
	status: ProductionStatus
	progress: number // 0-100
	currentBatchStartTime?: number
	isProducing: boolean
}

export enum ProductionStatus {
	Idle = 'idle',
	NoInput = 'no_input',
	InProduction = 'in_production',
	NoWorker = 'no_worker' // Building requires worker but none assigned
}
```

**Extend `JobAssignment` in `src/Population/types.ts`:**
```typescript
export interface JobAssignment {
	jobId: string
	settlerId: SettlerId
	buildingInstanceId: string // Target building (destination)
	jobType: JobType // Construction, Production, or Transport
	priority: number
	assignedAt: number
	status: 'pending' | 'active' | 'completed' | 'cancelled'
	
	// Transport-specific fields (only populated when jobType === JobType.Transport)
	sourceItemId?: string        // Item ID on the ground (from LootManager) - for ground-to-building transport
	sourceBuildingInstanceId?: string // Source building ID - for building-to-building transport (NEW)
	sourcePosition?: Position    // Position of item on the ground or source building
	carriedItemId?: string       // Item ID being carried - after pickup (for ground items)
	itemType?: string            // Item type to transport (logs, stone, etc.)
	quantity?: number            // Quantity to transport
	reservationId?: string       // Storage reservation ID for building-to-building transport (NEW)
	
	// Worker assignment fields (for construction/production jobs that need tool pickup first)
	requiredProfession?: ProfessionType // Required profession for this job (if settler needs tool)
}
```

**Note:** No changes to `SettlerState` enum needed - existing `MovingToItem` and `CarryingItem` states will handle both ground items and building pickups.

**Note:** No changes to `SettlerStateContext` needed - `jobId` is sufficient to look up all job details from `JobAssignment`.

#### 2. Events (`src/Storage/events.ts`, `src/Production/events.ts`)

**Storage Events:**
```typescript
export const StorageEvents = {
	SC: {
		StorageUpdated: 'sc:storage:storage-updated',      // Building storage updated (includes itemType, quantity)
		ReservationCreated: 'sc:storage:reservation-created',
		ReservationCancelled: 'sc:storage:reservation-cancelled'
	},
	SS: {
		StorageTick: 'ss:storage:storage-tick',            // Internal storage management tick
		InputRequested: 'ss:storage:input-requested'       // Building requested input (itemType, quantity)
	}
} as const
```

**Note:** No client-to-server (CS) events needed for storage - reservations are handled automatically by the system when transport jobs are created/completed/cancelled. Clients only receive server-to-client (SC) events for notifications.

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
		StatusChanged: 'sc:production:status-changed'      // no_input, in_production, idle, no_worker
	},
	SS: {
		ProductionTick: 'ss:production:production-tick'    // Internal production processing tick
	}
} as const
```

**Note:** No separate `CarrierEvents` needed - carrier functionality is handled by `JobsManager` and existing `PopulationEvents`. Transport jobs are tracked via `JobAssignment` and state changes are surfaced through `PopulationEvents.SC.SettlerUpdated`.

#### 3. StorageManager (`src/Storage/index.ts`)

**Responsibilities:**
- Manage per-building storage buffers - runtime state only
- Handle storage reservations for incoming/outgoing deliveries
- Read storage capacities from BuildingDefinition (capacities are per building type, not instance)
- Emit storage update events
- Provide APIs for buildings to request/release storage
- Distinguish between input and output items based on production recipe (inputs are consumed, outputs are produced)

**Key Methods:**
```typescript
export class StorageManager {
	private buildingStorages: Map<string, BuildingStorage> = new Map() // buildingInstanceId -> BuildingStorage
	private reservations: Map<string, StorageReservation> = new Map()  // reservationId -> StorageReservation

	constructor(
		private event: EventManager,
		private buildingManager: BuildingManager,
		private itemsManager: ItemsManager,
		private logger: Logger
	) {
		this.setupEventHandlers()
		this.startStorageTickLoop()
	}

	// Initialize storage for a building
	// Creates BuildingStorage with empty buffer (capacities are read from BuildingDefinition when needed)
	public initializeBuildingStorage(buildingInstanceId: string): void

	// Get building storage
	public getBuildingStorage(buildingInstanceId: string): BuildingStorage | undefined

	// Reserve storage space for delivery (incoming or outgoing)
	public reserveStorage(buildingInstanceId: string, itemType: string, quantity: number, reservedBy: string): string | null // Returns reservationId

	// Add items to building storage
	public addToStorage(buildingInstanceId: string, itemType: string, quantity: number): boolean

	// Remove items from building storage
	public removeFromStorage(buildingInstanceId: string, itemType: string, quantity: number): boolean

	// Check if building has available storage for item type
	public hasAvailableStorage(buildingInstanceId: string, itemType: string, quantity: number): boolean

	// Check if building accepts item type
	// Returns true if itemType has a capacity defined in BuildingDefinition
	public acceptsItemType(buildingInstanceId: string, itemType: string): boolean

	// Get storage capacity for item type (reads from BuildingDefinition)
	public getStorageCapacity(buildingInstanceId: string, itemType: string): number

	// Get available quantity for an item type (capacity - current - reserved)
	public getAvailableQuantity(buildingInstanceId: string, itemType: string): number

	// Get current quantity for an item type
	public getCurrentQuantity(buildingInstanceId: string, itemType: string): number

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
- Emit production status updates (no_input, in_production, idle, no_worker)
- Integrate with StorageManager for storage
- Request input resources via JobsManager when inputs are missing

**Key Methods:**
```typescript
export class ProductionManager {
	private buildingProductions: Map<string, BuildingProduction> = new Map() // buildingInstanceId -> BuildingProduction

	constructor(
		private event: EventManager,
		private buildingManager: BuildingManager,
		private storageManager: StorageManager,
		private jobsManager: JobsManager,
		private lootManager: LootManager,
		private logger: Logger
	) {
		this.setupEventHandlers()
		this.startProductionTickLoop()
	}

	// Initialize production for a building (gets recipe from BuildingDefinition)
	public initializeBuildingProduction(buildingInstanceId: string): void

	// Start production for a building
	public startProduction(buildingInstanceId: string): boolean

	// Stop production for a building
	public stopProduction(buildingInstanceId: string): void

	// Process production tick (convert inputs to outputs)
	private processProduction(buildingInstanceId: string): void

	// Get production recipe for a building (from BuildingDefinition)
	private getProductionRecipe(buildingInstanceId: string): ProductionRecipe | null

	// Check if building has required inputs
	private hasRequiredInputs(buildingInstanceId: string, recipe: ProductionRecipe): boolean

	// Consume inputs from storage
	private consumeInputs(buildingInstanceId: string, recipe: ProductionRecipe): boolean

	// Produce outputs to storage
	private produceOutputs(buildingInstanceId: string, recipe: ProductionRecipe): void

	// Get production status (no_input, in_production, idle, no_worker)
	public getProductionStatus(buildingInstanceId: string): ProductionStatus

	// Production tick loop
	private startProductionTickLoop(): void
	private productionTick(): void

	// Request input resources (delegate to JobsManager for transport)
	// Priority: 1) Buildings with available outputs, 2) Ground items from LootManager
	private requestInputResources(buildingInstanceId: string, recipe: ProductionRecipe): void

	// Request output transport (delegate to JobsManager for building-to-building transport)
	// Finds target buildings that need the output items
	private requestOutputTransport(buildingInstanceId: string, recipe: ProductionRecipe): void

	// Find source buildings with available output items (for input requests, priority 1)
	// Returns buildings with available output items
	private findSourceBuildings(itemType: string, quantity: number, mapName: string, playerId: string): string[] // Returns buildingInstanceId[]

	// Find ground items from LootManager (for input requests, priority 2, fallback)
	// Returns ground items of the required type
	private findGroundItems(itemType: string, quantity: number, mapName: string, playerId: string): Array<{ itemId: string, position: Position }> // Returns ground items

	// Find target buildings that need input items (for output requests)
	// Returns buildings that need the input items
	private findTargetBuildings(itemType: string, quantity: number, mapName: string, playerId: string): string[] // Returns buildingInstanceId[]
}
```

#### 5. JobsManager Extensions (`src/Jobs/index.ts`)

**New Methods for Building-to-Building Transport:**
```typescript
export class JobsManager {
	// ... existing methods ...

	// NEW: Request transport from source building to target building
	public requestTransport(
		sourceBuildingInstanceId: string,
		targetBuildingInstanceId: string,
		itemType: string,
		quantity: number,
		priority: number = 1
	): string | null // Returns jobId or null if transport cannot be created

	// NEW: Find source building with available output items
	private findSourceBuilding(
		mapName: string,
		playerId: string,
		itemType: string,
		quantity: number
	): { buildingInstanceId: string, buildingPosition: Position } | null

	// NEW: Handle building pickup (remove from source building storage)
	private handleBuildingPickup(jobId: string): boolean

	// NEW: Handle building delivery (add to target building storage)
	private handleBuildingDelivery(jobId: string): boolean
}
```

**Updated `requestResourceCollection` method:**
- Keep existing functionality (ground items → buildings for construction)
- No changes needed - this handles construction resource collection

**New `requestTransport` method implementation:**
1. Validate source and target buildings exist
2. Check if source building has available output items (via StorageManager)
3. Check if target building has available input storage (via StorageManager)
4. Reserve storage at source (output) and target (input) buildings
5. Find available carrier
6. Create transport job with `sourceBuildingInstanceId` (not `sourceItemId`)
7. Assign carrier to job (delegate to PopulationManager)

#### 6. State Transition Extensions

**Extend `Idle_MovingToItem` transition (`src/Population/transitions/Idle_MovingToItem.ts`):**
- Update `validate` to check for both `sourceItemId` (ground items) and `sourceBuildingInstanceId` (building storage)
- Update `action` to handle both cases:
	- If `sourceItemId` exists: Move to item position (existing behavior)
	- If `sourceBuildingInstanceId` exists: Move to source building position (new behavior)
- Update `completed` to handle both cases:
	- If `sourceItemId` exists: Pick up item from LootManager (existing behavior)
	- If `sourceBuildingInstanceId` exists: Remove items from source building storage via StorageManager (new behavior)

**Extend `MovingToItem_CarryingItem` transition (`src/Population/transitions/MovingToItem_CarryingItem.ts`):**
- Update `validate` to check if building exists (already handles this)
- Update `completed` to handle both delivery types:
	- If target is construction site: Deliver to BuildingManager.addResourceToBuilding() (existing behavior)
	- If target has storage: Deliver to StorageManager.addToStorage() (new behavior)

**Note:** The transition name `MovingToItem` is slightly misleading for building pickups, but we'll keep it for consistency. The transition handles both ground items and building storage pickups.

#### 7. BuildingManager Integration

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
- `completeBuilding`: Initialize production and storage when building completes (if building has production recipe)
- `tick`: Include production tick processing (delegate to ProductionManager)

#### 8. PopulationManager Integration

**No new methods needed** - existing `assignWorkerToTransportJob` already handles transport job assignment. The state machine transitions will handle building pickups automatically.

**Note:** Existing state transitions (`Idle_MovingToItem`, `MovingToItem_CarryingItem`, `CarryingItem_Idle`) will work for building-to-building transport with minimal changes.

#### 9. Content Loader Updates

**Note:** Storage capacities and production recipes are loaded directly from `BuildingDefinition` - no separate loading needed.
- Storage capacities come from `BuildingDefinition.storage`
- Production recipes come from `BuildingDefinition.productionRecipe`

---

### Backend Adapter Touchpoints

**No new backend files needed** - Events auto-routed via `EventBusManager`.

**Event Routing:**
- `cs:storage:*`, `cs:production:*` → Routed to respective managers
- `sc:storage:*`, `sc:production:*` → Broadcast to clients in map group
- `ss:storage:*`, `ss:production:*` → Internal server events

**Note:** Transport jobs are handled by `JobsManager` and don't need separate events - state changes are surfaced through existing `PopulationEvents.SC.SettlerUpdated` events.

---

### Frontend Adapter Scope

#### 1. Building Info Panel Updates

**BuildingInfoPanel.tsx:**
- **Storage Section:** Display building storage
  - Show storage capacity and usage per item type
  - Display reserved storage per item type
  - Show which item types can be stored (based on capacity definitions)
- **Production Section:** Display production information (if building has production recipe)
  - Show production status (no_input, in_production, idle, no_worker)
  - Show production progress bar
  - Display input requirements and current input quantities
  - Display output items and quantities
  - Show production recipe (inputs → outputs)
  - Display production time remaining
- Integrate storage and production information into existing building info display
- Show construction requirements and collected resources (existing Phase B+ functionality)
- Show transport jobs (via existing settler state display)

#### 2. Game Scene Updates

**GameScene.ts:**
- Handle `sc:storage:storage-updated` events
- Handle `sc:production:status-changed` events
- Update building visuals based on production status
- Display storage indicators on buildings

#### 3. Services

**StorageService.ts:**
- Cache building storage state
- Subscribe to storage update events
- Provide methods to query storage

**ProductionService.ts:**
- Cache building production state
- Subscribe to production status events
- Provide methods to query production status

**Note:** No separate `CarrierService` needed - carrier jobs are tracked via existing `PopulationService` and `JobAssignment` interface.

---

### Content Pack Updates

#### 1. Building Definitions with Production Recipes and Storage (`content/<pack>/buildings.ts`)

```typescript
import { BuildingDefinition, ProductionRecipe, StorageCapacity } from '@rugged/game'

export const buildings: BuildingDefinition[] = [
	{
		id: 'sawmill',
		name: 'Sawmill',
		description: 'Converts logs into planks',
		// ... existing properties (category, icon, sprite, footprint, constructionTime, costs) ...
		productionRecipe: {
			inputs: [
				{ itemType: 'logs', quantity: 2 }
			],
			outputs: [
				{ itemType: 'planks', quantity: 1 }
			],
			productionTime: 10 // 10 seconds
		},
		storage: {
			capacities: {
				'logs': 20, // Can store up to 20 logs (input)
				'planks': 10 // Can store up to 10 planks (output)
			}
		},
		workerSlots: 1,
		requiredProfession: 'woodcutter'
	},
	{
		id: 'storehouse',
		name: 'Storehouse',
		description: 'General storage building',
		// ... existing properties ...
		// No productionRecipe - this is a storage-only building
		storage: {
			capacities: {
				'logs': 50,
				'planks': 50,
				'stone': 50
				// Add more item types as needed
			}
		}
	}
]
```

#### 3. Item Metadata (`content/<pack>/items/planks.ts`)

```typescript
import { ItemMetadata, ItemCategory } from '@rugged/game'

export default {
	id: 'planks',
	name: 'Planks',
	emoji: '🪵',
	description: 'Processed wooden planks',
	category: ItemCategory.Material,
	stackable: true,
	maxStackSize: 50
} as ItemMetadata
```

---

### Event/State Lifecycle

#### 1. Building Completion & Production Initialization

1. Building completes construction
2. `BuildingManager.completeBuilding()` called
3. `StorageManager.initializeBuildingStorage()` called (if building has storage)
4. `ProductionManager.initializeBuildingProduction()` called (if building has production recipe)
5. `sc:buildings:completed` event emitted
6. Frontend receives event and updates building visual

#### 2. Production Start & Input Request

1. Building has production recipe and worker assigned
2. `ProductionManager.startProduction()` called (or automatically started)
3. Get production recipe from `BuildingDefinition.productionRecipe`
4. Check if building has required inputs in storage
5. If no inputs:
	- Set status to `no_input`
	- `ProductionManager.requestInputResources()` called
	- **Priority 1:** `ProductionManager.findSourceBuildings()` finds buildings with available output items
		- If source building found: `JobsManager.requestTransport()` called for building-to-building transport
		- Carrier assigned to transport job
	- **Priority 2:** If no source buildings found, `ProductionManager.findGroundItems()` searches for ground items
		- If ground items found: `JobsManager.requestResourceCollection()` called (existing Phase B+ functionality)
		- Carrier assigned to collect ground items
	- If no sources found (neither buildings nor ground items), building remains in `no_input` status
6. If inputs available:
	- Set status to `in_production`
	- Start production timer
	- `sc:production:production-started` event emitted

#### 3. Carrier Assignment & Transport (Building-to-Building)

1. `JobsManager.requestTransport()` called
2. Find source building with available output items (via StorageManager)
3. Reserve storage at source (output) and target (input) buildings
4. Find available carrier (Carrier profession, Idle state)
5. Create `JobAssignment` with `sourceBuildingInstanceId` (not `sourceItemId`)
6. Assign carrier to job via `PopulationManager.assignWorkerToTransportJob()`
7. State transition: `Idle -> MovingToItem` (carrier moves to source building)
8. Carrier moves to source building using `MovementManager`
9. `PopulationEvents.SC.SettlerUpdated` event emitted (state: `MovingToItem`)

#### 4. Carrier Pickup (Building Storage)

1. Carrier arrives at source building
2. `MovementEvents.SS.PathComplete` event emitted (targetType: 'building', targetId: sourceBuildingInstanceId)
3. `Idle_MovingToItem.completed` callback called
4. Check if `sourceBuildingInstanceId` exists (building-to-building transport)
5. Remove items from source building storage (via StorageManager)
6. Update job: Set `carriedItemId` (generated UUID) and clear `sourceBuildingInstanceId`
7. Update carrier state: `MovingToItem -> CarryingItem`
8. Carrier starts moving to target building
9. `PopulationEvents.SC.SettlerUpdated` event emitted (state: `CarryingItem`)

#### 5. Carrier Delivery (Building Storage)

1. Carrier arrives at target building
2. `MovementEvents.SS.PathComplete` event emitted (targetType: 'building', targetId: targetBuildingInstanceId)
3. `MovingToItem_CarryingItem.completed` callback called
4. Check if target building has storage (via StorageManager)
5. Add items to target building storage (via StorageManager)
6. Release storage reservations
7. Complete transport job via `JobsManager.completeJob()`
8. Update carrier state: `CarryingItem -> Idle`
9. `PopulationEvents.SC.SettlerUpdated` event emitted (state: `Idle`)
10. `StorageEvents.SC.StorageUpdated` event emitted for target building
11. If target building is production building and was waiting for inputs, production may start

#### 6. Production Completion

1. Production timer completes
2. `ProductionManager.processProduction()` called
3. Get production recipe from `BuildingDefinition.productionRecipe`
4. Consume inputs from storage (via StorageManager)
5. Produce outputs to storage (via StorageManager)
6. `sc:production:production-completed` event emitted
7. `sc:storage:storage-updated` event emitted
8. Request carrier to transport outputs if needed (via `ProductionManager.requestOutputTransport()`)
	- `ProductionManager.findTargetBuildings()` finds buildings that need the output items
	- `JobsManager.requestTransport()` called for first available target building
9. Immediately check if next batch can start:
	- If inputs available:
		- Start next production batch
		- Set status to `in_production`
	- If no inputs:
		- Set status to `no_input`
		- Request input resources via `ProductionManager.requestInputResources()`
		- Checks buildings first (priority 1), then ground items (priority 2)

**Note:** Production status transitions immediately after completion - either to `in_production` (next batch started) or `no_input` (waiting for inputs). Transport of outputs is handled automatically based on storage state and doesn't require a separate status. If storage becomes full during production, the `produceOutputs()` method will handle capacity checks before adding outputs.

---

### Design Decisions

#### 1. Recipes Defined on Buildings

**Rationale:** Production recipes are defined directly on `BuildingDefinition` rather than in a separate `ProductionPipelineDefinition`. This simplifies the design, reduces indirection, and makes it easier to understand what each building produces. By aggregating recipes from all buildings, we can determine what buildings require and produce.

**Implementation:**
- `BuildingDefinition.productionRecipe` contains the production recipe (inputs → outputs)
- `ProductionManager` reads recipes directly from `BuildingDefinition` via `BuildingManager`
- No separate pipeline loading needed - recipes are part of building definitions
- When multiple buildings need the same input, `ProductionManager.requestInputResources()` checks:
	1. Buildings with available outputs (priority 1) - `findSourceBuildings()` returns first available building
	2. Ground items from LootManager (priority 2, fallback) - `findGroundItems()` returns closest ground items
- When multiple buildings can accept the same output, `ProductionManager.findTargetBuildings()` returns the first available building
- Buildings have priority over ground items to encourage production chains and use of processed materials

#### 2. Reuse Existing JobsManager

**Rationale:** Phase B+ already introduced `JobsManager` for centralized job management. Phase C extends it rather than creating a new `CarrierRoutingService`.

**Implementation:**
- Add `requestTransport()` method to `JobsManager` for building-to-building transport
- Keep `requestResourceCollection()` for ground-to-building transport (construction)
- Both methods create `JobAssignment` with `JobType.Transport`
- Transport jobs distinguished by `sourceItemId` (ground) vs `sourceBuildingInstanceId` (building)

#### 3. Extend Existing State Transitions

**Rationale:** Existing `MovingToItem` and `CarryingItem` states can handle both ground items and building storage pickups. No new states needed.

**Implementation:**
- `Idle_MovingToItem` transition handles both `sourceItemId` and `sourceBuildingInstanceId`
- `MovingToItem_CarryingItem` transition handles delivery to both construction sites and storage
- Transition logic checks job type and routes to appropriate manager (LootManager vs StorageManager)

#### 4. Storage Reservations

**Rationale:** Prevent multiple carriers from picking up the same items or delivering to a full storage. Reservations are created when a transport request is made and released when delivery is complete or cancelled.

**Implementation:**
- Reservations track reserved quantity for deliveries (incoming or outgoing)
- Reservations have status: `pending`, `in_transit`, `delivered`, `cancelled`
- Storage capacity checks include reserved quantities (capacities read from BuildingDefinition)
- Reservations are created in `JobsManager.requestTransport()` and released in `MovingToItem_CarryingItem.completed`
- Single reservation system handles both input and output items (item types won't collide)

#### 5. Carrier Inventory

**Rationale:** Carriers need to carry items between buildings. For building-to-building transport, we don't create physical item entities - items are transferred directly between storage.

**Implementation:**
- For ground items: Item is removed from LootManager and `carriedItemId` is set (existing behavior)
- For building storage: Items are removed from source storage and `carriedItemId` is set to a generated UUID (for tracking)
- On delivery: Items are added to target storage and `carriedItemId` is cleared
- No physical item entities are created for building-to-building transport
- Input and output items use the same storage buffer (item types are different, so no collision)

#### 6. Production Status

**Rationale:** Buildings need to communicate their state to the UI and other systems. Status indicates whether building is idle, waiting for inputs, producing, or missing a worker. After production completes, the status immediately transitions to either `in_production` (if inputs available for next batch) or `no_input` (if no inputs). There is no `output_ready` status - transport requests for outputs are handled automatically based on storage state, not via a separate status. The status reflects what the building is actively doing, not what's sitting in storage.

**Implementation:**
- Status enum: `idle`, `no_input`, `in_production`, `no_worker`
- Status changes trigger `sc:production:status-changed` events
- UI can display status indicators on buildings

#### 6. Automatic Input Request

**Rationale:** Buildings should automatically request inputs when they run out, rather than requiring manual player intervention. This enables autonomous production chains. Inputs can come from two sources: building storage (priority 1) or ground items (priority 2).

**Implementation:**
- `ProductionManager` checks for required inputs before starting production
- If inputs are missing, `requestInputResources()` is called
- **Priority 1 - Building Storage:** `ProductionManager.findSourceBuildings()` finds available source buildings (buildings with output items)
	- Source buildings are found by querying `StorageManager` for buildings with available items of the required type
	- If source building found, `JobsManager.requestTransport()` is called for building-to-building transport
- **Priority 2 - Ground Items:** If no source buildings found, `ProductionManager.findGroundItems()` searches for ground items via `LootManager`
	- Ground items are found by querying `LootManager` for items of the required type on the map
	- If ground items found, `JobsManager.requestResourceCollection()` is called (existing Phase B+ functionality)
- Buildings have priority over ground items - production chains should use processed materials from buildings when available
- Ground items serve as fallback for raw materials or when building storage is empty

#### 7. Point-to-Point Routing

**Rationale:** Phase C focuses on simple point-to-point routing. Advanced routing (multiple stops, road networks, priority queues) will be added in later phases.

**Implementation:**
- `JobsManager.requestTransport()` routes directly from source to target building
- Uses `MapManager.findPath()` for pathfinding
- No road network bonuses or multi-stop routing in Phase C

#### 8. Storage Capacities Per Building Type

**Rationale:** Storage capacities are a property of the building type, not the instance. All instances of the same building type share the same capacity definitions.

**Implementation:**
- Storage capacities (`storage`) are defined in `BuildingDefinition` (per building type)
- `BuildingStorage` only tracks runtime state: buffer (current quantities) and reservations
- `StorageManager` reads capacities from `BuildingDefinition` via `BuildingManager` when needed
- Methods like `getStorageCapacity()` look up the building instance, get its `buildingId`, then read the capacity from the `BuildingDefinition`
- Input and output items share the same storage buffer (item types are different, so no collision)

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

**Scenario:** Source building storage is empty when carrier arrives (no items of requested type available).

**Handling:**
- Check output availability before creating transport request
- Reserve output items when transport request is created
- If output becomes unavailable after reservation, job is cancelled
- Carrier returns to Idle state (existing cancellation handling)

#### 3. Carrier Unavailable

**Scenario:** No available carriers when transport request is made.

**Handling:**
- Transport request is queued in `JobsManager` (tracked via `activeJobsByBuilding`)
- When carrier becomes available, assign to queued request
- `ProductionManager` will retry input request on next tick if no carrier available

#### 4. Building Destroyed During Transport

**Scenario:** Source or target building is destroyed while carrier is transporting.

**Handling:**
- Cancel transport job when building is destroyed (existing cancellation handling)
- Release storage reservations
- Return carrier to Idle state
- If carrier is carrying items, drop them at current location (using LootManager) - existing `handleJobCancellation` handles this

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
- `src/types.ts` - No changes needed (storage capacities in BuildingDefinition)
- `src/events.ts` - Register `Storage`, `Production` namespaces
- `src/Storage/` - New directory:
	- `types.ts` - Storage-related types (StorageCapacity, BuildingStorage, StorageReservation)
	- `events.ts` - Storage events
	- `index.ts` - StorageManager implementation
- `src/Production/` - New directory:
	- `types.ts` - Production-related types (ProductionRecipe, BuildingProduction, ProductionStatus)
	- `events.ts` - Production events
	- `index.ts` - ProductionManager implementation
- `src/Jobs/index.ts` - Add `requestTransport()` method for building-to-building transport
- `src/Jobs/index.ts` - Add `handleBuildingPickup()` and `handleBuildingDelivery()` methods
- `src/Buildings/types.ts` - Extend BuildingDefinition with `productionRecipe` and `storage` (single storage, not input/output separate)
- `src/Buildings/index.ts` - Add production/storage integration methods
- `src/Items/types.ts` - No changes needed (items are generic)
- `src/Population/types.ts` - Extend JobAssignment with `sourceBuildingInstanceId` and `reservationId`
- `src/Population/transitions/Idle_MovingToItem.ts` - Extend to handle building storage pickups
- `src/Population/transitions/MovingToItem_CarryingItem.ts` - Extend to handle storage delivery
- `src/Population/transitions/types.ts` - Add StorageManager to StateMachineManagers
- `src/ContentLoader/index.ts` - No changes needed (storage and production loaded from BuildingDefinition)
- `src/index.ts` - Initialize StorageManager and ProductionManager in GameManager

#### Backend (`packages/backend/src`)
- No new files needed (events auto-routed)

#### Frontend (`packages/frontend/src/game`)
- `components/BuildingInfoPanel.tsx` - Extend existing panel with storage and production information
- `services/StorageService.ts` - Storage state management
- `services/ProductionService.ts` - Production state management
- `scenes/base/GameScene.ts` - Handle storage/production events
- `network/index.ts` - Initialize new services

#### Content (`content/<pack>/`)
- `buildings.ts` - Extend with production recipes and storage capacities (single `storage` property)
- `items/planks.ts` - New item: planks
- `items/index.ts` - Export planks item
- `index.ts` - Export buildings (storage and production are in BuildingDefinition)

---

### Testing & Verification

#### Unit Tests
- Test `StorageManager` storage management
- Test `StorageManager` reservation system
- Test `ProductionManager` production pipeline processing
- Test `ProductionManager` input/output handling
- Test `JobsManager.requestTransport()` transport request handling
- Test `JobsManager` building-to-building transport
- Test state transitions for building storage pickups

#### Integration Tests
- Test building completion initializes production and storage
- Test production requests inputs when missing
- Test carrier transports goods from source building to target building
- Test production completes when inputs are available
- Test storage reservations prevent double-booking
- Test carrier job cancellation releases reservations
- Test building-to-building transport works alongside ground-to-building transport

#### Manual Testing
1. **Local Simulation - Basic Production:**
	- Place sawmill (production building)
	- Wait for completion
	- Assign woodcutter worker
- Manually add logs to storage (via StorageManager API or carrier)
- Verify production starts
- Verify planks are produced to storage
	- Verify production status updates

2. **Local Simulation - Building-to-Building Transport:**
	- Place storehouse (source) and sawmill (target)
	- Add logs to storehouse storage
	- Verify carrier is assigned to transport job
	- Verify carrier moves to storehouse
	- Verify carrier picks up logs from storehouse storage
	- Verify carrier moves to sawmill
	- Verify carrier delivers logs to sawmill storage
	- Verify logs are added to sawmill storage

3. **Local Simulation - Production Chain:**
	- Place storehouse with logs in storage
	- Place sawmill
	- Assign woodcutter worker
	- Verify carrier transports logs from storehouse to sawmill
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
1. **Storage System** - Per-building storage with per-item-type capacities and reservations
2. **Production System** - Production recipes defined directly on buildings that convert inputs to outputs
3. **Extended Transport System** - Building-to-building transport via JobsManager (extends existing ground-to-building transport)
4. **Integration** - Seamless integration with existing JobsManager, BuildingManager, and PopulationManager systems

The phase demonstrates the full flow: resource production → storage → transport → consumption, enabling players to build sustainable production chains and manage their settlement's economy.

**Key Differences from Original Plan:**
- Uses existing `JobsManager` instead of creating `CarrierRoutingService`
- Extends existing `JobAssignment` interface instead of creating `CarrierJob`
- Reuses existing state transitions (`MovingToItem`, `CarryingItem`) instead of creating new states
- Integrates with existing transport job system from Phase B+
- **Recipes defined directly on buildings** instead of separate `ProductionPipelineDefinition` - simpler design, easier to understand
- **Storage capacities defined per building type** - no separate `StorageConfigDefinition`, capacities defined directly on `BuildingDefinition`
- **Per-item-type storage capacities** - each building defines capacity for each item type it can store
- **Simplified resource allocation** - first available building is used (no priority system for now)
