import { EventManager, Event } from '../events'
import { ChatManager } from './Chat'
import { PlayersManager } from './Players'
import { InventoryManager } from './Inventory'
import { LootManager } from './Loot'
import { NPCManager } from './NPC'
import { SystemManager } from './System'
import { ItemsManager } from './Items'
import { DialogueManager } from './Dialogue'
import { Scheduler } from './Scheduler'
import { Receiver } from '../Receiver'
import { QuestManager } from "./Quest"
import { MapObjectsManager } from "./MapObjects"
import { FlagsManager } from "./Flags"
import { AffinityManager } from "./Affinity"
import { CutsceneManager } from './Cutscene'

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

	constructor(private event: EventManager) {
		// Initialize managers in dependency order
		
		this.chatManager = new ChatManager(event)
		this.systemManager = new SystemManager(event)
		this.itemsManager = new ItemsManager(event)
		this.inventoryManager = new InventoryManager(event, this.itemsManager)
		this.questManager = new QuestManager(event, this.inventoryManager)
		this.lootManager = new LootManager(event)
		this.flagsManager = new FlagsManager(event)
		this.affinityManager = new AffinityManager(event)
		this.cutsceneManager = new CutsceneManager(event)
		this.dialogueManager = new DialogueManager(event, this.questManager, this.flagsManager, this.affinityManager)
		this.npcManager = new NPCManager(event, this.dialogueManager)
		this.scheduler = new Scheduler(event)
		this.mapObjectsManager = new MapObjectsManager(event, this.itemsManager, this.inventoryManager)
		
		// Initialize PlayersManager last since it depends on other managers
		this.playersManager = new PlayersManager(
			event, 
			this.inventoryManager, 
			this.lootManager, 
			this.itemsManager,
			this.mapObjectsManager
		)
		
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		// No handlers needed here anymore - all moved to appropriate modules
	}
} 