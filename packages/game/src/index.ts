import { ChatManager } from './Chat'
import { PlayersManager } from './Players'
import { InventoryManager } from './Inventory'
import { LootManager } from './Loot'
import { NPCManager } from './NPC'
import { SystemManager } from './System'
import { ItemsManager } from './Items'
import { DialogueManager } from './Dialogue'
import { Scheduler } from './Scheduler'
import { QuestManager } from "./Quest"
import { MapObjectsManager } from "./MapObjects"
import { FlagsManager } from "./Flags"
import { AffinityManager } from "./Affinity"
import { CutsceneManager } from './Cutscene'
import { ConditionEffectManager } from './ConditionEffect'
import { MapManager } from './Map'
import { TriggerManager } from './Triggers'
import { TimeManager } from "./Time"
import { ContentLoader } from './ContentLoader'
import { GameContent } from './types'
import { EventManager } from "./events"
import { EquipmentSlot, EquipmentSlotType } from './Players/types'
import { MapUrlService } from './Map/types'
import { BuildingManager } from './Buildings'
import { PopulationManager } from './Population'
import { MovementManager } from './Movement'
import { ProfessionType } from './Population/types'
import { StorageManager } from './Storage'
import { ReservationSystem } from './Reservation'
import { RoadManager } from './Roads'
import { SimulationManager } from './Simulation'
import { ResourceNodesManager } from './ResourceNodes'
import { WorkProviderManager } from './Settlers/WorkProvider'
import { NeedsManager } from './Needs'
import { ManagersHub } from './Managers'
import { WildlifeManager } from './Wildlife'
import { SnapshotService } from './state/SnapshotService'
import type { GameSnapshotV1 } from './state/types'
import { CityCharterManager } from './CityCharter'
import { TradeManager } from './Trade'
import { ReputationManager } from './Reputation'

// Export types and events
export * from './types'
export * from './events'
export * from './consts'
export * from './utils'
export * from './Settlers/WorkProvider'
export * from './Needs'
export * from './Roads'
export * from './Wildlife'
export * from './CityCharter'
export * from './Trade'
export * from './Reputation'
export * from './WorldMap'
export * from './state/types'
export { SnapshotService } from './state/SnapshotService'
export type { Serializable } from './state/Serializable'
export { EquipmentSlot, EquipmentSlotType }
// export { Event } from './events' 

import { LogsManager, LogLevel } from './Logs'
import { LogsEvents } from './Logs/events'
import { Receiver } from './Receiver'

export interface GameManagerOptions {
	simulationTickMs?: number
	logAllowlist?: string[]
	logToEventBus?: boolean
}

export class GameManager {
	private contentLoader: ContentLoader
	private managers: ManagersHub
	private snapshotService: SnapshotService

