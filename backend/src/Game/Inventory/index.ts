import { EventManager, Event, EventClient } from '../../events'
import { Inventory, Item, InventoryData, DropItemData, PickUpItemData, ConsumeItemData, PlayerJoinData } from '../DataTypes'
import { ItemType } from '../types'
import { Receiver } from '../../Receiver'
import { v4 as uuidv4 } from 'uuid'

const DEFAULT_INVENTORY_ITEM_NAME = 'Butelka mózgotrzepa'

function createItemWithRandomId(name: string, type: ItemType = ItemType.Consumable): Item {
	return {
		id: uuidv4(),
		name,
		type
	}
}

export class InventoryManager {
	private inventories = new Map<string, Inventory>()

	constructor(private event: EventManager) {
		this.setupEventHandlers()
	}

	addItem(client: EventClient, item: Item) {
		const inventory = this.inventories.get(client.id)
		if (!inventory) return

		inventory.items.push(item)
		client.emit(Receiver.Sender, Event.Inventory.SC.Update, { inventory })
	}

	removeItem(client: EventClient, itemId: string): Item | undefined {
		const inventory = this.inventories.get(client.id)
		if (!inventory) return

		const itemIndex = inventory.items.findIndex(item => item.id === itemId)
		if (itemIndex === -1) return

		const [removedItem] = inventory.items.splice(itemIndex, 1)
		client.emit(Receiver.Sender, Event.Inventory.SC.Update, { inventory })
		return removedItem
	}

	private setupEventHandlers() {
		// Handle client lifecycle
		this.event.onJoined((client) => {
			// Create initial inventory with default item
			const initialInventory: Inventory = {
				items: [createItemWithRandomId(DEFAULT_INVENTORY_ITEM_NAME)]
			}
			this.inventories.set(client.id, initialInventory)
		})

		this.event.onLeft((client) => {
			this.inventories.delete(client.id)
		})

		// Handle player join to send initial inventory
		this.event.on<PlayerJoinData>(Event.Players.CS.Join, (_, client) => {
			const inventory = this.inventories.get(client.id)
			if (inventory) {
				client.emit(Receiver.Sender, Event.Inventory.SC.Update, { inventory })
			}
		})

		// Handle item consume
		this.event.on<ConsumeItemData>(Event.Inventory.CS.Consume, (data, client) => {
			const inventory = this.inventories.get(client.id)
			if (!inventory) return

			const itemIndex = inventory.items.findIndex(item => item.id === data.itemId)
			if (itemIndex === -1) return

			// Check if item is consumable
			const item = inventory.items[itemIndex]
			if (item.type !== ItemType.Consumable) return

			// Remove item from inventory
			inventory.items.splice(itemIndex, 1)
			client.emit(Receiver.Sender, Event.Inventory.SC.Update, { inventory })
		})
	}
} 