## Phase B — Settler Spawn & Job Assignment Plan

### Objective
Implement a population system where players can place houses to spawn settlers, assign them to buildings for construction work, and track population statistics. Settlers will have professions (builder, carrier) and can be assigned to construction jobs. The system must sync across multiplayer sessions and provide UI feedback for population management.

**Note:** Phase B focuses on construction jobs only. Production and transport jobs will be added in Phase C (Goods Flow Prototype).

---

### Existing Building Blocks

- **NPC System (`packages/game/src/NPC`)**  
	Provides movement, state management, and interaction patterns. Settlers can reuse NPC infrastructure for movement and visual representation, but will have distinct behavior (job assignment, building occupancy).

- **BuildingManager (`packages/game/src/Buildings`)**  
	Manages building instances, construction progress, and building states. Needs hooks to track worker occupancy and job assignments.

- **Scheduler (`packages/game/src/Scheduler`)**  
	Provides timed event infrastructure for periodic updates. Can be used for population growth, job processing, and periodic state updates.

- **MapObjectsManager (`packages/game/src/MapObjects`)**  
	Handles object placement and collision. Houses will be buildings, but settlers spawned from houses are separate entities.

- **Event Infrastructure (`packages/game/src/events.ts`)**  
	Event routing with `cs:`/`sc:`/`ss:` prefixes. New population events will follow the same pattern as building events.

---

### Shared Game Package Additions (`packages/game`)

#### 1. Content Schema Extensions

**Extend `GameContent` with:**
- `professions: ProfessionDefinition[]` - Define settler professions (Carrier is default, Builder, Woodcutter, etc.)
- `professionTools: ProfessionToolDefinition[]` - Define tools that change settler profession
- Extend `BuildingDefinition` to include:
	- `spawnsSettlers?: boolean` - Whether this building spawns settlers (houses)
	- `maxOccupants?: number` - Maximum settlers that can work here
	- `requiredProfession?: ProfessionType` - Profession required to work here (optional, defaults to any profession)
	- `spawnRate?: number` - Settlers spawned per time period in seconds (if spawnsSettlers is true)
	- Note: All houses spawn Carrier settlers by default
	- Note: Profession changes happen via tool pickup, not building assignment
- Extend `ItemMetadata` to include:
	- `changesProfession?: ProfessionType` - If this item is a profession-changing tool

**New Type Definitions (`src/Population/types.ts`):**
```typescript
export type SettlerId = string

export enum ProfessionType {
	Carrier = 'carrier', // Default profession for all settlers
	Builder = 'builder',
	Woodcutter = 'woodcutter',
	Miner = 'miner'
	// Note: Settlers can change profession when assigned to specific buildings
}

export enum SettlerState {
	Idle = 'idle',
	Working = 'working',
	Moving = 'moving',
	Assigned = 'assigned'
}

export interface ProfessionDefinition {
	type: ProfessionType
	name: string
	description: string
	icon?: string
	canBuild: boolean
	canCarry: boolean
	canWorkBuildings: string[] // Building IDs this profession can work in
}

// Note: Houses are just buildings with spawnsSettlers: true
// No separate HouseDefinition needed - use BuildingDefinition with house properties

export interface ProfessionToolDefinition {
	itemType: string // Item type that changes profession (e.g., 'hammer', 'axe')
	targetProfession: ProfessionType // Profession this tool grants
	name: string
	description: string
}

export interface Settler {
	id: SettlerId
	playerId: string
	mapName: string
	position: Position
	profession: ProfessionType
	state: SettlerState
	currentJob?: JobAssignment
	houseId?: string // House that spawned this settler
	buildingId?: string // Building this settler is assigned to work at
	path?: Position[] // Path to follow (similar to NPC path)
	speed: number // Movement speed (pixels per second)
	targetType?: 'tool' | 'building' // What the settler is moving towards
	targetId?: string // ID of tool or building the settler is moving towards
	createdAt: number
}

export interface JobAssignment {
	jobId: string
	settlerId: SettlerId
	buildingInstanceId: string
	jobType: 'construction' // Phase B only supports construction jobs. Production/transport jobs will be added in Phase C.
	priority: number
	assignedAt: number
	status: 'pending' | 'active' | 'completed' | 'cancelled'
}

export interface SpawnSettlerData {
	houseBuildingInstanceId: string
	// Note: All settlers spawn as Carrier by default (no profession parameter needed)
}

export interface RequestWorkerData {
	buildingInstanceId: string
	// Note: No settlerId needed - game automatically finds and assigns closest available settler
	// Note: Phase B only supports construction jobs. Job type is determined by building state (under construction = construction job)
}

export interface AssignWorkerData {
	settlerId: SettlerId
	buildingInstanceId: string
	// Note: Used internally after automatic settler selection
	// Note: Job type is determined by building state (under construction = construction job)
}

export interface UnassignWorkerData {
	settlerId: SettlerId
}

export interface RequestListData {
	// No data needed - server sends full population state for current player and map
}

export interface PopulationListData {
	settlers: Settler[]
	totalCount: number
	byProfession: Record<ProfessionType, number>
	idleCount: number
	workingCount: number
}

export interface PopulationStatsData {
	totalCount: number
	byProfession: Record<ProfessionType, number>
	idleCount: number
	workingCount: number
}

export interface ProfessionTool {
	itemType: string // Item type that changes profession
	targetProfession: ProfessionType // Profession this tool grants
}

// Note: SettlerPickupItemData and SettlerArrivedAtBuildingData are no longer needed
// Server detects these conditions internally during movement processing
// No client-to-server events needed for these state changes
```

