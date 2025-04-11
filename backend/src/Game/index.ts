import { EventManager, Event, EventClient } from '../Event'
import { Item, DroppedItem, DropItemData, PickUpItemData } from '../DataTypes'
import { PICKUP_RANGE } from '../consts'
import { Receiver } from '../Receiver'
import { ChatManager } from './Chat'
import { SystemManager } from './System'
import { InventoryManager } from './Inventory'
import { PlayersManager } from './Players'
import { LootManager } from './Loot'
import { NPCManager } from './NPC'

export class GameManager {
	private chatManager: ChatManager
	private systemManager: SystemManager
	private inventoryManager: InventoryManager
	private playersManager: PlayersManager
	private lootManager: LootManager
	private npcManager: NPCManager

	constructor(private event: EventManager) {
		this.chatManager = new ChatManager(event)
		this.systemManager = new SystemManager(event)
		this.inventoryManager = new InventoryManager(event)
		this.playersManager = new PlayersManager(event)
		this.lootManager = new LootManager(event)
		this.npcManager = new NPCManager(event)
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		// Handle item drop
		this.event.on<DropItemData>(Event.Inventory.CS.Drop, (data, client) => {
			const player = this.playersManager.getPlayer(client.id)
			if (!player) return

			const removedItem = this.inventoryManager.removeItem(client, data.itemId)
			if (!removedItem) return

			// Create dropped item with position and scene
			const newDroppedItem: DroppedItem = {
				...removedItem,
				position: player.position,
				scene: client.currentGroup,
				droppedAt: Date.now()
			}

			// Add to scene's dropped items
			this.lootManager.dropItem(newDroppedItem, client)
		})

		// Handle item pickup
		this.event.on<PickUpItemData>(Event.Inventory.CS.PickUp, (data, client) => {
			const player = this.playersManager.getPlayer(client.id)
			if (!player) return

			const sceneItems = this.lootManager.getSceneItems(client.currentGroup)
			const item = sceneItems.find(item => item.id === data.itemId)
			if (!item) return

			// Calculate distance between player and item
			const distance = Math.sqrt(
				Math.pow(player.position.x - item.position.x, 2) + 
				Math.pow(player.position.y - item.position.y, 2)
			)

			// Check if player is within pickup range
			if (distance > PICKUP_RANGE) {
				return // Player is too far to pick up the item
			}

			// Remove item from dropped items
			const removedItem = this.lootManager.pickItem(data.itemId, client)
			if (!removedItem) return

			// Add item to player's inventory
			const inventoryItem: Item = {
				id: removedItem.id,
				name: removedItem.name,
				type: removedItem.type
			}
			this.inventoryManager.addItem(client, inventoryItem)
		})
	}
} 