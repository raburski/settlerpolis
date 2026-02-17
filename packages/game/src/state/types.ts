import type { TimeData, Time } from '../Time/types'
import type { Player } from '../Players/types'
import type { Inventory } from '../Inventory/types'
import type { MapObject } from '../MapObjects/types'
import type { DroppedItem } from '../Loot/types'
import type { BuildingInstance } from '../Buildings/types'
import type { StorageReservation, StorageSlot } from '../Storage/types'
import type { Settler } from '../Population/types'
import type { MovementEntity } from '../Movement/types'
import type { NeedsState } from '../Needs/NeedsState'
import type { NeedType, NeedPriority } from '../Needs/NeedTypes'
import type { NeedLevel } from '../Needs/NeedTypes'
import type { WorkAssignment, LogisticsRequest, WorkWaitReason, WorkAction, WorkStep } from '../Settlers/Work/types'
import type { ProductionStatus, ProductionPlan } from '../Buildings/types'
import type { NPC, NPCRoutineStep } from '../NPC/types'
import type { PlayerQuestState, QuestProgress } from '../Quest/types'
import type { Flag } from '../Flags/types'
import type { AffinityData } from '../Affinity/types'
import type { ResourceNodeInstance } from '../ResourceNodes/types'
import type { RoadData, RoadType } from '../Roads/types'
import type { PausedContext } from '../Needs/types'
import type { Trigger } from '../Triggers/types'
import type { ScheduledEvent } from '../Scheduler/types'
import type { Position } from '../types'
import type { MoveTargetType } from '../Movement/types'
import type { ItemType } from '../Items/types'
import type { TradeSnapshot } from '../Trade/types'
import type { ReputationSnapshot } from '../Reputation/types'
import type {
	BuildingInstanceId,
	MapId,
	PlayerId,
	ReservationId,
	RoadJobId,
	SettlerId,
	StorageSlotId
} from '../ids'

export type MapEntries<V> = Array<[string, V]>

export interface GameSnapshotV1 {
	version: 1
	contentId?: string
	savedAtSimMs: number
	state: {
		simulation: SimulationSnapshot
		time: TimeSnapshot
		players: PlayersSnapshot
		inventory: InventorySnapshot
		mapObjects: MapObjectsSnapshot
		loot: LootSnapshot
		buildings: BuildingsSnapshot
		storage: StorageSnapshot
		population: PopulationSnapshot
		movement: MovementSnapshot
		needs: NeedsSnapshot
		work: WorkProviderSnapshot
		npc: NPCSnapshot
		quests: QuestSnapshot
		dialogue: DialogueSnapshot
		flags: FlagsSnapshot
		affinity: AffinitySnapshot
		reputation: ReputationSnapshot
		resourceNodes: ResourceNodesSnapshot
	roads: RoadsSnapshot
		cityCharter: CityCharterSnapshot
		trade: TradeSnapshot
		triggers: TriggersSnapshot
		scheduler: SchedulerSnapshot
	reservations: ReservationSnapshot
	}
}

export interface SimulationSnapshot {
	simulationTimeMs: number
	tickIntervalMs: number
}

export interface TimeSnapshot {
	timeData: TimeData
	lastBroadcastHour: number
	tickAccumulatorMs: number
}

export interface PlayersSnapshot {
	players: Player[]
}

export interface InventorySnapshot {
	inventories: MapEntries<Inventory>
}

export interface MapObjectsSnapshot {
	objectsByMap: MapEntries<MapObject[]>
}

export interface LootSnapshot {
	droppedItems: MapEntries<DroppedItem[]>
	itemReservations: MapEntries<string>
}

export type CollectedResourcesSnapshot = Array<[string, number]>

export type BuildingInstanceSnapshot = Omit<BuildingInstance, 'collectedResources'> & {
	collectedResources: CollectedResourcesSnapshot
}

export interface BuildingsSnapshot {
	buildings: BuildingInstanceSnapshot[]
	resourceRequests: MapEntries<string[]>
	assignedWorkers: MapEntries<string[]>
	activeConstructionWorkers: MapEntries<string[]>
	autoProductionState: MapEntries<{ status: ProductionStatus, progressMs: number, progress: number }>
	buildingToMapObject: MapEntries<string>
	productionCountsByBuilding?: MapEntries<MapEntries<number>>
	globalProductionPlans?: MapEntries<MapEntries<ProductionPlan>>
}

export interface BuildingStorageSnapshot {
	buildingInstanceId: BuildingInstanceId
	slots: StorageSlot[]
	slotsByItem: MapEntries<StorageSlotId[]>
}

export interface StorageSnapshot {
	storages: BuildingStorageSnapshot[]
	reservations: StorageReservation[]
	simulationTimeMs: number
}

export interface PopulationSnapshot {
	settlers: Settler[]
	houseOccupants: MapEntries<string[]>
	houseSpawnSchedule: MapEntries<{ nextSpawnAtMs: number, rateMs: number }>
	simulationTimeMs: number
}

export interface MovementSnapshot {
	entities: MovementEntity[]
	activeMoves: MovementTaskSnapshot[]
	simulationTimeMs: number
}

export interface MovementTaskSnapshot {
	entityId: string
	targetPosition: Position
	targetType?: MoveTargetType
	targetId?: string
}

