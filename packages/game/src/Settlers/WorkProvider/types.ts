import type { Position } from '../../types'
import type { ProfessionType, SettlerId } from '../../Population/types'
import type { ItemType } from '../../Items/types'
import type { ProductionRecipe } from '../../Buildings/types'

export type WorkProviderId = string
export type WorkProviderType = 'building' | 'logistics' | 'construction'

export enum WorkStepType {
	AcquireTool = 'acquire_tool',
	Construct = 'construct',
	Harvest = 'harvest',
	Produce = 'produce',
	Plant = 'plant',
	Transport = 'transport',
	Wait = 'wait'
}

export enum WorkWaitReason {
	BuildingNotReady = 'building_not_ready',
	NotConstructing = 'not_constructing',
	NoNodeDefinition = 'no_node_definition',
	NoStorage = 'no_storage',
	NoNodes = 'no_nodes',
	OutputFull = 'output_full',
	MissingInputs = 'missing_inputs',
	CarryingItem = 'carrying_item',
	NoPlots = 'no_plots',
	WrongProfession = 'wrong_profession',
	ProviderMissing = 'provider_missing',
	NoWork = 'no_work',
	NoRequests = 'no_requests',
	NoViableRequest = 'no_viable_request',
	Paused = 'paused'
}

export enum WorkActionType {
	Move = 'move',
	Wait = 'wait',
	Construct = 'construct',
	PickupTool = 'pickup_tool',
	PickupLoot = 'pickup_loot',
	WithdrawStorage = 'withdraw_storage',
	DeliverStorage = 'deliver_storage',
	DeliverConstruction = 'deliver_construction',
	HarvestNode = 'harvest_node',
	Produce = 'produce',
	Plant = 'plant',
	ChangeProfession = 'change_profession',
	Consume = 'consume',
	Sleep = 'sleep'
}

export enum TransportSourceType {
	Ground = 'ground',
	Storage = 'storage'
}

export enum TransportTargetType {
	Storage = 'storage',
	Construction = 'construction'
}

export interface WorkAssignment {
	assignmentId: string
	settlerId: SettlerId
	providerId: WorkProviderId
	providerType: WorkProviderType
	buildingInstanceId?: string
	requiredProfession?: ProfessionType
	assignedAt: number
	status: 'assigned' | 'waiting' | 'active' | 'paused'
}

export type WorkStep =
	| { type: WorkStepType.AcquireTool, profession: ProfessionType, toolItemId?: string, toolPosition?: Position }
	| { type: WorkStepType.Construct, buildingInstanceId: string, durationMs: number }
	| { type: WorkStepType.Harvest, buildingInstanceId: string, resourceNodeId: string, outputItemType: ItemType, quantity: number, durationMs: number }
	| { type: WorkStepType.Produce, buildingInstanceId: string, recipe: ProductionRecipe, durationMs: number }
	| { type: WorkStepType.Plant, buildingInstanceId: string, nodeType: string, position: Position, plantTimeMs: number, growTimeMs: number, spoilTimeMs?: number, despawnTimeMs?: number }
	| { type: WorkStepType.Transport, source: TransportSource, target: TransportTarget, itemType: ItemType, quantity: number }
	| { type: WorkStepType.Wait, reason: WorkWaitReason, retryAtMs?: number }

export type TransportSource =
	| { type: TransportSourceType.Ground, itemId: string, position: Position }
	| { type: TransportSourceType.Storage, buildingInstanceId: string, reservationId?: string }

export type TransportTarget =
	| { type: TransportTargetType.Storage, buildingInstanceId: string }
	| { type: TransportTargetType.Construction, buildingInstanceId: string }

export type WorkAction =
	| { type: WorkActionType.Move, position: Position, targetType?: string, targetId?: string, setState?: import('../../Population/types').SettlerState }
	| { type: WorkActionType.Wait, durationMs: number, setState?: import('../../Population/types').SettlerState }
	| { type: WorkActionType.Construct, buildingInstanceId: string, durationMs: number, setState?: import('../../Population/types').SettlerState }
	| { type: WorkActionType.PickupTool, itemId: string, setState?: import('../../Population/types').SettlerState }
	| { type: WorkActionType.PickupLoot, itemId: string, setState?: import('../../Population/types').SettlerState }
	| { type: WorkActionType.WithdrawStorage, buildingInstanceId: string, itemType: ItemType, quantity: number, reservationId?: string, setState?: import('../../Population/types').SettlerState }
	| { type: WorkActionType.DeliverStorage, buildingInstanceId: string, itemType: ItemType, quantity: number, reservationId?: string, setState?: import('../../Population/types').SettlerState }
	| { type: WorkActionType.DeliverConstruction, buildingInstanceId: string, itemType: ItemType, quantity: number, setState?: import('../../Population/types').SettlerState }
	| { type: WorkActionType.HarvestNode, nodeId: string, quantity: number, setState?: import('../../Population/types').SettlerState }
	| { type: WorkActionType.Produce, buildingInstanceId: string, recipe: ProductionRecipe, setState?: import('../../Population/types').SettlerState }
	| { type: WorkActionType.Plant, buildingInstanceId: string, nodeType: string, position: Position, growTimeMs: number, spoilTimeMs?: number, despawnTimeMs?: number, setState?: import('../../Population/types').SettlerState }
	| { type: WorkActionType.ChangeProfession, profession: ProfessionType, setState?: import('../../Population/types').SettlerState }
	| { type: WorkActionType.Consume, itemType?: ItemType, quantity?: number, durationMs: number, setState?: import('../../Population/types').SettlerState }
	| { type: WorkActionType.Sleep, durationMs: number, setState?: import('../../Population/types').SettlerState }

export interface WorkProvider {
	id: WorkProviderId
	type: WorkProviderType
	assign(settlerId: SettlerId): void
	unassign(settlerId: SettlerId): void
	pause(settlerId: SettlerId, reason?: string): void
	resume(settlerId: SettlerId): void
	requestNextStep(settlerId: SettlerId): WorkStep | null
}

export type LogisticsRequest =
	| { id: string, type: 'input', buildingInstanceId: string, itemType: ItemType, quantity: number, priority: number, createdAtMs: number }
	| { id: string, type: 'output', buildingInstanceId: string, itemType: ItemType, quantity: number, priority: number, createdAtMs: number }
	| { id: string, type: 'construction', buildingInstanceId: string, itemType: ItemType, quantity: number, priority: number, createdAtMs: number }