#### 2. Events (`src/Population/events.ts`)

```typescript
export const PopulationEvents = {
	CS: {
		Spawn: 'cs:population:spawn', // Request to spawn settler from house (manual spawn, optional)
		RequestWorker: 'cs:population:request-worker', // Request worker for building (automatic assignment)
		UnassignWorker: 'cs:population:unassign-worker', // Unassign settler from job
		RequestList: 'cs:population:request-list', // Request full population state (settlers list + statistics)
	},
	SC: {
		SettlerSpawned: 'sc:population:settler-spawned', // Settler was spawned
		WorkerAssigned: 'sc:population:worker-assigned', // Worker assigned to job (after arriving at building)
		WorkerUnassigned: 'sc:population:worker-unassigned', // Worker unassigned
		WorkerRequestFailed: 'sc:population:worker-request-failed', // Worker request failed (no available settler/tool)
		WorkerMovingToBuilding: 'sc:population:worker-moving-to-building', // Worker is moving to building (status update)
		SettlerPositionUpdate: 'sc:population:settler-position-update', // Settler position updated (for client rendering)
		List: 'sc:population:list', // Full population state (settlers list + statistics) sent to client on join or request
		StatsUpdated: 'sc:population:stats-updated', // Population statistics updated (headcount, by profession, idle/working counts)
		ProfessionChanged: 'sc:population:profession-changed', // Settler profession changed (e.g., from tool pickup)
	},
	SS: {
		SpawnTick: 'ss:population:spawn-tick', // Internal tick for house spawning
		JobTick: 'ss:population:job-tick', // Internal tick for job processing
		MovementTick: 'ss:population:movement-tick', // Internal tick for settler movement processing
		PickupItem: 'ss:population:pickup-item', // Internal event emitted when server detects settler reached tool
		ArrivedAtBuilding: 'ss:population:arrived-at-building', // Internal event emitted when server detects settler reached building
	}
} as const
```

#### 3. PopulationManager (`src/Population/index.ts`)

**Core Responsibilities:**
- Track all settlers per player and map
- Manage house spawning (periodic spawns from completed houses)
- Handle job assignments (Phase B: construction only. Production/transport in Phase C)
- Provide population statistics (headcount, by profession, idle/working)
- Emit UI updates for population changes

