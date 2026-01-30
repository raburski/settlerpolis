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
import { JobsManager } from './Jobs'
import { StorageManager } from './Storage'
import { ProductionManager } from './Production'
import { SimulationManager } from './Simulation'
import { ResourceNodesManager } from './ResourceNodes'
import { HarvestManager } from './Harvest'
import { ManagersHub } from './Managers'

// Export types and events
export * from './types'
export * from './events'
export * from './consts'
export * from './utils'
export { EquipmentSlot, EquipmentSlotType }
// export { Event } from './events' 

import { LogsManager, LogLevel } from './Logs'

export interface GameManagerOptions {
	simulationTickMs?: number
}

export class GameManager {
	private contentLoader: ContentLoader
	private managers: ManagersHub

	constructor(
		private event: EventManager,
		private content: GameContent,
		private readonly mapUrlService: MapUrlService,
		options: GameManagerOptions = {}
	) {
		// Initialize LogsManager first
		this.managers = new ManagersHub()
		this.managers.logs = new LogsManager()
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
		this.managers.movement = new MovementManager(this.managers, event, this.managers.logs.getLogger('MovementManager'))
		this.managers.items = new ItemsManager(event, this.managers.logs.getLogger('ItemsManager'))
		this.managers.inventory = new InventoryManager(this.managers, event, this.managers.logs.getLogger('InventoryManager'))
		this.managers.flags = new FlagsManager(event, this.managers.logs.getLogger('FlagsManager'))
		this.managers.affinity = new AffinityManager(event, this.managers.logs.getLogger('AffinityManager'))
		this.managers.quest = new QuestManager(this.managers, event, this.managers.logs.getLogger('QuestManager'))
		this.managers.loot = new LootManager(this.managers, event, this.managers.logs.getLogger('LootManager'))
		this.managers.cutscene = new CutsceneManager(event, this.managers.logs.getLogger('CutsceneManager'))
		this.managers.dialogue = new DialogueManager(
			this.managers,
			event,
			this.managers.logs.getLogger('DialogueManager')
		)
		
		this.managers.npc = new NPCManager(this.managers, event, this.managers.logs.getLogger('NPCManager'))
		this.managers.scheduler = new Scheduler(this.managers, event, this.managers.logs.getLogger('Scheduler'))
		this.managers.mapObjects = new MapObjectsManager(this.managers, event, this.managers.logs.getLogger('MapObjectsManager'))
		this.managers.resourceNodes = new ResourceNodesManager(this.managers, event, this.managers.logs.getLogger('ResourceNodesManager'))
		this.managers.buildings = new BuildingManager(this.managers, event, this.managers.logs.getLogger('BuildingManager'))
		// Convert startingPopulation from content (string profession) to ProfessionType
		const startingPopulation = this.content.startingPopulation?.map(entry => ({
			profession: entry.profession as ProfessionType,
			count: entry.count
		})) || []
		this.managers.population = new PopulationManager(
			this.managers,
			event,
			startingPopulation,
			this.managers.logs.getLogger('PopulationManager')
		)
		
		// Create StorageManager after BuildingManager (to avoid circular dependency)
		this.managers.storage = new StorageManager(this.managers, event, this.managers.logs.getLogger('StorageManager'))
		
		// Create JobsManager after BuildingManager, PopulationManager, and StorageManager (to avoid circular dependency)
		this.managers.jobs = new JobsManager(this.managers, event, this.managers.logs.getLogger('JobsManager'))
		
		// Create ProductionManager after BuildingManager, StorageManager, JobsManager, and LootManager
		this.managers.production = new ProductionManager(this.managers, event, this.managers.logs.getLogger('ProductionManager'))
		this.managers.harvest = new HarvestManager(this.managers, event, this.managers.logs.getLogger('HarvestManager'))
		
		this.managers.trigger = new TriggerManager(
			this.managers,
			event,
			this.managers.logs.getLogger('TriggerManager')
		)

		// Initialize PlayersManager last since it depends on other managers
		this.managers.players = new PlayersManager(
			this.managers,
			event,
			this.content.startingItems || [], // Pass starting items configuration from content (default to empty array)
			this.managers.logs.getLogger('PlayersManager')
		)

		this.managers.conditionEffect = new ConditionEffectManager(
			this.managers,
			event,
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
			this.managers.resourceNodes,
			this.managers.logs.getLogger('ContentLoader')
		)
		
		// Configure log levels to reduce noise - only show movement-related logs at Info level
		// Movement-related managers (keep at Info level to see movement/state sync logs)
		this.managers.logs.setManagerLevel('MovementManager', LogLevel.Info)
		this.managers.logs.setManagerLevel('PopulationManager', LogLevel.Info)
		
		// Resource collection debugging - enable BuildingManager and JobsManager at Info level
		this.managers.logs.setManagerLevel('BuildingManager', LogLevel.Info)
		this.managers.logs.setManagerLevel('JobsManager', LogLevel.Info)
		
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
			'ProductionManager',
			'SimulationManager',
			'ResourceNodesManager',
			'HarvestManager'
		]
		for (const managerName of quietManagers) {
			this.managers.logs.setManagerLevel(managerName, LogLevel.Warn)
		}
		
		this.setupEventHandlers()
		this.managers.simulation.start()
	}

	private setupEventHandlers() {
		// No handlers needed here anymore - all moved to appropriate modules
	}
} 
