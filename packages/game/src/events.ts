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
import { ProductionEvents } from './Production/events'
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
import type { PlaceBuildingData, CancelBuildingData, BuildingPlacedData, BuildingProgressData, BuildingCompletedData, BuildingCancelledData, BuildingCatalogData } from './Buildings/types'
import type { RequestWorkerData, UnassignWorkerData, RequestListData, PopulationListData, PopulationStatsData, JobAssignment, Settler, ProfessionType } from './Population/types'
import type { ProductionRecipe, ProductionStatus } from './Production/types'
import type { ScheduleOptions } from './Scheduler/types'
import type { SimulationTickData } from './Simulation/types'
import type { Position } from './types'

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
	[BuildingsEvents.SC.Placed]: BuildingPlacedData
	[BuildingsEvents.SC.Progress]: BuildingProgressData
	[BuildingsEvents.SC.Completed]: BuildingCompletedData
	[BuildingsEvents.SC.Cancelled]: BuildingCancelledData
	[BuildingsEvents.SC.Catalog]: BuildingCatalogData
	[BuildingsEvents.SC.ResourcesChanged]: { buildingInstanceId: string, itemType: string, quantity: number, requiredQuantity: number }
	[BuildingsEvents.SC.StageChanged]: { buildingInstanceId: string, stage: string }
	[BuildingsEvents.SS.Tick]: {}
	[BuildingsEvents.SS.HouseCompleted]: { buildingInstanceId: string, buildingId: string }
	[BuildingsEvents.SS.ConstructionCompleted]: { buildingInstanceId: string, buildingId: string, mapName: string, playerId: string }

	[PopulationEvents.CS.RequestWorker]: RequestWorkerData
	[PopulationEvents.CS.UnassignWorker]: UnassignWorkerData
	[PopulationEvents.CS.RequestList]: RequestListData
	[PopulationEvents.SC.SettlerSpawned]: { settler: Settler }
	[PopulationEvents.SC.SettlerUpdated]: { settler: Settler }
	[PopulationEvents.SC.WorkerAssigned]: { jobAssignment: JobAssignment, settlerId: string, buildingInstanceId: string }
	[PopulationEvents.SC.WorkerUnassigned]: { settlerId: string, buildingInstanceId: string, jobId: string }
	[PopulationEvents.SC.WorkerRequestFailed]: { reason: string, buildingInstanceId: string }
	[PopulationEvents.SC.List]: PopulationListData
	[PopulationEvents.SC.StatsUpdated]: PopulationStatsData
	[PopulationEvents.SC.ProfessionChanged]: { settlerId: string, oldProfession: ProfessionType, newProfession: ProfessionType }
	[PopulationEvents.SS.SpawnTick]: { houseId: string }
	[PopulationEvents.SS.JobTick]: {}

	[MovementEvents.SS.MoveToPosition]: { entityId: string, position: Position, mapName?: string, targetType?: string, targetId?: string }
	[MovementEvents.SS.CancelMovement]: { entityId: string }
	[MovementEvents.SS.StepComplete]: { entityId: string, position: Position }
	[MovementEvents.SS.PathComplete]: { entityId: string, targetType?: string, targetId?: string }
	[MovementEvents.SC.MoveToPosition]: { entityId: string, targetPosition: Position, mapName: string }
	[MovementEvents.SC.PositionUpdated]: { entityId: string, position: Position, mapName: string }

	[StorageEvents.SC.StorageUpdated]: { buildingInstanceId: string, itemType: string, quantity: number, capacity: number }
	[StorageEvents.SC.ReservationCreated]: { reservationId: string, buildingInstanceId: string, itemType: string, quantity: number, reservedBy: string }
	[StorageEvents.SC.ReservationCancelled]: { reservationId: string, buildingInstanceId: string, itemType: string, quantity: number }
	[StorageEvents.SS.StorageTick]: {}
	[StorageEvents.SS.InputRequested]: { buildingInstanceId: string, itemType: string, quantity: number }

	[ProductionEvents.CS.StartProduction]: { buildingInstanceId: string }
	[ProductionEvents.CS.StopProduction]: { buildingInstanceId: string }
	[ProductionEvents.SC.ProductionStarted]: { buildingInstanceId: string, recipe: ProductionRecipe }
	[ProductionEvents.SC.ProductionStopped]: { buildingInstanceId: string }
	[ProductionEvents.SC.ProductionProgress]: { buildingInstanceId: string, progress: number }
	[ProductionEvents.SC.ProductionCompleted]: { buildingInstanceId: string, recipe: ProductionRecipe }
	[ProductionEvents.SC.StatusChanged]: { buildingInstanceId: string, status: ProductionStatus }
	[ProductionEvents.SS.ProductionTick]: {}

	[TriggerEvents.CS.Trigger]: { triggerId: string }
	[TriggerEvents.SC.Triggered]: { triggerId: string }

	[SchedulerEvents.SS.Schedule]: ScheduleOptions
	[SchedulerEvents.SS.Cancel]: { id: string }
	[SchedulerEvents.SS.Enable]: { id: string }
	[SchedulerEvents.SS.Disable]: { id: string }
	[SchedulerEvents.SS.Scheduled]: { id: string, nextRun?: Date, isActive?: boolean }
	[SchedulerEvents.SS.Triggered]: { id: string }
	[SchedulerEvents.SS.Cancelled]: { id: string }

	[SimulationEvents.SS.Tick]: SimulationTickData
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
	Production: ProductionEvents
} as const

export default Event 