**Key Methods:**
```typescript
export class PopulationManager {
	private settlers: Map<string, Settler> = new Map() // settlerId -> Settler
	private jobs: Map<string, JobAssignment> = new Map() // jobId -> JobAssignment
	private houseSettlers: Map<string, string[]> = new Map() // houseBuildingInstanceId -> settlerIds[]
	private spawnTimers: Map<string, NodeJS.Timeout> = new Map() // houseId -> timer
	private jobTickInterval: NodeJS.Timeout | null = null
	private professionTools: Map<string, ProfessionType> = new Map() // itemType -> ProfessionType
	private pendingAssignments: Map<string, { buildingInstanceId: string, status: 'waiting_for_tool' | 'waiting_for_arrival' }> = new Map() // settlerId -> pending assignment (waiting for tool pickup or building arrival)
	// Note: Job type is determined by building state (Phase B only supports construction jobs)

	constructor(
		private event: EventManager,
		private buildingManager: BuildingManager,
		private scheduler: Scheduler,
		private mapManager: MapManager,
		private lootManager: LootManager,
		private itemsManager: ItemsManager
	) {
		this.setupEventHandlers()
		this.startJobTickLoop()
		this.startMovementTickLoop() // Start movement processing loop (similar to NPCManager)
		this.loadProfessionToolsFromItems()
	}

	// Start movement tick loop to process settler movement (similar to NPCManager.processNPCMovement)
	private startMovementTickLoop(): void {
		// Set up periodic tick to process settler movement
		// During each tick, check all moving settlers and update their positions
		// Detect when settlers reach tools or buildings and emit internal events
	}

	// Load profession tools from item metadata
	private loadProfessionToolsFromItems(): void {
		// Iterate through all item metadata
		// Find items with changesProfession property
		// Register them in professionTools map
	}

	// Spawn settler from house
	private spawnSettler(data: SpawnSettlerData, client: EventClient): void {
		// 1. Verify house building exists and is completed
		// 2. Check house capacity (max settlers)
		// 3. Create settler with default Carrier profession
		// 4. Position settler near house
		// 5. Add to settlers map
		// 6. Emit sc:population:settler-spawned
		// 7. Emit sc:population:stats-updated with new stats
	}

	// Request worker for building (automatic assignment)
	private requestWorker(data: RequestWorkerData, client: EventClient): void {
		// 1. Verify building exists and needs workers
		// 2. Get building definition to check required profession
		// 3. Get building position
		// 4. Determine job type from building state:
		//    - If building is under construction: jobType = 'construction' (Phase B only)
		//    - Phase C will add production jobs for completed buildings
		// 5. Find available settler with required profession:
		//    a. Search for idle settler with matching profession
		//    b. If not found, search for profession-changing tool + closest settler
		//    c. If tool found, order settler to pick up tool (changes profession)
		//       - Store pending assignment with status 'waiting_for_tool'
		//    d. If no settler/tool available, emit WorkerRequestFailed
		// 6. Once settler has correct profession (or already has it):
		//    a. Order settler to move to building position (pathfinding)
		//    b. Store pending assignment with status 'waiting_for_arrival'
		// 7. When settler arrives at building, complete assignment (jobType determined from building state)
		// 8. Emit sc:population:worker-assigned or sc:population:worker-request-failed
	}

	// Assign settler to building/job (internal method)
	private assignWorker(settlerId: SettlerId, buildingInstanceId: string, client: EventClient): void {
		// 1. Verify settler exists and is idle/available
		// 2. Verify building exists and needs workers
		// 3. Verify settler has correct profession (should already be checked)
		// 4. Determine job type from building state:
		//    - If building is under construction: jobType = 'construction'
		//    - Phase B only supports construction jobs
		//    - Phase C will add production and transport job types
		// 5. Create job assignment with jobType
		// 6. Update settler state to 'assigned' or 'working'
		// 7. Notify BuildingManager of worker assignment
		// 8. Emit sc:population:worker-assigned
		// 9. If construction job, BuildingManager speeds up construction
	}

	// Find closest available settler with profession or find tool + settler
	private findWorkerForBuilding(
		buildingInstanceId: string, 
		requiredProfession: ProfessionType | undefined,
		mapName: string,
		buildingPosition: Position
	): { settlerId: SettlerId, needsTool: boolean, toolId?: string, toolPosition?: Position } | null {
		// 1. Get all idle settlers for this map and player
		// 2. If requiredProfession is set:
		//    a. Filter settlers with matching profession
		//    b. Find closest settler to building (use MapManager pathfinding distance or Euclidean)
		//    c. If found, return settler (needsTool: false)
		//    d. If not found:
		//       - Find profession-changing tool for this profession (search LootManager for items on map)
		//       - Get tool itemType and check professionTools map
		//       - Find tool position on map
		//       - Find closest idle settler to tool (any profession, will change)
		//       - Return settler + tool (needsTool: true)
		// 3. If no requiredProfession:
		//    a. Find closest idle settler to building (any profession)
		//    b. Return settler (needsTool: false)
		// 4. Return null if no settler/tool found
		// Note: After finding settler, order movement to building (or tool first if needed)
	}

	// Process settler movement (called during movement tick, similar to NPCManager.processNPCMovement)
	private processSettlerMovement(settlerId: string): void {
		// 1. Get settler from map
		// 2. If settler has a path, move to next position (similar to NPC movement)
		// 3. Update settler position
		// 4. Emit sc:population:settler-position-update for client rendering
		// 5. Check if settler has reached target:
		//    a. If moving to tool: check distance to tool, if within threshold, emit ss:population:pickup-item
		//    b. If moving to building: check distance to building, if within threshold, emit ss:population:arrived-at-building
		// 6. If path complete and no target, set state to Idle
	}

	// Handle settler picking up item (called when server detects settler reached tool)
	private handleSettlerPickupItem(settlerId: string, toolId: string): void {
		// 1. Verify settler exists and is in correct state
		// 2. Get item from LootManager
		// 3. Verify item still exists (not picked up by another settler)
		// 4. Check if item is a profession-changing tool (check professionTools map)
		// 5. Change settler's profession to tool's targetProfession
		// 6. Remove item from map (LootManager.pickItem)
		// 7. Emit sc:population:profession-changed
		// 8. Check for pending assignment for this settler with status 'waiting_for_tool'
		// 9. If pending assignment exists:
		//    a. Update status to 'waiting_for_arrival'
		//    b. Order settler to move to building position (pathfinding)
		// 10. Emit sc:population:stats-updated
	}

	// Handle settler arriving at building (called when server detects settler reached building)
	private handleSettlerArrivedAtBuilding(settlerId: string, buildingInstanceId: string): void {
		// 1. Verify settler exists
		// 2. Check for pending assignment with status 'waiting_for_arrival'
		// 3. Verify building still needs workers
		// 4. Determine job type from building state:
		//    - If building is under construction: jobType = 'construction'
		//    - Phase B only supports construction jobs
		// 5. Complete assignment (create JobAssignment with jobType, update settler state)
		// 6. Notify BuildingManager of worker assignment
		// 7. Remove pending assignment
		// 8. Emit sc:population:worker-assigned
		// 9. Emit sc:population:stats-updated
	}

	// Order settler to move to tool and pick it up
	private orderSettlerToPickupTool(settlerId: SettlerId, toolId: string, toolPosition: Position, buildingInstanceId: string): void {
		// 1. Store pending assignment in pendingAssignments map with status 'waiting_for_tool'
		//    (job type will be determined from building state when assignment completes)
		// 2. Get path from settler position to tool position (use MapManager.findPath)
		// 3. Set settler.path, settler.targetType = 'tool', settler.targetId = toolId
		// 4. Set settler.state = 'moving'
		// 5. Server will detect when settler reaches tool during movement processing
		// 6. handleSettlerPickupItem will update status and order movement to building
	}

	// Order settler to move to building
	private orderSettlerToBuilding(settlerId: SettlerId, buildingInstanceId: string, buildingPosition: Position, mapName: string): void {
		// 1. Update pending assignment status to 'waiting_for_arrival' (or create new one)
		// 2. Get path from settler position to building position (use MapManager.findPath)
		// 3. Set settler.path, settler.targetType = 'building', settler.targetId = buildingInstanceId
		// 4. Set settler.state = 'moving'
		// 5. Server will detect when settler reaches building during movement processing
		// 6. handleSettlerArrivedAtBuilding will complete the assignment
	}

	// Unassign settler from job
	private unassignWorker(data: UnassignWorkerData, client: EventClient): void {
		// 1. Find and cancel job assignment
		// 2. Update settler state to 'idle'
		// 3. Notify BuildingManager of worker unassignment
		// 4. Emit sc:population:worker-unassigned
		// 5. Emit sc:population:stats-updated
	}

	// Get population list for client (full state: settlers + statistics)
	private sendPopulationList(client: EventClient, mapName: string): void {
		// 1. Get all settlers for player and map
		// 2. Calculate statistics (totalCount, byProfession, idleCount, workingCount)
		// 3. Emit sc:population:list with PopulationListData (settlers array + statistics)
	}

	// Load profession tools from content
	public loadProfessionTools(tools: ProfessionToolDefinition[]): void {
		// 1. Clear existing tools
		// 2. Register each tool: itemType -> targetProfession
		// 3. Store in professionTools map
	}

	// Handle house completion - start spawn timer
	public onHouseCompleted(buildingInstanceId: string, buildingId: string): void {
		// 1. Check if building is a house (spawnsSettlers)
		// 2. Start spawn timer based on spawnRate
		// 3. Store timer reference
		// Note: All houses spawn Carrier settlers by default
	}

	// Handle house destruction - stop spawn timer and remove settlers
	public onHouseDestroyed(buildingInstanceId: string): void {
		// 1. Stop spawn timer
		// 2. Find settlers from this house
		// 3. Unassign from jobs if working
		// 4. Remove settlers (or mark for removal)
		// 5. Emit updates
	}

	// Job tick - process active jobs
	private jobTick(): void {
		// 1. Iterate through active jobs
		// 2. Update job progress (construction jobs)
		// 3. Complete jobs when done
		// 4. Emit progress updates
	}
}
```

