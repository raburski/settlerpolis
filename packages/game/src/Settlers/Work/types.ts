import type { Position } from '../../types'
import type { ProfessionType } from '../../Population/types'
import type { ItemType } from '../../Items/types'
import type { ProductionRecipe } from '../../Buildings/types'
import type { RoadType } from '../../Roads'
import type { MoveTargetType } from '../../Movement/types'
import type {
	BuildingInstanceId,
	LogisticsRequestId,
	LootItemId,
	NPCId,
	ResourceNodeId,
	RoadJobId,
	SettlerId,
	StorageReservationId,
	WorkAssignmentId
} from '../../ids'

export type WorkProviderId = string
export enum WorkProviderType {
	Building = 'building',
	Logistics = 'logistics',
	Construction = 'construction',
	Road = 'road',
	Prospecting = 'prospecting'
}

export enum WorkAssignmentStatus {
	Assigned = 'assigned',
	Waiting = 'waiting',
	Active = 'active',
	Paused = 'paused'
}

export enum WorkStepType {
	AcquireTool = 'acquire_tool',
	Construct = 'construct',
	Harvest = 'harvest',
	Fish = 'fish',
	Hunt = 'hunt',
	Produce = 'produce',
	Plant = 'plant',
	BuildRoad = 'build_road',
	Transport = 'transport',
	MarketRun = 'market_run',
	Wait = 'wait',
	Prospect = 'prospect',
	StepAway = 'step_away'
}

export enum WorkWaitReason {
	BuildingNotReady = 'building_not_ready',
	NotConstructing = 'not_constructing',
	NoNodeDefinition = 'no_node_definition',
	NoStorage = 'no_storage',
	NoNodes = 'no_nodes',
	OutputFull = 'output_full',
	MissingInputs = 'missing_inputs',
	NoRoadAccess = 'no_road_access',
	CarryingItem = 'carrying_item',
	NoPlots = 'no_plots',
	WrongProfession = 'wrong_profession',
	ProviderMissing = 'provider_missing',
	NoWork = 'no_work',
	NoRequests = 'no_requests',
	NoViableRequest = 'no_viable_request',
	Paused = 'paused',
	NeedsCritical = 'needs_critical',
	MovementFailed = 'movement_failed',
	MovementCancelled = 'movement_cancelled'
}

export enum TransportSourceType {
	Ground = 'ground',
	Storage = 'storage'
}

export enum TransportTargetType {
	Storage = 'storage',
	Construction = 'construction'
}

export enum LogisticsRequestType {
	Input = 'input',
	Output = 'output',
	Construction = 'construction'
}

export interface WorkAssignment {
	assignmentId: WorkAssignmentId
	settlerId: SettlerId
	providerId: WorkProviderId
	providerType: WorkProviderType
	buildingInstanceId?: BuildingInstanceId
	requiredProfession?: ProfessionType
	assignedAt: number
	status: WorkAssignmentStatus
}

export interface WorkPausedContext {
	assignmentId?: WorkAssignmentId
	providerId?: WorkProviderId
	providerType?: WorkProviderType
}

export type WorkDispatchStepResult =
	| { status: 'no_assignment' }
	| { status: 'provider_missing', assignment: WorkAssignment }
	| { status: 'step', assignment: WorkAssignment, step: WorkStep | null }

export type WorkStep =
	| { type: WorkStepType.AcquireTool, profession: ProfessionType, toolItemId?: LootItemId, toolPosition?: Position }
	| { type: WorkStepType.Construct, buildingInstanceId: BuildingInstanceId, durationMs: number }
	| { type: WorkStepType.Harvest, buildingInstanceId: BuildingInstanceId, resourceNodeId: ResourceNodeId, outputItemType: ItemType, quantity: number, durationMs: number }
	| { type: WorkStepType.Fish, buildingInstanceId: BuildingInstanceId, resourceNodeId: ResourceNodeId, targetPosition: Position, outputItemType: ItemType, quantity: number, durationMs: number }
	| { type: WorkStepType.Hunt, buildingInstanceId: BuildingInstanceId, npcId: NPCId, outputItemType: ItemType, quantity: number, durationMs: number, wildlifeType?: string }
	| { type: WorkStepType.Produce, buildingInstanceId: BuildingInstanceId, recipe: ProductionRecipe, durationMs: number }
	| { type: WorkStepType.Plant, buildingInstanceId: BuildingInstanceId, nodeType: string, position: Position, plantTimeMs: number, growTimeMs: number, spoilTimeMs?: number, despawnTimeMs?: number }
	| { type: WorkStepType.BuildRoad, jobId: RoadJobId, position: Position, roadType: RoadType, durationMs: number }
	| { type: WorkStepType.Transport, source: TransportSource, target: TransportTarget, itemType: ItemType, quantity: number }
	| { type: WorkStepType.MarketRun, buildingInstanceId: BuildingInstanceId }
	| { type: WorkStepType.Prospect, resourceNodeId: ResourceNodeId, durationMs: number }
	| { type: WorkStepType.Wait, reason: WorkWaitReason, retryAtMs?: number }
	| { type: WorkStepType.StepAway, targetPosition: Position, targetType?: MoveTargetType, targetId?: string }

export type TransportSource =
	| { type: TransportSourceType.Ground, itemId: LootItemId, position: Position }
	| { type: TransportSourceType.Storage, buildingInstanceId: BuildingInstanceId, reservationId?: StorageReservationId }

export type TransportTarget =
	| { type: TransportTargetType.Storage, buildingInstanceId: BuildingInstanceId }
	| { type: TransportTargetType.Construction, buildingInstanceId: BuildingInstanceId }

export interface WorkProvider {
	id: WorkProviderId
	type: WorkProviderType
	assign(settlerId: SettlerId): void
	unassign(settlerId: SettlerId): void
	pause(settlerId: SettlerId, reason?: string): void
	resume(settlerId: SettlerId): void
	requestNextStep(settlerId: SettlerId): WorkStep | null
	requestUnassignStep?(settlerId: SettlerId): WorkStep | null
}

export type LogisticsRequest =
	| { id: LogisticsRequestId, type: LogisticsRequestType.Input, buildingInstanceId: BuildingInstanceId, itemType: ItemType, quantity: number, priority: number, createdAtMs: number }
	| { id: LogisticsRequestId, type: LogisticsRequestType.Output, buildingInstanceId: BuildingInstanceId, itemType: ItemType, quantity: number, priority: number, createdAtMs: number }
	| { id: LogisticsRequestId, type: LogisticsRequestType.Construction, buildingInstanceId: BuildingInstanceId, itemType: ItemType, quantity: number, priority: number, createdAtMs: number }
