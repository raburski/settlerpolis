import { ChatManager } from './Chat'
import { PlayersManager } from './Players'
import { InventoryManager } from './Inventory'
import { LootManager } from './Loot'
import { NPCManager } from './NPC'
import { SystemManager } from './System'
import { ItemsManager } from './Items'
import { DialogueManager } from './Dialogue'
import { Scheduler } from './Scheduler'
import { Receiver } from './Receiver'
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
	private chatManager: ChatManager
	private playersManager: PlayersManager
	private inventoryManager: InventoryManager
	private lootManager: LootManager
	private npcManager: NPCManager
	private systemManager: SystemManager
	private itemsManager: ItemsManager
	private dialogueManager: DialogueManager
	private scheduler: Scheduler
	private questManager: QuestManager
	private mapObjectsManager: MapObjectsManager
	private buildingManager: BuildingManager
	private populationManager: PopulationManager
	private movementManager: MovementManager
	private flagsManager: FlagsManager
	private affinityManager: AffinityManager
	private cutsceneManager: CutsceneManager
	private conditionEffectManager: ConditionEffectManager
	private mapManager: MapManager
	private triggerManager: TriggerManager
	private timeManager: TimeManager
	private contentLoader: ContentLoader
	private logsManager: LogsManager
	private storageManager: StorageManager
	private productionManager: ProductionManager
	private simulationManager: SimulationManager

	constructor(
		private event: EventManager,
		private content: GameContent,
		private readonly mapUrlService: MapUrlService,
		options: GameManagerOptions = {}
	) {
		// Initialize LogsManager first
		this.logsManager = new LogsManager()
		this.simulationManager = new SimulationManager(
			event,
			this.logsManager.getLogger('SimulationManager'),
			options.simulationTickMs
		)
		
		// Initialize managers in dependency order
		this.timeManager = new TimeManager(event, this.logsManager.getLogger('TimeManager'))
		this.chatManager = new ChatManager(event, this.logsManager.getLogger('ChatManager'))
		this.systemManager = new SystemManager(event, this.logsManager.getLogger('SystemManager'))
		this.mapManager = new MapManager(event, this.mapUrlService, this.logsManager.getLogger('MapManager'))
		this.movementManager = new MovementManager(event, this.mapManager, this.logsManager.getLogger('MovementManager'))
		this.itemsManager = new ItemsManager(event, this.logsManager.getLogger('ItemsManager'))
		this.inventoryManager = new InventoryManager(event, this.itemsManager, this.logsManager.getLogger('InventoryManager'))
		this.flagsManager = new FlagsManager(event, this.logsManager.getLogger('FlagsManager'))
		this.affinityManager = new AffinityManager(event, this.logsManager.getLogger('AffinityManager'))
		this.questManager = new QuestManager(event, this.inventoryManager, this.logsManager.getLogger('QuestManager'))
		this.lootManager = new LootManager(event, this.logsManager.getLogger('LootManager'))
		this.cutsceneManager = new CutsceneManager(event, this.logsManager.getLogger('CutsceneManager'))
		this.dialogueManager = new DialogueManager(
			event, 
			this.questManager,
			this.logsManager.getLogger('DialogueManager')
		)
		
		this.npcManager = new NPCManager(event, this.dialogueManager, this.mapManager, this.timeManager, this.questManager, this.movementManager, this.logsManager.getLogger('NPCManager'))
		this.scheduler = new Scheduler(event, this.timeManager, this.logsManager.getLogger('Scheduler'))
		this.mapObjectsManager = new MapObjectsManager(event, this.itemsManager, this.inventoryManager, this.logsManager.getLogger('MapObjectsManager'))
		this.buildingManager = new BuildingManager(event, this.inventoryManager, this.mapObjectsManager, this.itemsManager, this.mapManager, this.logsManager.getLogger('BuildingManager'), this.lootManager)
		// Convert startingPopulation from content (string profession) to ProfessionType
		const startingPopulation = this.content.startingPopulation?.map(entry => ({
			profession: entry.profession as ProfessionType,
			count: entry.count
		})) || []
		this.populationManager = new PopulationManager(event, this.buildingManager, this.scheduler, this.mapManager, this.lootManager, this.itemsManager, this.movementManager, startingPopulation, this.logsManager.getLogger('PopulationManager'))
		
		// Create StorageManager after BuildingManager (to avoid circular dependency)
		this.storageManager = new StorageManager(event, this.buildingManager, this.itemsManager, this.logsManager.getLogger('StorageManager'))
		
		// Create JobsManager after BuildingManager, PopulationManager, and StorageManager (to avoid circular dependency)
		const jobsManager = new JobsManager(event, this.buildingManager, this.populationManager, this.lootManager, this.mapManager, this.logsManager.getLogger('JobsManager'))
		jobsManager.setStorageManager(this.storageManager)
		
		// Create ProductionManager after BuildingManager, StorageManager, JobsManager, and LootManager
		this.productionManager = new ProductionManager(event, this.buildingManager, this.storageManager, jobsManager, this.lootManager, this.logsManager.getLogger('ProductionManager'))
		
		// Set JobsManager references (to avoid circular dependency in constructors)
		this.buildingManager.setJobsManager(jobsManager)
		this.populationManager.setJobsManager(jobsManager)
		this.populationManager.setStorageManager(this.storageManager)
		
		// Set LootManager reference in BuildingManager (for refunding resources)
		this.buildingManager.setLootManager(this.lootManager)
		
		// Set StorageManager and ProductionManager references in BuildingManager (for initializing storage/production on building completion)
		this.buildingManager.setStorageManager(this.storageManager)
		this.buildingManager.setProductionManager(this.productionManager)
		
		this.triggerManager = new TriggerManager(
			event,
			this.npcManager,
			this.mapManager,
			this.logsManager.getLogger('TriggerManager')
		)

		// Initialize PlayersManager last since it depends on other managers
		this.playersManager = new PlayersManager(
			event, 
			this.inventoryManager, 
			this.lootManager, 
			this.itemsManager,
			this.mapObjectsManager,
			this.mapManager,
			this.content.startingItems || [], // Pass starting items configuration from content (default to empty array)
			this.logsManager.getLogger('PlayersManager')
		)

		this.conditionEffectManager = new ConditionEffectManager(
			event,
			this.questManager,
			this.flagsManager,
			this.affinityManager,
			this.npcManager,
			this.playersManager,
			this.timeManager,
			this.inventoryManager,
			this.dialogueManager,
			this.logsManager.getLogger('ConditionEffectManager')
		)
		this.dialogueManager.conditionEffectManager = this.conditionEffectManager
		this.questManager.conditionEffectManager = this.conditionEffectManager
		this.triggerManager.conditionEffectManager = this.conditionEffectManager
		this.scheduler.conditionEffectManager = this.conditionEffectManager

		// Initialize ContentLoader with all required dependencies
		this.contentLoader = new ContentLoader(
			this.content,
			this.cutsceneManager,
			this.dialogueManager,
			this.flagsManager,
			this.itemsManager,
			this.mapManager,
			this.npcManager,
			this.questManager,
			this.scheduler,
			this.triggerManager,
			this.affinityManager,
			this.buildingManager,
			this.populationManager,
			this.logsManager.getLogger('ContentLoader')
		)
		
		// Configure log levels to reduce noise - only show movement-related logs at Info level
		// Movement-related managers (keep at Info level to see movement/state sync logs)
		this.logsManager.setManagerLevel('MovementManager', LogLevel.Info)
		this.logsManager.setManagerLevel('PopulationManager', LogLevel.Info)
		
		// Resource collection debugging - enable BuildingManager and JobsManager at Info level
		this.logsManager.setManagerLevel('BuildingManager', LogLevel.Info)
		this.logsManager.setManagerLevel('JobsManager', LogLevel.Info)
		
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
			'SimulationManager'
		]
		for (const managerName of quietManagers) {
			this.logsManager.setManagerLevel(managerName, LogLevel.Warn)
		}
		
		this.setupEventHandlers()
		this.simulationManager.start()
	}

	private setupEventHandlers() {
		// No handlers needed here anymore - all moved to appropriate modules
	}
} 