#### 4. BuildingManager Integration

**Extensions needed:**
- Track worker assignments per building
- Emit events when building completes (for house spawning)
- Accept worker assignments for construction speedup
- Provide building occupancy information

**New Methods:**
```typescript
// In BuildingManager
public assignWorker(buildingInstanceId: string, settlerId: string): boolean {
	// 1. Verify building exists
	// 2. Check if building needs workers:
	//    - If building is under construction: needs construction workers (Phase B)
	//    - Phase C will add production workers for completed buildings
	// 3. Track worker assignment (profession already verified by PopulationManager)
	// 4. If building is under construction, speed up construction progress
	// 5. Return success
}

public getBuildingNeedsWorkers(buildingInstanceId: string): boolean {
	// Check if building is under construction (Phase B: only construction jobs)
	// Phase C: also check if completed building needs production workers
}

public getBuildingPosition(buildingInstanceId: string): Position | undefined {
	// Return building position for distance calculations
}

public getBuildingDefinition(buildingInstanceId: string): BuildingDefinition | undefined {
	// Return building definition for profession requirements
}

public unassignWorker(buildingInstanceId: string, settlerId: string): void {
	// 1. Remove worker assignment
	// 2. Adjust construction speed
}

public getBuildingWorkers(buildingInstanceId: string): string[] {
	// Return list of settler IDs assigned to this building
}

```

#### 5. Content Loader Updates

**New Content Types:**
- Load `professions` from content pack
- Load `professionTools` from content pack (defines which items change profession)
- Register professions and profession tools with PopulationManager
- Buildings with `spawnsSettlers: true` are automatically treated as houses (no separate loading needed)
- Items with `changesProfession` property are automatically registered as profession tools

---

### Backend Adapter Touchpoints (`packages/backend`)

- **Event Bus**  
	No structural changes needed. `Event.Population.*` events will be automatically routed by `EventBusManager`.

- **NetworkManager**  
	Ensure population events use `Receiver.Group` for map-based synchronization. Population list (`sc:population:list`) should be sent on player join.

