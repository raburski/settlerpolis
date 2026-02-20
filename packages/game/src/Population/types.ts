import { Position } from '../types'
import type { ItemType } from '../Items/types'
import type { BuildingId } from '../Buildings/types'
import type { MoveTargetType } from '../Movement/types'
import type { BuildingInstanceId, MapId, PlayerId, SettlerId } from '../ids'

export type { SettlerId } from '../ids'

export enum ProfessionType {
	Carrier = 'carrier', // Default profession for all settlers
	Builder = 'builder',
	Prospector = 'prospector',
	Woodcutter = 'woodcutter',
	Miner = 'miner',
	Metallurgist = 'metallurgist',
	Farmer = 'farmer',
	Fisher = 'fisher',
	Miller = 'miller',
	Baker = 'baker',
	Vendor = 'vendor',
	Hunter = 'hunter'
	// Note: Settlers can change profession when assigned to specific buildings
}

export enum SettlerState {
	Idle = 'idle',                    // No active task, available for work
	Spawned = 'spawned',              // Just spawned from house (optional, could merge with Idle)
	Moving = 'moving',                // Generic moving state (client-side smoothing)
	Assigned = 'assigned',            // Assigned to a provider/building but not actively working
	MovingToTool = 'moving_to_tool',           // Moving to pick up a profession tool
	MovingToBuilding = 'moving_to_building',   // Moving to assigned building
	Working = 'working',              // Actively working at a building
	WaitingForWork = 'waiting_for_work', // At building but no work available (optional)
	Packing = 'packing',              // Packing up belongings before changing home
	Unpacking = 'unpacking',          // Unpacking belongings after moving home
	MovingToItem = 'moving_to_item',        // Moving to pick up item from ground
	CarryingItem = 'carrying_item',         // Carrying item and moving to construction site for delivery
	MovingToResource = 'moving_to_resource', // Moving to resource node for harvesting
	MovingHome = 'moving_home',          // Moving to current/new home
	Harvesting = 'harvesting',             // Harvesting at a resource node
	Prospecting = 'prospecting',           // Investigating a resource deposit
	AssignmentFailed = 'assignment_failed',    // Assignment failed, needs cleanup
}

export enum WorkerRequestFailureReason {
	NoAvailableWorker = 'no_available_worker',
	NoBuilderAvailable = 'no_builder_available',
	NoSuitableProfession = 'no_suitable_profession',
	NoAvailableTool = 'no_available_tool',
	BuildingNotFound = 'building_not_found',
	BuildingDefinitionNotFound = 'building_definition_not_found',
	BuildingDoesNotNeedWorkers = 'building_does_not_need_workers',
	BuildingNotUnderConstruction = 'building_not_under_construction',
	BuildingCompleted = 'building_completed'
}


export interface ProfessionDefinition {
	type: ProfessionType
	name: string
	description: string
	icon?: string
	canBuild: boolean
	canCarry: boolean
	canWorkBuildings: BuildingId[] // Building IDs this profession can work in
}

// Note: Houses are just buildings with spawnsSettlers: true
// No separate HouseDefinition needed - use BuildingDefinition with house properties

export interface ProfessionToolDefinition {
	itemType: ItemType // Item type that changes profession (e.g., 'hammer', 'axe')
	targetProfession: ProfessionType // Profession this tool grants
	name: string
	description: string
}

export interface SettlerStateContext {
	assignmentId?: string          // Current work assignment ID
	providerId?: string            // Current provider ID (building or logistics)
	targetId?: string              // ID of tool, building, or item being moved to
	targetPosition?: Position      // Target position for movement
	targetType?: MoveTargetType     // Optional target type for debugging/recovery
	equippedItemType?: ItemType     // Item type equipped (e.g., profession tool)
	equippedQuantity?: number      // Quantity equipped (usually 1)
	carryingItemType?: ItemType    // Item type being carried (used for visual indicators)
	carryingQuantity?: number      // Quantity being carried
	waitReason?: string            // WorkWaitReason (set by WorkProvider when waiting)
	lastStepType?: string          // WorkStepType (debug)
	lastStepReason?: string        // WorkWaitReason or failure reason (debug)
	errorReason?: string           // Reason for failure state
	lastIdleWanderTime?: number    // Timestamp of last idle wander movement (for cooldown)
	// Note: job-related data is now expressed via assignments and provider steps
}

export interface Settler {
	id: SettlerId
	playerId: PlayerId
	mapId: MapId
	position: Position
	profession: ProfessionType
	state: SettlerState
	stateContext: SettlerStateContext  // Context for current state
	needs?: {
		hunger: number
		fatigue: number
	}
	health: number
	houseId?: BuildingInstanceId // House that spawned this settler
	buildingId?: BuildingInstanceId  // Can be derived from stateContext
	speed: number
	createdAt: number
}

export type SettlerAnimationKey =
	| 'idle'
	| 'walk'
	| 'run'
	| 'work'
	| 'carry'
	| 'wait'
	| 'sleep'
	| 'consume'
	| 'construct'
	| 'harvest'
	| 'fish'
	| 'hunt'
	| 'plant'
	| 'produce'
	| 'build_road'

export interface SettlerRenderDefinition {
	profession: ProfessionType
	modelSrc: string
	animationSrc?: string
	lighting?: {
		emissiveStrength?: number
		metallic?: number
		roughness?: number
	}
	transform?: {
		rotation?: { x: number; y: number; z: number }
		scale?: { x: number; y: number; z: number }
		elevation?: number
		offset?: { x: number; y: number; z: number }
	}
	animations?: Partial<Record<SettlerAnimationKey, string>>
	attachments?: {
		carrySocket?: string
		toolSocket?: string
	}
}


export interface SpawnSettlerData {
	houseBuildingInstanceId: BuildingInstanceId
	// Note: All settlers spawn as Carrier by default (no profession parameter needed)
}

export interface RequestWorkerData {
	buildingInstanceId: BuildingInstanceId
	// Note: No settlerId needed - game automatically finds and assigns closest available settler
	// Note: Phase B only supports construction jobs. Job type is determined by building state (under construction = construction job)
}

export interface AssignWorkerData {
	settlerId: SettlerId
	buildingInstanceId: BuildingInstanceId
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
	byProfessionActive: Record<ProfessionType, number>
	idleCount: number
	workingCount: number
	housingCapacity: number
}

export interface PopulationStatsData {
	totalCount: number
	byProfession: Record<ProfessionType, number>
	byProfessionActive: Record<ProfessionType, number>
	idleCount: number
	workingCount: number
	housingCapacity: number
}

export interface SettlerPatch {
	state?: SettlerState
	profession?: ProfessionType
	health?: number
	needs?: {
		hunger: number
		fatigue: number
	}
	stateContext?: Partial<SettlerStateContext>
	buildingId?: BuildingInstanceId
	houseId?: BuildingInstanceId
	position?: Position
}

export interface SettlerPatchedData {
	settlerId: SettlerId
	patch: SettlerPatch
}

export interface ProfessionTool {
	itemType: ItemType // Item type that changes profession
	targetProfession: ProfessionType // Profession this tool grants
}

// Note: SettlerPickupItemData and SettlerArrivedAtBuildingData are no longer needed
// Server detects these conditions internally during movement processing
// No client-to-server events needed for these state changes
