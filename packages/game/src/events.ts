import { Receiver } from './Receiver'
import { PlayersEvents } from './Players/events'
import { ChatEvents } from './Chat/events'
import { SystemEvents } from './System/events'
import { InventoryEvents } from './Inventory/events'
import { NPCEvents } from './NPC/events'
import { ItemsEvents } from './Items/events'
import { LootEvents } from './Loot/events'
import { DialogueEvents } from './Dialogue/events'
import { QuestEvents } from "./Quest/events"
import { MapObjectsEvents } from "./MapObjects/events"
import { FlagsEvents } from "./Flags/events"
import { TriggerEvents } from './Triggers/events'
import { AffinityEvents } from "./Affinity/events"
import { FXEvents } from "./FX/events"
import { CutsceneEvents } from "./Cutscene/events"
import { MapEvents } from "./Map/events"
import { TimeEvents } from './Time/events'
import { SchedulerEvents } from './Scheduler/events'
import { SimulationEvents } from './Simulation/events'
import { BuildingsEvents } from './Buildings/events'
import { PopulationEvents } from './Population/events'
import { MovementEvents } from './Movement/events'
import { StorageEvents } from './Storage/events'
import { WorkProviderEvents } from './Settlers/WorkProvider/events'
import { NeedsEvents } from './Needs/events'
import { RoadEvents } from './Roads/events'
import { CityCharterEvents } from './CityCharter/events'
import { TradeEvents } from './Trade/events'
import type { PlayerJoinData, PlayerTransitionData, PlayerMoveData, EquipItemData, UnequipItemData, PlayerPlaceData } from './Players/types'
import type { ChatMessageData, ChatSystemMessageData } from './Chat/types'
import type { InventoryData, DropItemData, PickUpItemData, ConsumeItemData, MoveItemData, AddItemData, RemoveByTypePayload } from './Inventory/types'
import type { ItemTypeRequest, ItemTypeResponse } from './Items/types'
import type { LootSpawnPayload, LootSpawnEventPayload, LootDespawnEventPayload, LootUpdateEventPayload } from './Loot/types'
import type { DialogueTriggerData, DialogueContinueData, DialogueChoiceData } from './Dialogue/types'
import type { QuestStartRequest, QuestUpdateResponse, QuestCompleteResponse, QuestListResponse } from './Quest/types'
import type { PlaceObjectData, RemoveObjectData, SpawnObjectData, DespawnObjectData } from './MapObjects/types'
import type { SetFlagData, UnsetFlagData } from './Flags/types'
import type { NPC, NPCInteractData, NPCMessageData, NPCGoData } from './NPC/types'
import type { AffinityUpdateEventData, AffinityUpdatedEventData, AffinityListEventData, AffinitySCUpdateEventData } from './Affinity/types'
import type { FXPlayEventData } from './FX/types'
import type { CutsceneTriggerEventData } from './Cutscene/types'
import type { MapLoadData, MapLoadResponseData, MapTransitionData, MapTransitionResponseData } from './Map/types'
import type { TimeUpdateEventData, TimeSpeedUpdateEventData, TimePauseEventData, TimeSyncEventData } from './Time/types'
import type { PlaceBuildingData, CancelBuildingData, SetProductionPausedData, SetProductionPlanData, SetGlobalProductionPlanData, SetWorkAreaData, SetStorageRequestsData, BuildingPlacedData, BuildingProgressData, BuildingCompletedData, BuildingCancelledData, BuildingCatalogData, BuildingWorkAreaUpdatedData, BuildingStorageRequestsUpdatedData, BuildingWorkerQueueUpdatedData, ProductionPlanUpdatedData, GlobalProductionPlanUpdatedData, ConstructionStage } from './Buildings/types'
import type { RequestWorkerData, UnassignWorkerData, RequestListData, PopulationListData, PopulationStatsData, Settler, ProfessionType, WorkerRequestFailureReason } from './Population/types'
import type { WorkAssignment, WorkStep, WorkAction, LogisticsRequest } from './Settlers/WorkProvider/types'
import type { ProductionRecipe, ProductionStatus } from './Buildings/types'
import type { ScheduleOptions } from './Scheduler/types'
import type { SimulationTickData } from './Simulation/types'
import type { Position } from './types'
import type { ContextPauseRequestedEventData, ContextPausedEventData, ContextResumeRequestedEventData, ContextResumedEventData, NeedInterruptEventData, NeedPlanCreatedEventData, NeedPlanFailedEventData, NeedSatisfiedEventData, NeedThresholdEventData } from './Needs/types'
import type { NeedType } from './Needs/NeedTypes'
import type { RoadBuildRequestData, RoadTilesSyncData, RoadTilesUpdatedData, RoadPendingSyncData, RoadPendingUpdatedData } from './Roads/types'
import type { ItemType } from './Items/types'
import type { MoveTargetType } from './Movement/types'
import type { CityCharterClaimRequest, CityCharterStateRequest, CityCharterStateData, CityCharterUnlockFlagsUpdated } from './CityCharter/types'
import type { TradeRouteSelection, TradeRouteCancelled, TradeRouteListData, TradeRouteUpdatedData, TradeShipmentStartedData, TradeShipmentArrivedData, TradeReputationUpdatedData } from './Trade/types'
import type {
	BuildingId,
	BuildingInstanceId,
	MapId,
	PlayerId,
	SettlerId,
	StorageReservationId,
	StorageSlotId,
	WorkAssignmentId
} from './ids'