- **State Persistence (Future)**  
	Document where population state would be persisted (settlers, job assignments, house spawn timers). For Phase B, keep in-memory.

---

### Frontend Adapter Scope (`packages/frontend`)

#### 1. Settler Entity System

**Create `src/game/entities/Settler/` similar to NPC entities:**
- `SettlerView.ts` - Visual representation (sprite, animations)
- `SettlerController.ts` - Movement, job execution, state updates
- `index.ts` - Factory function `createSettler(scene, settlerData)`

**Settler Visual Features:**
- Different sprites/colors per profession
- Work animations (when assigned to construction)
- Idle animations
- Movement animations (walking to building/tool)
- Tool pickup animations
- Arrival animations (when reaching building)

**Settler Behavior:**
- Pathfinding to building/job location
- Pathfinding to tool location (if profession change needed)
- Item pickup when reaching tool
- Profession change visual feedback
- Arrival detection when reaching building (emits arrival event)
- State transitions: Idle → Moving → Arrived → Working

#### 2. Population UI Components

**`src/game/components/PopulationPanel.tsx`:**
- Display total population count (from `sc:population:stats-updated`)
- Show population by profession (builder, carrier, etc.) (from `sc:population:stats-updated`)
- Show idle vs working counts (from `sc:population:stats-updated`)
- List of houses and their settler counts
- Button to manually spawn settler (if house has capacity)
- Subscribe to `sc:population:list` on mount for initial state
- Subscribe to `sc:population:stats-updated` for real-time updates

**`src/game/components/JobAssignmentPanel.tsx`:**
- Show buildings that need workers
- Show current job assignments
- Show pending assignments (waiting for tool pickup)
- Note: Manual settler selection removed - assignment is automatic via "Request Worker" button

**`src/game/components/PopulationHUD.tsx`:**
- Compact overlay showing population stats
- Quick access to population panel
- Notifications for new settlers spawned

#### 3. Building Integration

**Update BuildingInfoPanel:**
- Show current workers assigned
- Show if building needs workers
- "Request Worker" button (triggers automatic assignment)
- Show construction speedup from workers
- Show profession requirement (if building requires specific profession)
- Show status: 
	- "No workers"
	- "Worker moving to building" (settler is pathfinding to building)
	- "Worker picking up tool" (settler is moving to tool first)
	- "Worker assigned" (settler has arrived and is working)

#### 4. Game Scene Updates

**`src/game/scenes/base/GameScene.ts`:**
- Handle `sc:population:settler-spawned` events
- Create settler entities and add to scene
- Handle `sc:population:settler-position-update` events (render settler movement)
- Handle `sc:population:profession-changed` events (update settler visuals)
- Handle `sc:population:worker-moving-to-building` events (update UI status)
- Update settler visuals based on state and profession
- Note: Settler movement is server-authoritative. Client only renders position updates from server.
- Note: Server detects arrival at tools/buildings internally. No client-side detection needed.

#### 5. Population Service

**`src/game/services/PopulationService.ts`:**
- Track population state (similar to BuildingService)
- Subscribe to `sc:population:list` (full state on join - settlers array + statistics)
- Subscribe to `sc:population:stats-updated` (statistics updates)
- Subscribe to `sc:population:settler-spawned` (new settler)
- Subscribe to `sc:population:worker-assigned` (worker assignment)
- Subscribe to `sc:population:worker-unassigned` (worker unassignment)
- Subscribe to `sc:population:profession-changed` (profession changes)
- Provide getters for population data (settlers, statistics)
- Emit UI events for population changes

---

### Content Pack Updates (`content/<pack>`)

#### 1. Professions (`content/<pack>/professions.ts`)

```typescript
export const professions: ProfessionDefinition[] = [
	{
		type: ProfessionType.Carrier,
		name: 'Carrier',
		description: 'Transports goods between buildings. Default profession for all settlers.',
		icon: '📦',
		canBuild: false,
		canCarry: true,
		canWorkBuildings: [] // Carriers can work in any building that doesn't require specific profession
	},
	{
		type: ProfessionType.Builder,
		name: 'Builder',
		description: 'Can construct buildings and work on construction sites',
		icon: '🔨',
		canBuild: true,
		canCarry: true,
		canWorkBuildings: ['woodcutter_hut', 'storehouse'] // Can work in these buildings
	},
	{
		type: ProfessionType.Woodcutter,
		name: 'Woodcutter',
		description: 'Specialized in cutting wood and working in woodcutter huts',
		icon: '🪵',
		canBuild: false,
		canCarry: true,
		canWorkBuildings: ['woodcutter_hut']
	}
]
```

#### 1b. Profession Tools (`content/<pack>/professionTools.ts`)

```typescript
export const professionTools: ProfessionToolDefinition[] = [
	{
		itemType: 'hammer',
		targetProfession: ProfessionType.Builder,
		name: 'Hammer',
		description: 'A tool that turns settlers into builders'
	},
	{
		itemType: 'axe',
		targetProfession: ProfessionType.Woodcutter,
		name: 'Axe',
		description: 'A tool that turns settlers into woodcutters'
	}
]
```

