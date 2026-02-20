import type { Position } from '../../types'
import type { ProfessionType, SettlerState } from '../../Population/types'
import type { ItemType } from '../../Items/types'
import type { ProductionRecipe } from '../../Buildings/types'
import type { MoveTargetType } from '../../Movement/types'
import type { ReservationRef } from '../../Reservation'
import type {
	BuildingInstanceId,
	LootItemId,
	NPCId,
	ResourceNodeId,
	RoadJobId,
	ReservationId,
	StorageReservationId
} from '../../ids'

export enum SettlerActionType {
	Move = 'move',
	FollowPath = 'follow_path',
	Wait = 'wait',
	Construct = 'construct',
	BuildRoad = 'build_road',
	PickupTool = 'pickup_tool',
	PickupLoot = 'pickup_loot',
	WithdrawStorage = 'withdraw_storage',
	DeliverStorage = 'deliver_storage',
	DeliverConstruction = 'deliver_construction',
	HarvestNode = 'harvest_node',
	HuntNpc = 'hunt_npc',
	Produce = 'produce',
	Plant = 'plant',
	ChangeProfession = 'change_profession',
	ChangeHome = 'change_home',
	Consume = 'consume',
	Sleep = 'sleep',
	ProspectNode = 'prospect_node'
}

export type SettlerAction = (
	| { type: SettlerActionType.Move, position: Position, targetType?: MoveTargetType, targetId?: string, speedMultiplier?: number, setState?: SettlerState }
	| { type: SettlerActionType.FollowPath, path: Position[], targetType?: MoveTargetType, targetId?: string, speedMultiplier?: number, setState?: SettlerState }
	| { type: SettlerActionType.Wait, durationMs: number, setState?: SettlerState }
	| { type: SettlerActionType.Construct, buildingInstanceId: BuildingInstanceId, durationMs: number, setState?: SettlerState }
	| { type: SettlerActionType.BuildRoad, jobId: RoadJobId, durationMs: number, setState?: SettlerState }
	| { type: SettlerActionType.PickupTool, itemId: LootItemId, setState?: SettlerState }
	| { type: SettlerActionType.PickupLoot, itemId: LootItemId, setState?: SettlerState }
	| { type: SettlerActionType.WithdrawStorage, buildingInstanceId: BuildingInstanceId, itemType: ItemType, quantity: number, reservationId?: StorageReservationId, setState?: SettlerState }
	| { type: SettlerActionType.DeliverStorage, buildingInstanceId: BuildingInstanceId, itemType: ItemType, quantity: number, reservationId?: StorageReservationId, setState?: SettlerState }
	| { type: SettlerActionType.DeliverConstruction, buildingInstanceId: BuildingInstanceId, itemType: ItemType, quantity: number, setState?: SettlerState }
	| { type: SettlerActionType.HarvestNode, nodeId: ResourceNodeId, quantity: number, setState?: SettlerState }
	| { type: SettlerActionType.HuntNpc, npcId: NPCId, outputItemType: ItemType, quantity: number, wildlifeType?: string, setState?: SettlerState }
	| { type: SettlerActionType.Produce, buildingInstanceId: BuildingInstanceId, recipe: ProductionRecipe, setState?: SettlerState }
	| { type: SettlerActionType.Plant, buildingInstanceId: BuildingInstanceId, nodeType: string, position: Position, growTimeMs: number, spoilTimeMs?: number, despawnTimeMs?: number, setState?: SettlerState }
	| { type: SettlerActionType.ChangeProfession, profession: ProfessionType, setState?: SettlerState }
	| { type: SettlerActionType.ChangeHome, reservationId: ReservationId, houseId: BuildingInstanceId, setState?: SettlerState }
	| { type: SettlerActionType.Consume, itemType?: ItemType, quantity?: number, durationMs: number, setState?: SettlerState }
	| { type: SettlerActionType.Sleep, durationMs: number, setState?: SettlerState }
	| { type: SettlerActionType.ProspectNode, nodeId: ResourceNodeId, setState?: SettlerState }
) & {
	reservationRefs?: ReservationRef[]
}