// Interface for client operations
export interface EventClient {
	id: string
	currentGroup: string
	emit(to: Receiver, event: string, data: any, targetClientId?: string): void
	setGroup(group: string): void
}

// Type for event callback functions
export type EventCallback<T = any> = (data: T, client: EventClient) => void
export type LifecycleCallback = (client: EventClient) => void

export type EventPayloads = Record<string, unknown> & {
	[PlayersEvents.CS.Connect]: {}
	[PlayersEvents.CS.Join]: PlayerJoinData
	[PlayersEvents.CS.Move]: PlayerMoveData
	[PlayersEvents.CS.TransitionTo]: PlayerTransitionData
	[PlayersEvents.CS.DropItem]: DropItemData
	[PlayersEvents.CS.PickupItem]: PickUpItemData
	[PlayersEvents.CS.Equip]: EquipItemData
	[PlayersEvents.CS.Unequip]: UnequipItemData
	[PlayersEvents.CS.Place]: PlayerPlaceData
	[PlayersEvents.SC.Connected]: { playerId: string }
	[PlayersEvents.SC.Joined]: PlayerJoinData & { playerId: string }
	[PlayersEvents.SC.Left]: { playerId?: string }
	[PlayersEvents.SC.Move]: PlayerMoveData
	[PlayersEvents.SC.Equip]: EquipItemData
	[PlayersEvents.SC.Unequip]: UnequipItemData

	[ChatEvents.CS.Send]: ChatMessageData
	[ChatEvents.SC.Receive]: ChatMessageData
	[ChatEvents.SC.System]: ChatSystemMessageData
	[ChatEvents.SC.Fullscreen]: ChatSystemMessageData
	[ChatEvents.SC.Emoji]: ChatMessageData

	[SystemEvents.CS.Ping]: {}
	[SystemEvents.SC.Ping]: {}

	[InventoryEvents.CS.Consume]: ConsumeItemData
	[InventoryEvents.CS.MoveItem]: MoveItemData
	[InventoryEvents.SC.Update]: InventoryData
	[InventoryEvents.SC.Add]: AddItemData
	[InventoryEvents.SC.Remove]: { itemId: string }
	[InventoryEvents.SC.MoveItem]: MoveItemData
	[InventoryEvents.SS.Add]: AddItemData
	[InventoryEvents.SS.RemoveByType]: RemoveByTypePayload

	[NPCEvents.CS.Interact]: NPCInteractData
	[NPCEvents.SC.List]: { npcs: NPC[] }
	[NPCEvents.SC.Message]: NPCMessageData
	[NPCEvents.SC.Action]: { npcId: string, action: string }
	[NPCEvents.SC.Spawn]: { npc: NPC }
	[NPCEvents.SC.Despawn]: { npc: NPC }
	[NPCEvents.SS.Go]: NPCGoData
	[NPCEvents.SS.SetAttribute]: { npcId: string, name: string, value: any }
	[NPCEvents.SS.RemoveAttribute]: { npcId: string, name: string }

	[ItemsEvents.CS.GetType]: ItemTypeRequest
	[ItemsEvents.SC.Type]: ItemTypeResponse

	[LootEvents.SS.Spawn]: LootSpawnPayload
	[LootEvents.SC.Spawn]: LootSpawnEventPayload
	[LootEvents.SC.Despawn]: LootDespawnEventPayload
	[LootEvents.SC.Update]: LootUpdateEventPayload

	[DialogueEvents.CS.Continue]: DialogueContinueData
	[DialogueEvents.CS.Choice]: DialogueChoiceData
	[DialogueEvents.CS.End]: DialogueContinueData
	[DialogueEvents.SC.Trigger]: DialogueTriggerData
	[DialogueEvents.SC.End]: { dialogueId: string }

	[QuestEvents.SS.Start]: QuestStartRequest
	[QuestEvents.SC.Start]: QuestUpdateResponse
	[QuestEvents.SC.Update]: QuestUpdateResponse
	[QuestEvents.SC.StepComplete]: QuestUpdateResponse
	[QuestEvents.SC.Complete]: QuestCompleteResponse
	[QuestEvents.SC.List]: QuestListResponse

	[MapObjectsEvents.CS.Place]: PlaceObjectData
	[MapObjectsEvents.CS.Remove]: RemoveObjectData
	[MapObjectsEvents.SC.Spawn]: SpawnObjectData
	[MapObjectsEvents.SC.Despawn]: DespawnObjectData

	[FlagsEvents.SS.SetFlag]: SetFlagData
	[FlagsEvents.SS.UnsetFlag]: UnsetFlagData
	[FlagsEvents.SS.FlagSet]: SetFlagData
	[FlagsEvents.SS.FlagUnset]: UnsetFlagData

	[AffinityEvents.SS.Update]: AffinityUpdateEventData
	[AffinityEvents.SS.Updated]: AffinityUpdatedEventData
	[AffinityEvents.SC.List]: AffinityListEventData
	[AffinityEvents.SC.Update]: AffinitySCUpdateEventData

	[FXEvents.SC.Play]: FXPlayEventData

	[CutsceneEvents.SS.Trigger]: CutsceneTriggerEventData

	[MapEvents.CS.Load]: MapLoadData
	[MapEvents.CS.Transition]: MapTransitionData
	[MapEvents.SC.Load]: MapLoadResponseData
	[MapEvents.SC.Transition]: MapTransitionResponseData

	[TimeEvents.SS.Update]: TimeUpdateEventData
	[TimeEvents.SS.SetSpeed]: TimeSpeedUpdateEventData
	[TimeEvents.SS.Pause]: TimePauseEventData
	[TimeEvents.SS.Resume]: TimePauseEventData
	[TimeEvents.SC.Updated]: TimeUpdateEventData
	[TimeEvents.SC.TimeSet]: TimeUpdateEventData
	[TimeEvents.SC.SpeedSet]: TimeSpeedUpdateEventData
	[TimeEvents.SC.Paused]: TimePauseEventData
	[TimeEvents.SC.Resumed]: TimePauseEventData
	[TimeEvents.SC.Sync]: TimeSyncEventData

	[BuildingsEvents.CS.Place]: PlaceBuildingData
	[BuildingsEvents.CS.Cancel]: CancelBuildingData
	[BuildingsEvents.CS.RequestPreview]: { buildingId: BuildingId }
	[BuildingsEvents.CS.SetProductionPaused]: SetProductionPausedData
	[BuildingsEvents.CS.SetProductionPlan]: SetProductionPlanData
	[BuildingsEvents.CS.SetGlobalProductionPlan]: SetGlobalProductionPlanData
	[BuildingsEvents.CS.SetWorkArea]: SetWorkAreaData
	[BuildingsEvents.CS.SetStorageRequests]: SetStorageRequestsData
	[BuildingsEvents.SC.Placed]: BuildingPlacedData
	[BuildingsEvents.SC.Progress]: BuildingProgressData
	[BuildingsEvents.SC.Completed]: BuildingCompletedData
	[BuildingsEvents.SC.Cancelled]: BuildingCancelledData
	[BuildingsEvents.SC.Catalog]: BuildingCatalogData
	[BuildingsEvents.SC.ResourcesChanged]: { buildingInstanceId: BuildingInstanceId, itemType: ItemType, quantity: number, requiredQuantity: number }
	[BuildingsEvents.SC.StageChanged]: { buildingInstanceId: BuildingInstanceId, stage: ConstructionStage }
	[BuildingsEvents.SC.WorkAreaUpdated]: BuildingWorkAreaUpdatedData
	[BuildingsEvents.SC.StorageRequestsUpdated]: BuildingStorageRequestsUpdatedData
	[BuildingsEvents.SC.WorkerQueueUpdated]: BuildingWorkerQueueUpdatedData
	[BuildingsEvents.SC.ProductionPlanUpdated]: ProductionPlanUpdatedData
	[BuildingsEvents.SC.GlobalProductionPlanUpdated]: GlobalProductionPlanUpdatedData
	[BuildingsEvents.SS.Tick]: {}
	[BuildingsEvents.SS.HouseCompleted]: { buildingInstanceId: BuildingInstanceId, buildingId: BuildingId }
	[BuildingsEvents.SS.ConstructionCompleted]: { buildingInstanceId: BuildingInstanceId, buildingId: BuildingId, mapId: MapId, playerId: PlayerId }
	[BuildingsEvents.SS.Removed]: { buildingInstanceId: BuildingInstanceId, buildingId: BuildingId, mapId: MapId, playerId: PlayerId }

	[PopulationEvents.CS.RequestWorker]: RequestWorkerData
	[PopulationEvents.CS.UnassignWorker]: UnassignWorkerData
	[PopulationEvents.CS.RequestList]: RequestListData
	[PopulationEvents.SC.SettlerSpawned]: { settler: Settler }
	[PopulationEvents.SC.SettlerUpdated]: { settler: Settler }
	[PopulationEvents.SC.SettlerDied]: { settlerId: SettlerId }
	[PopulationEvents.SC.WorkerAssigned]: { assignment: WorkAssignment, settlerId: SettlerId, buildingInstanceId: BuildingInstanceId }
	[PopulationEvents.SC.WorkerUnassigned]: { settlerId: SettlerId, buildingInstanceId: BuildingInstanceId, assignmentId: WorkAssignmentId }
	[PopulationEvents.SC.WorkerRequestFailed]: { reason: WorkerRequestFailureReason, buildingInstanceId: BuildingInstanceId }
	[PopulationEvents.SC.List]: PopulationListData
	[PopulationEvents.SC.StatsUpdated]: PopulationStatsData
	[PopulationEvents.SC.ProfessionChanged]: { settlerId: SettlerId, oldProfession: ProfessionType, newProfession: ProfessionType }
	[PopulationEvents.SS.SpawnTick]: { houseId: BuildingInstanceId }
	[PopulationEvents.SS.SettlerDied]: { settlerId: SettlerId }

	[MovementEvents.SS.MoveToPosition]: { entityId: string, position: Position, mapId?: MapId, targetType?: MoveTargetType, targetId?: string }
	[MovementEvents.SS.CancelMovement]: { entityId: string }
	[MovementEvents.SS.StepComplete]: { entityId: string, position: Position }
	[MovementEvents.SS.SegmentComplete]: { entityId: string, position: Position, segmentDistance: number, totalDistance: number }
	[MovementEvents.SS.PathComplete]: { entityId: string, targetType?: MoveTargetType, targetId?: string }
	[MovementEvents.SC.MoveToPosition]: { entityId: string, targetPosition: Position, mapId: MapId, speed?: number }
	[MovementEvents.SC.PositionUpdated]: { entityId: string, position: Position, mapId: MapId }

	[StorageEvents.SC.StorageUpdated]: { buildingInstanceId: BuildingInstanceId, itemType: string, quantity: number, capacity: number }
	[StorageEvents.SC.StorageSlotUpdated]: { slotId: StorageSlotId, buildingInstanceId: BuildingInstanceId, itemType: string, quantity: number, position: Position }
	[StorageEvents.SC.Spoilage]: { buildingInstanceId: BuildingInstanceId, slotId: StorageSlotId, itemType: string, spoiledQuantity: number, position: Position }
	[StorageEvents.SC.ReservationCreated]: { reservationId: StorageReservationId, buildingInstanceId: BuildingInstanceId, itemType: string, quantity: number, reservedBy: string }
	[StorageEvents.SC.ReservationCancelled]: { reservationId: StorageReservationId, buildingInstanceId: BuildingInstanceId, itemType: string, quantity: number }
	[StorageEvents.SS.StorageTick]: {}
	[StorageEvents.SS.InputRequested]: { buildingInstanceId: BuildingInstanceId, itemType: string, quantity: number }

	[RoadEvents.CS.Place]: RoadBuildRequestData
	[RoadEvents.SC.Sync]: RoadTilesSyncData
	[RoadEvents.SC.Updated]: RoadTilesUpdatedData
	[RoadEvents.SC.PendingSync]: RoadPendingSyncData
	[RoadEvents.SC.PendingUpdated]: RoadPendingUpdatedData

	[WorkProviderEvents.SC.LogisticsUpdated]: { requests: LogisticsRequest[], itemPriorities?: ItemType[] }
	[WorkProviderEvents.CS.SetLogisticsPriorities]: { itemPriorities: ItemType[] }

	[BuildingsEvents.SC.ProductionStarted]: { buildingInstanceId: BuildingInstanceId, recipe: ProductionRecipe }
	[BuildingsEvents.SC.ProductionStopped]: { buildingInstanceId: BuildingInstanceId }
	[BuildingsEvents.SC.ProductionProgress]: { buildingInstanceId: BuildingInstanceId, progress: number }
	[BuildingsEvents.SC.ProductionCompleted]: { buildingInstanceId: BuildingInstanceId, recipe: ProductionRecipe }
	[BuildingsEvents.SC.ProductionStatusChanged]: { buildingInstanceId: BuildingInstanceId, status: ProductionStatus }

	[TriggerEvents.CS.Trigger]: { triggerId: string }
	[TriggerEvents.SC.Triggered]: { triggerId: string }

	[SchedulerEvents.SS.Schedule]: ScheduleOptions
	[SchedulerEvents.SS.Cancel]: { id: string }
	[SchedulerEvents.SS.Enable]: { id: string, success?: boolean, error?: string, nextRunAtSimMs?: number }
	[SchedulerEvents.SS.Disable]: { id: string, success?: boolean, error?: string }
	[SchedulerEvents.SS.Scheduled]: { id: string, nextRunAtSimMs?: number, isActive?: boolean }
	[SchedulerEvents.SS.Triggered]: { id: string }
	[SchedulerEvents.SS.Cancelled]: { id?: string, success?: boolean, error?: string }

	[SimulationEvents.SS.Tick]: SimulationTickData

	[WorkProviderEvents.SS.ActionCompleted]: { settlerId: SettlerId, action: WorkAction }
	[WorkProviderEvents.SS.ActionFailed]: { settlerId: SettlerId, action: WorkAction, reason: string }
	[WorkProviderEvents.SS.StepIssued]: { settlerId: SettlerId, step: WorkStep }
	[WorkProviderEvents.SS.StepCompleted]: { settlerId: SettlerId, step: WorkStep }
	[WorkProviderEvents.SS.StepFailed]: { settlerId: SettlerId, step: WorkStep, reason: string }
	[WorkProviderEvents.SS.AssignmentCreated]: { assignment: WorkAssignment }
	[WorkProviderEvents.SS.AssignmentRemoved]: { assignmentId: WorkAssignmentId }

	[NeedsEvents.SS.NeedBecameUrgent]: NeedThresholdEventData
	[NeedsEvents.SS.NeedBecameCritical]: NeedThresholdEventData
	[NeedsEvents.SS.NeedSatisfied]: NeedSatisfiedEventData
	[NeedsEvents.SS.NeedInterruptRequested]: NeedInterruptEventData
	[NeedsEvents.SS.NeedInterruptStarted]: NeedInterruptEventData
	[NeedsEvents.SS.NeedInterruptEnded]: { settlerId: SettlerId, needType: NeedType }
	[NeedsEvents.SS.ContextPauseRequested]: ContextPauseRequestedEventData
	[NeedsEvents.SS.ContextPaused]: ContextPausedEventData
	[NeedsEvents.SS.ContextResumeRequested]: ContextResumeRequestedEventData
	[NeedsEvents.SS.ContextResumed]: ContextResumedEventData
	[NeedsEvents.SS.NeedPlanCreated]: NeedPlanCreatedEventData
	[NeedsEvents.SS.NeedPlanFailed]: NeedPlanFailedEventData

	[CityCharterEvents.CS.Claim]: CityCharterClaimRequest
	[CityCharterEvents.CS.RequestState]: CityCharterStateRequest
	[CityCharterEvents.SC.State]: CityCharterStateData
	[CityCharterEvents.SC.Updated]: CityCharterStateData
	[CityCharterEvents.SS.UnlockFlagsUpdated]: CityCharterUnlockFlagsUpdated

	[TradeEvents.CS.CreateRoute]: TradeRouteSelection
	[TradeEvents.CS.CancelRoute]: TradeRouteCancelled
	[TradeEvents.CS.RequestRoutes]: {}
	[TradeEvents.SC.RouteList]: TradeRouteListData
	[TradeEvents.SC.RouteUpdated]: TradeRouteUpdatedData
	[TradeEvents.SC.ShipmentStarted]: TradeShipmentStartedData
	[TradeEvents.SC.ShipmentArrived]: TradeShipmentArrivedData
	[TradeEvents.SC.ReputationUpdated]: TradeReputationUpdatedData
}