#### 2. Houses Configuration

Houses are buildings with `spawnsSettlers: true`. Add house properties to building definitions:
```typescript
{
	id: 'house',
	name: 'House',
	// ... existing building properties (footprint, costs, constructionTime, etc.)
	spawnsSettlers: true,
	maxOccupants: 4, // Maximum settlers this house can hold
	spawnRate: 60, // 1 settler per 60 seconds (spawnRate in seconds)
	// Note: All houses spawn Carrier settlers by default
}
```

#### 3. Update Building Definitions

**Add worker-related properties:**
```typescript
{
	id: 'woodcutter_hut',
	// ... existing properties
	maxOccupants: 2, // Can have 2 workers
	requiredProfession: ProfessionType.Builder, // Requires builder profession for construction (optional)
	constructionSpeedup: 0.5 // Each worker speeds up construction by 50%
	// Note: Profession changes happen via tool pickup, not building assignment
}
```

#### 4. Profession-Changing Tools (`content/<pack>/items/`)

**Add profession tool items:**
```typescript
// items/hammer.ts
{
	id: 'hammer',
	name: 'Hammer',
	emoji: '🔨',
	description: 'A builder\'s hammer. Pick up to become a builder.',
	category: ItemCategory.Tool,
	stackable: false,
	changesProfession: ProfessionType.Builder // This property changes settler profession on pickup
}

// items/axe.ts
{
	id: 'axe',
	name: 'Axe',
	emoji: '🪓',
	description: 'A woodcutter\'s axe. Pick up to become a woodcutter.',
	category: ItemCategory.Tool,
	stackable: false,
	changesProfession: ProfessionType.Woodcutter
}
```

---

### Event/State Lifecycle

#### 1. House Completion & Settler Spawning
1. **Building Completes**  
	`BuildingManager` emits `sc:buildings.completed`  
	`PopulationManager` listens and checks if building `spawnsSettlers`  
	If yes, starts spawn timer based on `spawnRate`

2. **Spawn Tick**  
	Scheduler triggers `ss:population:spawn-tick`  
	`PopulationManager` checks house capacity  
	If capacity available, spawns settler with default Carrier profession  
	Positions settler near house  
	Emits `sc:population:settler-spawned`

3. **Client Receives Spawn**  
	Frontend creates settler entity  
	Adds to scene with idle state  
	Updates population UI

#### 2. Worker Request & Automatic Assignment
1. **Player Requests Worker**  
	Player clicks "Request Worker" button on building (via BuildingInfoPanel)  
	Frontend emits `cs:population:request-worker` with buildingInstanceId  
	`PopulationManager` handles automatic assignment:
	
2. **Automatic Settler Selection**  
	`PopulationManager.requestWorker()`:
	- Gets building definition and required profession (if any)
	- Calls `findWorkerForBuilding()`:
		- Searches for closest idle settler with required profession
		- If not found and profession required:
			- Searches for profession-changing tool on map
			- Finds closest idle settler to tool
			- Orders settler to pick up tool (changes profession)
			- Stores pending assignment (waiting for tool pickup)
		- If no settler/tool available:
			- Emits `sc:population:worker-request-failed` with reason
	
3. **Tool Pickup & Profession Change (if needed)**  
	If tool pickup needed:
	- Server orders settler to move to tool position (pathfinding, sets settler.path and targetType='tool')
	- Server processes settler movement in movement tick loop
	- When server detects settler reached tool (distance check during movement processing):
		- Server emits internal `ss:population:pickup-item` event
		- `PopulationManager.handleSettlerPickupItem()` changes settler profession
		- Removes tool from map (LootManager)
		- Emits `sc:population:profession-changed` to clients
		- Updates pending assignment status to 'waiting_for_arrival'
		- Orders settler to move to building position
	
4. **Movement to Building**  
	Once settler has correct profession:
	- Server orders settler to move to building position (pathfinding, sets settler.path and targetType='building')
	- Settler state updated to 'moving'
	- Pending assignment status is 'waiting_for_arrival'
	- Server processes settler movement in movement tick loop
	- When server detects settler reached building (distance check during movement processing):
		- Server emits internal `ss:population:arrived-at-building` event
		- `PopulationManager.handleSettlerArrivedAtBuilding()` completes assignment
	
5. **Final Assignment**  
	When settler arrives at building:
	- Determines job type from building state (Phase B: 'construction' if building is under construction)
	- Creates `JobAssignment` with jobType
	- Updates settler state to 'assigned' or 'working'
	- Removes pending assignment
	- Notifies `BuildingManager` of worker (construction speedup applied if construction job)
	- Emits `sc:population:worker-assigned`

6. **Construction Speedup**  
	If construction job, `BuildingManager` increases construction speed  
	Construction progress updates more frequently  
	Worker visual shows "working" animation

