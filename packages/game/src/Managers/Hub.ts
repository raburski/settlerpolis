import type { ChatManager } from '../Chat'
import type { PlayersManager } from '../Players'
import type { InventoryManager } from '../Inventory'
import type { LootManager } from '../Loot'
import type { NPCManager } from '../NPC'
import type { SystemManager } from '../System'
import type { ItemsManager } from '../Items'
import type { DialogueManager } from '../Dialogue'
import type { Scheduler } from '../Scheduler'
import type { QuestManager } from '../Quest'
import type { MapObjectsManager } from '../MapObjects'
import type { BuildingManager } from '../Buildings'
import type { PopulationManager } from '../Population'
import type { MovementManager } from '../Movement'
import type { FlagsManager } from '../Flags'
import type { AffinityManager } from '../Affinity'
import type { CutsceneManager } from '../Cutscene'
import type { ConditionEffectManager } from '../ConditionEffect'
import type { MapManager } from '../Map'
import type { TriggerManager } from '../Triggers'
import type { TimeManager } from '../Time'
import type { LogsManager } from '../Logs'
import type { StorageManager } from '../Storage'
import type { SimulationManager } from '../Simulation'
import type { ResourceNodesManager } from '../ResourceNodes'
import type { ReservationSystem } from '../Reservation'
import type { WorkProviderManager } from '../Settlers/WorkProvider'
import type { NeedsManager } from '../Needs'
import type { RoadManager } from '../Roads'
import type { EventManager } from '../events'
import type { Logger } from '../Logs'
import type { WildlifeManager } from '../Wildlife'

export interface Managers {
	chat: ChatManager
	players: PlayersManager
	inventory: InventoryManager
	loot: LootManager
	npc: NPCManager
	system: SystemManager
	items: ItemsManager
	dialogue: DialogueManager
	scheduler: Scheduler
	quest: QuestManager
	mapObjects: MapObjectsManager
	buildings: BuildingManager
	population: PopulationManager
	movement: MovementManager
	flags: FlagsManager
	affinity: AffinityManager
	cutscene: CutsceneManager
	conditionEffect: ConditionEffectManager
	map: MapManager
	trigger: TriggerManager
	time: TimeManager
	logs: LogsManager
	storage: StorageManager
	simulation: SimulationManager
	resourceNodes: ResourceNodesManager
	reservations: ReservationSystem
	roads: RoadManager
	work: WorkProviderManager
	needs: NeedsManager
	wildlife: WildlifeManager
}

export class ManagersHub implements Managers {
	event?: EventManager
	logger?: Logger
	chat!: ChatManager
	players!: PlayersManager
	inventory!: InventoryManager
	loot!: LootManager
	npc!: NPCManager
	system!: SystemManager
	items!: ItemsManager
	dialogue!: DialogueManager
	scheduler!: Scheduler
	quest!: QuestManager
	mapObjects!: MapObjectsManager
	buildings!: BuildingManager
	population!: PopulationManager
	movement!: MovementManager
	flags!: FlagsManager
	affinity!: AffinityManager
	cutscene!: CutsceneManager
	conditionEffect!: ConditionEffectManager
	map!: MapManager
	trigger!: TriggerManager
	time!: TimeManager
	logs!: LogsManager
	storage!: StorageManager
	simulation!: SimulationManager
	resourceNodes!: ResourceNodesManager
	reservations!: ReservationSystem
	roads!: RoadManager
	work!: WorkProviderManager
	needs!: NeedsManager
	wildlife!: WildlifeManager
}