// Interface that NetworkManager implements
export interface EventManager {
	on<E extends keyof EventPayloads>(event: E, callback: EventCallback<EventPayloads[E]>): void
	on<T>(event: string, callback: EventCallback<T>): void
	off<E extends keyof EventPayloads>(event: E, callback: EventCallback<EventPayloads[E]>): void
	off<T>(event: string, callback: EventCallback<T>): void
	onJoined(callback: LifecycleCallback): void
	onLeft(callback: LifecycleCallback): void
	emit(to: Receiver, event: string, data: any, groupName?: string): void
}

export const Event = {
	Players: PlayersEvents,
	Chat: ChatEvents,
	System: SystemEvents,
	Inventory: InventoryEvents,
	NPC: NPCEvents,
	Items: ItemsEvents,
	Loot: LootEvents,
	Dialogue: DialogueEvents,
	Quest: QuestEvents,
	MapObjects: MapObjectsEvents,
	Flags: FlagsEvents,
	Affinity: AffinityEvents,
	FX: FXEvents,
	Cutscene: CutsceneEvents,
	Map: MapEvents,
	Time: TimeEvents,
	Simulation: SimulationEvents,
	Buildings: BuildingsEvents,
	Population: PopulationEvents,
	Movement: MovementEvents,
	Storage: StorageEvents,
	Roads: RoadEvents,
	Work: WorkProviderEvents,
	Needs: NeedsEvents,
	CityCharter: CityCharterEvents,
	Trade: TradeEvents
} as const

export default Event 
