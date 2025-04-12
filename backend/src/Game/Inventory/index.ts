import { EventManager, Event, EventClient } from '../../events'
import { Inventory, InventoryData, DropItemData, PickUpItemData, ConsumeItemData, PlayerJoinData } from '../../types'
import { Receiver } from '../../Receiver'
import { v4 as uuidv4 } from 'uuid'
import { Item, ItemCategory, ItemType } from "../Items/types"
import { ItemsManager } from "../Items"

const DEFAULT_INVENTORY_ITEM_NAME = 'mozgotrzep'

function createItemWithRandomId(itemType: string): Item {
	return {
		id: uuidv4(),
		itemType,
	}
}

export class InventoryManager {
	private inventories = new Map<string, Inventory>()


	constructor(
		private event: EventManager,
		private itemsManager: ItemsManager,
	) {
		this.setupEventHandlers()
	}

	public doesHave(itemType: string, quantity: number, playerId: string): boolean {
		const inventory = this.inventories.get(playerId)
		if (!inventory) return false

		// Count how many items of this type the player has
		const count = inventory.items.filter(item => item.itemType === itemType).length
		return count >= quantity
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

			const item = inventory.items.find(item => item.id === data.itemId)
			if (!item) return

			// Check if item is consumable
			const itemType = this.itemsManager.getItemMetadata(item.itemType)
			if (itemType?.category !== ItemCategory.Consumable) return

			// Remove item from inventory
			const itemIndex = inventory.items.findIndex(item => item.id === data.itemId)
			inventory.items.splice(itemIndex, 1)
			client.emit(Receiver.Sender, Event.Inventory.SC.Update, { inventory })
		})

		// Handle item add from dialogue or other server events
		this.event.on(Event.Inventory.SS.Add, (data: { itemId: string, itemType: ItemType }, client) => {
			const inventory = this.inventories.get(client.id)
			if (!inventory) return

			const item: Item = {
				id: data.itemId,
				itemType: data.itemType,
			}

			inventory.items.push(item)
			client.emit(Receiver.Sender, Event.Inventory.SC.Update, { inventory })
		})
	}
} 