	constructor(
		private event: EventManager,
		private content: GameContent,
		private readonly mapUrlService: MapUrlService,
		options: GameManagerOptions = {}
	) {
		// Initialize LogsManager first
		this.managers = new ManagersHub()
		this.managers.event = event
		this.managers.logs = new LogsManager()
		if (options.logAllowlist && options.logAllowlist.length > 0) {
			this.managers.logs.setAllowedManagers(options.logAllowlist)
		}
		if (options.logToEventBus) {
			this.managers.logs.setEventEmitter((payload) => {
				event.emit(Receiver.All, LogsEvents.SC.Console, payload)
			})
		}
		this.managers.simulation = new SimulationManager(
			event,
			this.managers.logs.getLogger('SimulationManager'),
			options.simulationTickMs
		)
		
		// Initialize managers in dependency order
		this.managers.time = new TimeManager(event, this.managers.logs.getLogger('TimeManager'))
		this.managers.chat = new ChatManager(event, this.managers.logs.getLogger('ChatManager'))
		this.managers.system = new SystemManager(event, this.managers.logs.getLogger('SystemManager'))
		this.managers.map = new MapManager(event, this.mapUrlService, this.managers.logs.getLogger('MapManager'))
		this.managers.movement = new MovementManager(this.managers, this.managers.logs.getLogger('MovementManager'))
		this.managers.items = new ItemsManager(event, this.managers.logs.getLogger('ItemsManager'))
		this.managers.inventory = new InventoryManager(this.managers, this.managers.logs.getLogger('InventoryManager'))
		this.managers.flags = new FlagsManager(event, this.managers.logs.getLogger('FlagsManager'))
		this.managers.affinity = new AffinityManager(event, this.managers.logs.getLogger('AffinityManager'), this.managers.simulation)
		this.managers.reputation = new ReputationManager(event)
		this.managers.quest = new QuestManager(this.managers, this.managers.logs.getLogger('QuestManager'))
		this.managers.loot = new LootManager(this.managers, this.managers.logs.getLogger('LootManager'))
		this.managers.cutscene = new CutsceneManager(event, this.managers.logs.getLogger('CutsceneManager'))
		this.managers.dialogue = new DialogueManager(this.managers, this.managers.logs.getLogger('DialogueManager'))
		
		this.managers.npc = new NPCManager(this.managers, this.managers.logs.getLogger('NPCManager'))
		this.managers.scheduler = new Scheduler(this.managers, this.managers.logs.getLogger('Scheduler'))
		this.managers.mapObjects = new MapObjectsManager(this.managers, this.managers.logs.getLogger('MapObjectsManager'))
		this.managers.wildlife = new WildlifeManager(this.managers, this.managers.logs.getLogger('WildlifeManager'))
		this.managers.resourceNodes = new ResourceNodesManager(this.managers, this.managers.logs.getLogger('ResourceNodesManager'))
		this.managers.buildings = new BuildingManager(this.managers, this.managers.logs.getLogger('BuildingManager'))
		// Convert startingPopulation from content (string profession) to ProfessionType
		const startingPopulation = this.content.startingPopulation?.map(entry => ({
			profession: entry.profession as ProfessionType,
			count: entry.count
		})) || []
		this.managers.population = new PopulationManager(
			this.managers,
			startingPopulation,
			this.managers.logs.getLogger('PopulationManager')
		)
		
		// Create StorageManager after BuildingManager (to avoid circular dependency)
		this.managers.storage = new StorageManager(this.managers, this.managers.logs.getLogger('StorageManager'))

		this.managers.cityCharter = new CityCharterManager(
			this.managers,
			this.managers.logs.getLogger('CityCharterManager')
		)

		this.managers.trade = new TradeManager(this.managers, this.managers.logs.getLogger('TradeManager'))

		// Create RoadManager after StorageManager so it can consume road materials
		this.managers.roads = new RoadManager(this.managers, this.managers.logs.getLogger('RoadManager'))
		
		// Create ReservationSystem after Storage/Loot/ResourceNodes/Population
		this.managers.reservations = new ReservationSystem(this.managers)

		// Create WorkProviderManager after BuildingManager, PopulationManager, StorageManager, and ReservationSystem
		this.managers.work = new WorkProviderManager(this.managers, this.managers.logs.getLogger('WorkProviderManager'))

		// Create NeedsManager after WorkProviderManager so it can preempt action queues
		this.managers.needs = new NeedsManager(this.managers, this.managers.logs.getLogger('NeedsManager'))
		
		this.managers.trigger = new TriggerManager(this.managers, this.managers.logs.getLogger('TriggerManager'))

		// Initialize PlayersManager last since it depends on other managers
		this.managers.players = new PlayersManager(
			this.managers,
			this.content.startingItems || [], // Pass starting items configuration from content (default to empty array)
			this.managers.logs.getLogger('PlayersManager')
		)

		this.managers.conditionEffect = new ConditionEffectManager(
			this.managers,
			this.managers.logs.getLogger('ConditionEffectManager')
		)

		// Initialize ContentLoader with all required dependencies
		this.contentLoader = new ContentLoader(
			this.content,
			this.managers.cutscene,
			this.managers.dialogue,
			this.managers.flags,
			this.managers.items,
			this.managers.map,
			this.managers.npc,
			this.managers.quest,
			this.managers.scheduler,
			this.managers.trigger,
			this.managers.affinity,
			this.managers.buildings,
			this.managers.population,
			this.managers.cityCharter,
			this.managers.trade,
			this.managers.resourceNodes,
			this.managers.wildlife,
			this.managers.logs.getLogger('ContentLoader')
		)
		
		// Configure log levels to reduce noise - only show movement-related logs at Info level
		// Movement-related managers (keep at Info level to see movement/state sync logs)
		this.managers.logs.setManagerLevel('MovementManager', LogLevel.Info)
		this.managers.logs.setManagerLevel('PopulationManager', LogLevel.Info)
		
		// Resource collection debugging - enable BuildingManager and WorkProviderManager at Info level
		this.managers.logs.setManagerLevel('BuildingManager', LogLevel.Info)
		this.managers.logs.setManagerLevel('WorkProviderManager', LogLevel.Info)
		
		// Set most other managers to Warn level (only show warnings and errors)
		const quietManagers = [
			'TimeManager',
			'ChatManager',
			'SystemManager',
			'MapManager',
			'ItemsManager',
			'InventoryManager',
			'FlagsManager',
			'AffinityManager',
			'ReputationManager',
			'QuestManager',
			'LootManager',
			'CutsceneManager',
			'DialogueManager',
			'NPCManager',
			'Scheduler',
			'MapObjectsManager',
			'TriggerManager',
			'PlayersManager',
			'ConditionEffectManager',
			'ContentLoader',
			'StorageManager',
			'SimulationManager',
			'ResourceNodesManager',
			'WorkProviderManager',
			'NeedsManager',
			'CityCharterManager',
			'TradeManager',
			'WildlifeManager'
		]
		for (const managerName of quietManagers) {
			this.managers.logs.setManagerLevel(managerName, LogLevel.Warn)
		}
		
		this.setupEventHandlers()
		this.managers.simulation.start()

		this.snapshotService = new SnapshotService(this.managers)
	}

	private setupEventHandlers() {
		// No handlers needed here anymore - all moved to appropriate modules
	}

	public saveState(): GameSnapshotV1 {
		return this.snapshotService.serialize()
	}

	public loadState(snapshot: GameSnapshotV1): void {
		this.snapshotService.deserialize(snapshot)
	}

	public serialize(): GameSnapshotV1 {
		return this.snapshotService.serialize()
	}

	public deserialize(snapshot: GameSnapshotV1): void {
		this.snapshotService.deserialize(snapshot)
	}
}
