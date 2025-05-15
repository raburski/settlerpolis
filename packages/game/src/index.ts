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

// Export types and events
export * from './types'
export * from './events'
export * from './consts'
export { EquipmentSlot, EquipmentSlotType }
// export { Event } from './events' 

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
	private flagsManager: FlagsManager
	private affinityManager: AffinityManager
	private cutsceneManager: CutsceneManager
	private conditionEffectManager: ConditionEffectManager
	private mapManager: MapManager
	private triggerManager: TriggerManager
	private timeManager: TimeManager
	private contentLoader: ContentLoader

	constructor(
		private event: EventManager,
		private content: GameContent,
		private readonly mapUrlService: MapUrlService
	) {
		// Initialize managers in dependency order
		this.timeManager = new TimeManager(event)
		this.chatManager = new ChatManager(event)
		this.systemManager = new SystemManager(event)
		this.mapManager = new MapManager(event, this.mapUrlService)
		this.itemsManager = new ItemsManager(event)
		this.inventoryManager = new InventoryManager(event, this.itemsManager)
		this.flagsManager = new FlagsManager(event)
		this.affinityManager = new AffinityManager(event)
		this.questManager = new QuestManager(event, this.inventoryManager)
		this.lootManager = new LootManager(event)
		this.cutsceneManager = new CutsceneManager(event)
		this.dialogueManager = new DialogueManager(
			event, 
			this.questManager
		)
		
		this.npcManager = new NPCManager(event, this.dialogueManager, this.mapManager, this.timeManager)
		this.scheduler = new Scheduler(event, this.timeManager)
		this.mapObjectsManager = new MapObjectsManager(event, this.itemsManager, this.inventoryManager)
		this.triggerManager = new TriggerManager(
			event,
			this.npcManager,
			this.mapManager
		)

		// Initialize PlayersManager last since it depends on other managers
		this.playersManager = new PlayersManager(
			event, 
			this.inventoryManager, 
			this.lootManager, 
			this.itemsManager,
			this.mapObjectsManager,
			this.mapManager
		)

		this.conditionEffectManager = new ConditionEffectManager(
			event,
			this.questManager,
			this.flagsManager,
			this.affinityManager,
			this.npcManager,
			this.playersManager,
			this.timeManager,
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
			this.affinityManager
		)
		
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		// No handlers needed here anymore - all moved to appropriate modules
	}
} 