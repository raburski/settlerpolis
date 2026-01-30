import type { Position } from '../types'
import type { SettlerId, ProfessionType } from '../Population/types'

export enum JobType {
	Construction = 'construction',  // Building under construction
	Production = 'production',      // Completed building with worker slots
	Transport = 'transport',        // Carrier transport job
	Harvest = 'harvest'             // Worker harvest job
}

export enum JobPhase {
	Pending = 'pending',
	MovingToTool = 'moving_to_tool',
	MovingToSource = 'moving_to_source',
	MovingToResource = 'moving_to_resource',
	MovingToTarget = 'moving_to_target',
	Harvesting = 'harvesting',
	Working = 'working',
	Completed = 'completed',
	Cancelled = 'cancelled'
}

export enum JobStatus {
	Pending = 'pending',
	Active = 'active',
	Completed = 'completed',
	Cancelled = 'cancelled'
}

export enum JobReservationType {
	Loot = 'loot',
	Storage = 'storage',
	Node = 'node',
	Tool = 'tool'
}

export enum RoleType {
	Construction = 'construction',
	Production = 'production'
}

export interface JobReservation {
	type: JobReservationType
	id: string
	targetId?: string
	ownerId: string
	metadata?: Record<string, unknown>
}

export interface RoleAssignment {
	roleId: string
	settlerId: SettlerId
	buildingInstanceId: string
	roleType: RoleType
	requiredProfession?: ProfessionType
	assignedAt: number
}

export interface JobAssignment {
	jobId: string
	settlerId: SettlerId
	buildingInstanceId: string
	jobType: JobType // Construction for buildings under construction, production for completed buildings with worker slots, transport for carrier jobs
	priority: number
	assignedAt: number
	status: JobStatus
	phase?: JobPhase
	phaseStartedAtMs?: number
	lastProgressAtMs?: number
	reservations?: JobReservation[]
	// Transport-specific fields (only populated when jobType === JobType.Transport)
	sourceItemId?: string        // Item ID on the ground (from LootManager) - before pickup (ground-to-building transport)
	sourceBuildingInstanceId?: string // Source building instance ID (building-to-building transport)
	carriedItemId?: string       // Item ID being carried - after pickup (item removed from LootManager or building storage)
	sourcePosition?: Position    // Position of item on the ground (for ground items)
	itemType?: string            // Item type to transport (logs, stone, etc.)
	quantity?: number            // Quantity to transport (always 1 for ground items, variable for building storage)
	reservationId?: string       // Storage reservation ID (for building-to-building transport)
	// Harvest-specific fields
	resourceNodeId?: string      // Resource node instance ID
	harvestStartedAtMs?: number
	harvestDurationMs?: number
	// Worker assignment fields (for construction/production jobs that need tool pickup first)
	requiredProfession?: ProfessionType // Required profession for this job (if settler needs tool)
	toolItemId?: string
}
