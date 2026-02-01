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
import type { PlaceBuildingData, CancelBuildingData, SetProductionPausedData, SetWorkAreaData, BuildingPlacedData, BuildingProgressData, BuildingCompletedData, BuildingCancelledData, BuildingCatalogData, BuildingWorkAreaUpdatedData } from './Buildings/types'
import type { RequestWorkerData, UnassignWorkerData, RequestListData, PopulationListData, PopulationStatsData, Settler, ProfessionType, WorkerRequestFailureReason } from './Population/types'
import type { WorkAssignment, WorkStep, WorkAction, LogisticsRequest } from './Settlers/WorkProvider/types'
import type { ProductionRecipe, ProductionStatus } from './Buildings/types'
import type { ScheduleOptions } from './Scheduler/types'
import type { SimulationTickData } from './Simulation/types'
import type { Position } from './types'
import type { ContextPauseRequestedEventData, ContextPausedEventData, ContextResumeRequestedEventData, ContextResumedEventData, NeedInterruptEventData, NeedPlanCreatedEventData, NeedPlanFailedEventData, NeedSatisfiedEventData, NeedThresholdEventData } from './Needs/types'
import type { NeedType } from './Needs/NeedTypes'
import type { RoadBuildRequestData, RoadTilesSyncData, RoadTilesUpdatedData, RoadPendingSyncData, RoadPendingUpdatedData } from './Roads/types'

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
	[BuildingsEvents.CS.RequestPreview]: { buildingId: string }
	[BuildingsEvents.CS.SetProductionPaused]: SetProductionPausedData
	[BuildingsEvents.CS.SetWorkArea]: SetWorkAreaData
	[BuildingsEvents.SC.Placed]: BuildingPlacedData
	[BuildingsEvents.SC.Progress]: BuildingProgressData
	[BuildingsEvents.SC.Completed]: BuildingCompletedData
	[BuildingsEvents.SC.Cancelled]: BuildingCancelledData
	[BuildingsEvents.SC.Catalog]: BuildingCatalogData
	[BuildingsEvents.SC.ResourcesChanged]: { buildingInstanceId: string, itemType: string, quantity: number, requiredQuantity: number }
	[BuildingsEvents.SC.StageChanged]: { buildingInstanceId: string, stage: string }
	[BuildingsEvents.SC.WorkAreaUpdated]: BuildingWorkAreaUpdatedData
	[BuildingsEvents.SS.Tick]: {}
	[BuildingsEvents.SS.HouseCompleted]: { buildingInstanceId: string, buildingId: string }
	[BuildingsEvents.SS.ConstructionCompleted]: { buildingInstanceId: string, buildingId: string, mapName: string, playerId: string }

	[PopulationEvents.CS.RequestWorker]: RequestWorkerData
	[PopulationEvents.CS.UnassignWorker]: UnassignWorkerData
	[PopulationEvents.CS.RequestList]: RequestListData
	[PopulationEvents.SC.SettlerSpawned]: { settler: Settler }
	[PopulationEvents.SC.SettlerUpdated]: { settler: Settler }
	[PopulationEvents.SC.WorkerAssigned]: { assignment: WorkAssignment, settlerId: string, buildingInstanceId: string }
	[PopulationEvents.SC.WorkerUnassigned]: { settlerId: string, buildingInstanceId: string, assignmentId: string }
	[PopulationEvents.SC.WorkerRequestFailed]: { reason: WorkerRequestFailureReason, buildingInstanceId: string }
	[PopulationEvents.SC.List]: PopulationListData
	[PopulationEvents.SC.StatsUpdated]: PopulationStatsData
	[PopulationEvents.SC.ProfessionChanged]: { settlerId: string, oldProfession: ProfessionType, newProfession: ProfessionType }
	[PopulationEvents.SS.SpawnTick]: { houseId: string }

	[MovementEvents.SS.MoveToPosition]: { entityId: string, position: Position, mapName?: string, targetType?: string, targetId?: string }
	[MovementEvents.SS.CancelMovement]: { entityId: string }
	[MovementEvents.SS.StepComplete]: { entityId: string, position: Position }
	[MovementEvents.SS.SegmentComplete]: { entityId: string, position: Position, segmentDistance: number, totalDistance: number }
	[MovementEvents.SS.PathComplete]: { entityId: string, targetType?: string, targetId?: string }
	[MovementEvents.SC.MoveToPosition]: { entityId: string, targetPosition: Position, mapName: string, speed?: number }
	[MovementEvents.SC.PositionUpdated]: { entityId: string, position: Position, mapName: string }

	[StorageEvents.SC.StorageUpdated]: { buildingInstanceId: string, itemType: string, quantity: number, capacity: number }
	[StorageEvents.SC.StorageSlotUpdated]: { slotId: string, buildingInstanceId: string, itemType: string, quantity: number, position: Position }
	[StorageEvents.SC.Spoilage]: { buildingInstanceId: string, slotId: string, itemType: string, spoiledQuantity: number, position: Position }
	[StorageEvents.SC.ReservationCreated]: { reservationId: string, buildingInstanceId: string, itemType: string, quantity: number, reservedBy: string }
	[StorageEvents.SC.ReservationCancelled]: { reservationId: string, buildingInstanceId: string, itemType: string, quantity: number }
	[StorageEvents.SS.StorageTick]: {}
	[StorageEvents.SS.InputRequested]: { buildingInstanceId: string, itemType: string, quantity: number }

	[RoadEvents.CS.Place]: RoadBuildRequestData
	[RoadEvents.SC.Sync]: RoadTilesSyncData
	[RoadEvents.SC.Updated]: RoadTilesUpdatedData
	[RoadEvents.SC.PendingSync]: RoadPendingSyncData
	[RoadEvents.SC.PendingUpdated]: RoadPendingUpdatedData

	[WorkProviderEvents.SC.LogisticsUpdated]: { requests: LogisticsRequest[] }

	[BuildingsEvents.SC.ProductionStarted]: { buildingInstanceId: string, recipe: ProductionRecipe }
	[BuildingsEvents.SC.ProductionStopped]: { buildingInstanceId: string }
	[BuildingsEvents.SC.ProductionProgress]: { buildingInstanceId: string, progress: number }
	[BuildingsEvents.SC.ProductionCompleted]: { buildingInstanceId: string, recipe: ProductionRecipe }
	[BuildingsEvents.SC.ProductionStatusChanged]: { buildingInstanceId: string, status: ProductionStatus }

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

	[WorkProviderEvents.SS.ActionCompleted]: { settlerId: string, action: WorkAction }
	[WorkProviderEvents.SS.ActionFailed]: { settlerId: string, action: WorkAction, reason: string }
	[WorkProviderEvents.SS.StepIssued]: { settlerId: string, step: WorkStep }
	[WorkProviderEvents.SS.StepCompleted]: { settlerId: string, step: WorkStep }
	[WorkProviderEvents.SS.StepFailed]: { settlerId: string, step: WorkStep, reason: string }
	[WorkProviderEvents.SS.AssignmentCreated]: { assignment: WorkAssignment }
	[WorkProviderEvents.SS.AssignmentRemoved]: { assignmentId: string }

	[NeedsEvents.SS.NeedBecameUrgent]: NeedThresholdEventData
	[NeedsEvents.SS.NeedBecameCritical]: NeedThresholdEventData
	[NeedsEvents.SS.NeedSatisfied]: NeedSatisfiedEventData
	[NeedsEvents.SS.NeedInterruptRequested]: NeedInterruptEventData
	[NeedsEvents.SS.NeedInterruptStarted]: NeedInterruptEventData
	[NeedsEvents.SS.NeedInterruptEnded]: { settlerId: string, needType: NeedType }
	[NeedsEvents.SS.ContextPauseRequested]: ContextPauseRequestedEventData
	[NeedsEvents.SS.ContextPaused]: ContextPausedEventData
	[NeedsEvents.SS.ContextResumeRequested]: ContextResumeRequestedEventData
	[NeedsEvents.SS.ContextResumed]: ContextResumedEventData
	[NeedsEvents.SS.NeedPlanCreated]: NeedPlanCreatedEventData
	[NeedsEvents.SS.NeedPlanFailed]: NeedPlanFailedEventData
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
	Needs: NeedsEvents
} as const

export default Event 