7. **Job Completion**  
	Construction completes  
	`BuildingManager` notifies `PopulationManager`  
	Job marked as completed  
	Settler returns to idle state (profession is retained - tools are permanent profession changes)  
	Emits `sc:population:worker-unassigned` and `sc:population:stats-updated`

#### 3. Population Updates
1. **Statistics Updates**  
	`PopulationManager` calculates statistics when population changes (spawn, assignment, unassignment)  
	Emits `sc:population:stats-updated` with PopulationStatsData:
	- Total count
	- By profession counts
	- Idle count
	- Working count

2. **Client UI Updates**  
	Frontend receives `sc:population:stats-updated` events  
	Updates population HUD with new statistics  
	Updates population panel if open

#### 4. Player Join Sync
1. **Player Joins Map**  
	`PopulationManager` receives `Event.Players.CS.Join`  
	Sends full population state via `sc:population:list` with PopulationListData (settlers array + statistics)  
	Client receives list and creates all settler entities
	Client can also request list via `cs:population:request-list`

---

### Files To Touch (Implementation)

#### Game Core (`packages/game/src`)
- `src/types.ts` - Extend `GameContent` with `professions`, `houses?`
- `src/events.ts` - Register `Population` namespace
- `src/Population/` - New directory:
	- `types.ts` - All population-related types (Settler, ProfessionType, JobAssignment, etc.)
	- `events.ts` - Population events
	- `index.ts` - PopulationManager implementation
- `src/Buildings/index.ts` - Add worker assignment methods and position/getter methods
- `src/Buildings/types.ts` - Extend BuildingDefinition with worker properties
- `src/Items/types.ts` - Extend ItemMetadata with `changesProfession` property
- `src/ContentLoader/index.ts` - Load professions and profession tools
- `src/index.ts` - Initialize PopulationManager in GameManager (requires LootManager and ItemsManager)

#### Backend (`packages/backend/src`)
- No new files needed (events auto-routed)

#### Frontend (`packages/frontend/src/game`)
- `entities/Settler/` - New directory:
	- `View.ts` - Settler visual representation
	- `Controller.ts` - Settler behavior and movement
	- `index.ts` - Factory function
- `components/PopulationPanel.tsx` - Population management UI
- `components/PopulationHUD.tsx` - Compact population overlay
- `components/JobAssignmentPanel.tsx` - Job assignment UI
- `components/BuildingInfoPanel.tsx` - Add worker assignment UI
- `components/UIContainer.tsx` - Include population components
- `services/PopulationService.ts` - Population state management
- `scenes/base/GameScene.ts` - Handle settler spawn/update events
- `network/index.ts` - Initialize PopulationService

#### Content (`content/<pack>/`)
- `professions.ts` - Profession definitions (Carrier, Builder, Woodcutter, etc.)
- `professionTools.ts` - Profession tool definitions (hammer, axe, etc.)
- `buildings.ts` - Extend with house properties (spawnsSettlers, spawnRate, maxOccupants) and worker properties (requiredProfession, maxOccupants)
- `items/hammer.ts`, `items/axe.ts` - Profession-changing tool items with `changesProfession` property
- `items/index.ts` - Export profession tool items
- `index.ts` - Export professions and professionTools

---

### Testing & Verification

#### Unit Tests
- Test `PopulationManager` spawn logic (capacity, rate limits)
- Test job assignment validation (profession compatibility, building needs)
- Test population statistics calculation
- Test worker unassignment and job cancellation

#### Integration Tests
- Test house completion triggers spawn timer
- Test settler assignment speeds up construction
- Test population list sync on player join (`sc:population:list`)
- Test multiple houses spawning settlers

#### Manual Testing
1. **Local Simulation - Basic Assignment:**
	- Place house building
	- Wait for completion
	- Verify settler spawns after spawn interval (as Carrier)
	- Place construction site (building that needs workers)
	- Click "Request Worker" on building
	- Verify closest Carrier settler starts moving to building
	- Verify settler arrives at building position
	- Verify settler is assigned to building (only after arrival)
	- Verify construction speeds up
	- Verify settler shows working animation

2. **Local Simulation - Profession Change:**
	- Place building requiring Builder profession
	- Drop hammer tool on map (or place in content pack)
	- Click "Request Worker" on building
	- Verify closest Carrier settler moves to hammer
	- Verify settler picks up hammer
	- Verify settler profession changes to Builder
	- Verify settler is assigned to building
	- Verify construction speeds up

3. **Local Simulation - No Available Worker:**
	- Place building requiring Builder profession
	- Ensure no Builder settlers exist
	- Ensure no hammer tool on map
	- Click "Request Worker"
	- Verify "Worker Request Failed" message
	- Verify UI shows why (no settler/tool available)

4. **Multiplayer:**
	- Two players place houses
	- Verify both see each other's settlers
	- Verify population counts sync
	- Request workers for buildings
	- Verify assignments sync across clients
	- Verify profession changes sync across clients

5. **UI Testing:**
	- Open population panel
	- Verify statistics display correctly
	- Open building info panel
	- Verify "Request Worker" button appears
	- Click "Request Worker"
	- Verify UI updates show worker assignment
	- Verify profession changes are reflected in UI

