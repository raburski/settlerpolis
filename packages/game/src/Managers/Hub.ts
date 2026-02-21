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
import type { SettlerWorkManager } from '../Settlers/Work'
import type { SettlerBehaviourManager } from '../Settlers/Behaviour'
import type { SettlerActionsManager } from '../Settlers/Actions'
import type { SettlerNeedsManager } from '../Settlers/Needs'
import type { SettlerNavigationManager } from '../Settlers/Navigation'
import type { RoadManager } from '../Roads'
import type { EventManager } from '../events'
import type { Logger } from '../Logs'
import type { WildlifeManager } from '../Wildlife'
import type { CityCharterManager } from '../CityCharter'
import type { TradeManager } from '../Trade'
import type { ReputationManager } from '../Reputation'

export interface Managers {
	event: EventManager
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
	actions: SettlerActionsManager
	behaviour: SettlerBehaviourManager
	work: SettlerWorkManager
	needs: SettlerNeedsManager
	navigation: SettlerNavigationManager
	wildlife: WildlifeManager
	cityCharter: CityCharterManager
	trade: TradeManager
	reputation: ReputationManager
}

export class ManagersHub implements Managers {
	event!: EventManager
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
	actions!: SettlerActionsManager
	behaviour!: SettlerBehaviourManager
	work!: SettlerWorkManager
	needs!: SettlerNeedsManager
	navigation!: SettlerNavigationManager
	wildlife!: WildlifeManager
	cityCharter!: CityCharterManager
	trade!: TradeManager
	reputation!: ReputationManager
}