export interface NeedsSnapshot {
	needsBySettler: MapEntries<NeedsState>
	lastLevels: MapEntries<Record<NeedType, NeedLevel>>
	interrupts: NeedInterruptSnapshot[]
}

export interface NeedsSystemSnapshot {
	needsBySettler: MapEntries<NeedsState>
	lastLevels: MapEntries<Record<NeedType, NeedLevel>>
}

export interface NeedInterruptSnapshot {
	settlerId: string
	activeNeed: NeedType | null
	priority: NeedPriority | null
	pendingNeed?: { needType: NeedType, priority: NeedPriority } | null
	pausedContext: PausedContext | null
	cooldowns: Record<NeedType, number>
}

export interface WorkProviderSnapshot {
	assignments: WorkAssignment[]
	assignmentsByBuilding: MapEntries<string[]>
	productionStateByBuilding: MapEntries<{ status: ProductionStatus, progress: number }>
	lastConstructionAssignAt: MapEntries<number>
	pauseRequests: MapEntries<{ reason: string }>
	pausedContexts: MapEntries<PausedContext | null>
	movementRecoveryUntil: MapEntries<number>
	movementRecoveryReason: MapEntries<WorkWaitReason>
	movementFailureCounts: MapEntries<number>
	pendingDispatchAtMs: MapEntries<number>
	actionSystem: ActionSystemSnapshot
	logistics: LogisticsSnapshot
	pendingWorkerRequests?: Array<{ buildingInstanceId: BuildingInstanceId, requestedAtMs: number }>
}

export interface LogisticsSnapshot {
	requests: LogisticsRequest[]
	inFlightConstruction: MapEntries<MapEntries<number>>
	itemPriorities?: ItemType[]
}

export interface ActionSystemSnapshot {
	queues: ActionSystemQueueSnapshot[]
}

export interface ActionSystemQueueSnapshot {
	settlerId: string
	actions: WorkAction[]
	index: number
	context?: ActionQueueContext
}

export enum ActionQueueContextKind {
	Work = 'work',
	Need = 'need'
}

export type ActionQueueContext =
	| { kind: ActionQueueContextKind.Work, step?: WorkStep, reservationOwnerId?: string }
	| { kind: ActionQueueContextKind.Need, needType: NeedType, satisfyValue?: number, reservationOwnerId?: string }

export interface NPCSnapshot {
	npcs: NPC[]
	pausedRoutines: MapEntries<NPCRoutineStep>
	lastRoutineCheckKey: string | null
}

export interface QuestSnapshot {
	playerQuestStates: MapEntries<PlayerQuestState>
	globalQuestStates: MapEntries<QuestProgress>
	sharedQuestStates: MapEntries<QuestProgress>
}

export interface DialogueSnapshot {
	activeDialogues: MapEntries<string>
	currentNodes: MapEntries<string>
}

export interface FlagsSnapshot {
	flags: Flag[]
}

export interface AffinitySnapshot {
	affinities: AffinityData[]
}

export interface ResourceNodesSnapshot {
	nodes: ResourceNodeInstance[]
	simulationTimeMs: number
	prospectingJobsByMap?: MapEntries<ProspectingJobSnapshot[]>
}

export interface RoadsSnapshot {
	roadsByMap: MapEntries<RoadData>
	jobsByMap: MapEntries<RoadJobSnapshot[]>
}

export interface CityCharterStateSnapshot {
	playerId: PlayerId
	mapId: MapId
	currentTierId: string
	claimedTierIds: string[]
	unlockedFlags: string[]
}

export interface CityCharterSnapshot {
	states: CityCharterStateSnapshot[]
}

export interface RoadJobSnapshot {
	jobId: RoadJobId
	mapId: MapId
	playerId: PlayerId
	tileX: number
	tileY: number
	roadType: RoadType
	createdAt: number
	assignedSettlerId?: SettlerId
}

export interface ProspectingJobSnapshot {
	jobId: string
	mapId: MapId
	playerId: PlayerId
	nodeId: string
	createdAt: number
	assignedSettlerId?: SettlerId
}

export interface TriggersSnapshot {
	triggers: Trigger[]
	activeTriggers: string[]
	activeProximityTriggers: string[]
	usedTriggers: string[]
	playerActiveTriggers: MapEntries<string[]>
	playerConditionTriggers: MapEntries<MapEntries<boolean>>
}

export interface SchedulerSnapshot {
	events: ScheduledEvent[]
	simulationTimeMs: number
}

export interface ReservationSnapshot {
	amenityReservations: MapEntries<AmenityReservationSnapshot>
	amenitySlotsByBuilding: MapEntries<Array<[number, string]>>
	houseReservations: MapEntries<HouseReservationSnapshot>
	houseReservationsByHouse: MapEntries<MapEntries<string>>
}

export interface AmenityReservationSnapshot {
	reservationId: ReservationId
	buildingInstanceId: BuildingInstanceId
	settlerId: SettlerId
	slotIndex: number
	position: Position
	createdAt: number
}

export interface HouseReservationSnapshot {
	reservationId: ReservationId
	houseId: BuildingInstanceId
	settlerId: SettlerId
	createdAt: number
}

export interface DialogueSnapshotContext {
	currentNodes: MapEntries<string>
	activeDialogues: MapEntries<string>
}

export interface GameTimeKeySnapshot {
	key: string
	time: Time
}