---

### Future Hooks (Phase C+)

- **Transport Jobs:** Settlers assigned to transport jobs will move goods between buildings (Phase C)
- **Production Jobs:** Settlers assigned to production buildings will process resources (Phase C)
- **Profession Specialization:** Settlers can gain experience and improve efficiency in their profession (future)
- **Tool Durability:** Tools could have limited uses before breaking (future)
- **Tool Crafting:** Players could craft profession tools from resources (future)
- **Multiple Tools:** Settlers could carry multiple tools and switch professions (future)
- **Morale System:** Population morale affects spawn rates and work efficiency (future)
- **Housing Capacity:** Overcrowding affects settler happiness (future)
- **Settler Pathfinding:** Use MapManager pathfinding for settler movement to jobs (Phase C)

---

### Design Decisions

1. **Settlers as Separate Entities:**  
	Settlers are separate from buildings but spawned by houses. This allows them to move, be assigned to different buildings, and have independent state.

2. **Automatic Worker Assignment:**  
	Players don't manually select settlers. Instead, they request workers for buildings, and the game automatically finds the closest available settler with the correct profession, or finds a profession-changing tool and assigns a settler to pick it up first. This provides a smooth RTS-like experience.

3. **Profession-Changing Tools:**  
	Settlers change profession by picking up tools (hammer → Builder, axe → Woodcutter, etc.). Tools are placed on the map and settlers automatically pathfind to them when needed. This creates a resource management element (tool availability) and visual feedback (settlers moving to tools).

4. **Construction Speedup:**  
	Workers assigned to construction sites speed up construction. This provides immediate gameplay value and makes worker assignment meaningful.

5. **Periodic Spawning:**  
	Houses spawn settlers over time rather than instantly. This creates a resource management element (housing capacity) and prevents instant population growth.

6. **Job Assignment System:**  
	Jobs are tracked separately from settlers, allowing for job queuing and priority management in future phases.

7. **Reuse NPC Infrastructure:**  
	Settlers reuse NPC movement and visual systems where possible, but have distinct behavior for job assignment, building interaction, and item pickup.

8. **Default Carrier Profession:**  
	All settlers spawn as Carriers by default. This simplifies the spawning system and ensures all settlers can perform basic tasks. Profession changes happen via tool pickup, creating a clear progression path and resource management element (tool availability).

9. **Settler Item Pickup:**  
	Settlers can pick up items from the map (similar to players). When picking up profession-changing tools, settlers change profession permanently. This provides visual feedback and makes profession changes meaningful gameplay moments.

---

### Performance Considerations

- **Spawn Timers:** Use Scheduler for spawn ticks rather than individual timers per house to reduce overhead
- **Population Updates:** Batch population statistics updates (e.g., every 5 seconds) rather than on every change
- **Settler Entities:** Limit maximum settlers per player to prevent performance issues (e.g., 100 settlers per player)
- **Job Processing:** Process jobs in batches during job tick rather than individually
- **Pathfinding:** Cache pathfinding results for common routes (settler to building, settler to tool)
- **Settler Selection:** Use spatial indexing (grid-based) for efficient closest settler searches
- **Tool Search:** Limit tool search radius to prevent expensive full-map scans

---

### Edge Cases & Error Handling

1. **House Destroyed During Spawn:**  
	Cancel spawn timer and remove house from tracking

2. **Settler Assignment to Destroyed Building:**  
	Unassign settler and return to idle state

3. **Player Disconnect:**  
	Keep settlers in game but mark as unassigned (or remove after timeout)

4. **Capacity Exceeded:**  
	Prevent spawning if house is at capacity
	Prevent assignment if building is at capacity

5. **Invalid Assignment:**  
	Validate building needs workers before assignment
	If building requires specific profession:
		- Search for settler with profession
		- Search for profession-changing tool
		- If neither found, emit WorkerRequestFailed with reason
	- If tool found but no settler available, emit WorkerRequestFailed
	- If settler found but tool needed and no tool available, emit WorkerRequestFailed

6. **Tool Pickup Failures:**  
	If settler cannot reach tool (blocked path, tool picked up by another settler), cancel pending assignment and emit WorkerRequestFailed

7. **Building Arrival Failures:**  
	If settler cannot reach building (blocked path, building destroyed), cancel pending assignment and emit WorkerRequestFailed

8. **Settler Pathfinding:**  
	Use MapManager pathfinding for settler movement to tools and buildings. Handle pathfinding failures gracefully (no path found, target moved, etc.)

9. **Arrival Detection:**  
	Server detects when settler reaches tool/building during movement processing (distance check within threshold, e.g., 32 pixels). No client-side detection needed. Server is authoritative about settler positions and state changes.

---

This plan ensures Phase B builds on Phase A's foundation, integrates with existing systems (NPCs, Buildings, Scheduler), and provides a complete population management system that syncs across multiplayer sessions. The system is designed to be extensible for Phase C (goods flow and transport jobs) while remaining playable and testable in Phase B.

