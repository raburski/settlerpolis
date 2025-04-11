import { EventManager, Event } from '../events'
import { ChatManager } from './Chat'
import { PlayersManager } from './Players'
import { InventoryManager } from './Inventory'
import { LootManager } from './Loot'
import { NPCManager } from './NPC'
import { SystemManager } from './System'
import { ItemsManager } from './Items'
import { Receiver } from '../Receiver'

export class GameManager {
	private chatManager: ChatManager
	private playersManager: PlayersManager
	private inventoryManager: InventoryManager
	private lootManager: LootManager
	private npcManager: NPCManager
	private systemManager: SystemManager
	private itemsManager: ItemsManager

	constructor(private event: EventManager) {
		// Initialize managers in dependency order
		this.chatManager = new ChatManager(event)
		this.systemManager = new SystemManager(event)
		this.itemsManager = new ItemsManager(event)
		this.inventoryManager = new InventoryManager(event)
		this.lootManager = new LootManager(event)
		this.npcManager = new NPCManager(event)
		
		// Initialize PlayersManager last since it depends on other managers
		this.playersManager = new PlayersManager(event, this.inventoryManager, this.lootManager)
		
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		// No handlers needed here anymore - all moved to appropriate modules
	}
} 