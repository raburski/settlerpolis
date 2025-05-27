import { EventManager, Event, EventClient } from '../events'
import { Inventory, InventoryData, DropItemData, PickUpItemData, ConsumeItemData, MoveItemData, InventorySlot, Position, AddItemData, RemoveByTypePayload } from './types'
import { PlayerJoinData } from '../Players/types'
import { Receiver } from '../Receiver'
import { v4 as uuidv4 } from 'uuid'
import { Item, ItemCategory, ItemType } from "../Items/types"
import { ItemsManager } from "../Items"
import { INVENTORY_GRID_ROWS, INVENTORY_GRID_COLUMNS } from '../consts'

const DEFAULT_INVENTORY_ITEM_NAME = 'chainfolk_rug'

function createItemWithRandomId(itemType: string): Item {
	return {
		id: uuidv4(),
		itemType,
	}
}

function createEmptySlot(row: number, column: number): InventorySlot {
	return {
		position: { row, column },
		item: null
	}
}

function createEmptyInventory(): Inventory {
	return { slots: [] }
}

function getSlotAtPosition(inventory: Inventory, position: Position): InventorySlot {
	// Find existing slot at position
	let slot = inventory.slots.find(slot => 
		slot.position.row === position.row && 
		slot.position.column === position.column
	)
	
	// If slot doesn't exist and position is within grid bounds, create it
	if (!slot && 
		position.row >= 0 && position.row < INVENTORY_GRID_ROWS && 
		position.column >= 0 && position.column < INVENTORY_GRID_COLUMNS
	) {
		slot = createEmptySlot(position.row, position.column)
		inventory.slots.push(slot)
	}
	
	// If slot still doesn't exist (position out of bounds), create a dummy slot
	if (!slot) {
		slot = createEmptySlot(position.row, position.column)
	}
	
	return slot
}

export class InventoryManager {
	private inventories = new Map<string, Inventory>()

	constructor(
		private event: EventManager,
		private itemsManager: ItemsManager,
	) {
		this.setupEventHandlers()
	}

	public hasEmptySlot(playerId: string): boolean {
		return this.findFirstEmptySlot(playerId) !== undefined
	}

	public doesHave(itemType: string, quantity: number, playerId: string): boolean {
		const inventory = this.inventories.get(playerId)
		if (!inventory) return false

		// Count how many items of this type the player has
		const count = inventory.slots.filter(slot => slot.item?.itemType === itemType).length
		return count >= quantity
	}

	addItem(client: EventClient, item: Item) {
		const emptySlot = this.findFirstEmptySlot(client.id)
		if (emptySlot) {
			this.addItemToPosition(client, item, emptySlot)
		}
	}

	removeItem(client: EventClient, itemId: string): Item | undefined {
		const inventory = this.inventories.get(client.id)
		if (!inventory) return undefined

		// Find the slot containing this item
		const slot = inventory.slots.find(slot => slot.item?.id === itemId)
		if (!slot) return undefined

		// Remove the item from the slot
		const removedItem = slot.item
		slot.item = null
		
		client.emit(Receiver.Sender, Event.Inventory.SC.Remove, { itemId })
		return removedItem || undefined
	}

	private moveItem(data: MoveItemData, client: EventClient) {
		const { itemId, sourcePosition, targetPosition } = data
		console.log('Processing MoveItem request:', { itemId, sourcePosition, targetPosition })
		
		const inventory = this.inventories.get(client.id)
		if (!inventory) {
			console.log('Inventory not found for client:', client.id)
			return
		}
		
		// Get or create slots at source and target positions
		const sourceSlot = getSlotAtPosition(inventory, sourcePosition)
		const targetSlot = getSlotAtPosition(inventory, targetPosition)
		
		if (!sourceSlot || !targetSlot) {
			console.log('Failed to get or create slots')
			return
		}
		
		// If target slot is empty, simply move the item
		if (!targetSlot.item) {
			console.log('Moving item to empty slot')
			targetSlot.item = sourceSlot.item
			sourceSlot.item = null
		} else {
			// If target slot has an item, swap them
			console.log('Swapping items between slots')
			const tempItem = targetSlot.item
			targetSlot.item = sourceSlot.item
			sourceSlot.item = tempItem
		}
		
		// Emit the move item event back to the client
		console.log('Emitting MoveItem response:', {
			itemId,
			sourcePosition,
			targetPosition
		})
		
		client.emit(Receiver.Sender, Event.Inventory.SC.MoveItem, {
			itemId,
			sourcePosition,
			targetPosition
		})

		// Emit the full inventory update
		client.emit(Receiver.Sender, Event.Inventory.SC.Update, { inventory })
	}

	public removeItemByType(client: EventClient, itemType: string, quantity: number = 1): boolean {
		const inventory = this.inventories.get(client.id)
		if (!inventory) return false

		let removedCount = 0
		const slotsWithItem = inventory.slots.filter(slot => slot.item?.itemType === itemType)

		// Remove items up to the requested quantity
		for (const slot of slotsWithItem) {
			if (removedCount >= quantity) break
			if (slot.item) {
				const itemId = slot.item.id
				slot.item = null
				client.emit(Receiver.Sender, Event.Inventory.SC.Remove, { itemId })
				removedCount++
			}
		}

		return removedCount > 0
	}

	private setupEventHandlers() {
		// Handle client lifecycle
		this.event.onJoined((client) => {
			// Create initial inventory
			const initialInventory = createEmptyInventory()
			
			// Add a default item to the first slot
			const defaultItem = createItemWithRandomId(DEFAULT_INVENTORY_ITEM_NAME)
			const firstSlot = getSlotAtPosition(initialInventory, { row: 0, column: 0 })
			firstSlot.item = defaultItem
			
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

			const slot = inventory.slots.find(slot => slot.item?.id === data.itemId)
			if (!slot || !slot.item) return

			// Check if item is consumable
			const itemType = this.itemsManager.getItemMetadata(slot.item.itemType)
			if (itemType?.category !== ItemCategory.Consumable) return

			// Remove item from slot
			slot.item = null
			
			client.emit(Receiver.Sender, Event.Inventory.SC.Remove, { itemId: data.itemId })
		})

		// Handle item add from dialogue or other server events
		this.event.on(Event.Inventory.SS.Add, (item: Item, client) => {
			const inventory = this.inventories.get(client.id)
			if (!inventory) return

			const emptySlot = this.findFirstEmptySlot(client.id)
			if (emptySlot) {
				this.addItemToPosition(client, item, emptySlot)
			}
		})
		
		// Handle moving items between slots
		this.event.on<MoveItemData>(Event.Inventory.CS.MoveItem, (data, client) => {
			console.log('Received MoveItem event:', data)
			this.moveItem(data, client)
		})

		// Handle remove item by type
		this.event.on<RemoveByTypePayload>(Event.Inventory.SS.RemoveByType, (data, client) => {
			this.removeItemByType(client, data.itemType, data.quantity)
		})
	}

	public getSlotAtPosition(playerId: string, position: Position): InventorySlot | undefined {
		const inventory = this.inventories.get(playerId)
		if (!inventory) return undefined
		
		return getSlotAtPosition(inventory, position)
	}

	public findFirstEmptySlot(playerId: string): Position | undefined {
		const inventory = this.inventories.get(playerId)
		if (!inventory) return undefined
		
		// Search for the first empty slot
		for (let row = 0; row < INVENTORY_GRID_ROWS; row++) {
			for (let column = 0; column < INVENTORY_GRID_COLUMNS; column++) {
				const slot = getSlotAtPosition(inventory, { row, column })
				if (slot && !slot.item) {
					return { row, column }
				}
			}
		}
		
		return undefined
	}

	public addItemToPosition(client: EventClient, item: Item, position: Position) {
		const inventory = this.inventories.get(client.id)
		if (!inventory) return
		
		const slot = getSlotAtPosition(inventory, position)
		if (!slot) return
		
		slot.item = item
		
		const addItemData: AddItemData = {
			item,
			position: slot.position
		}
		client.emit(Receiver.Sender, Event.Inventory.SC.Add, addItemData)
	}

	public getSlotForItem(playerId: string, itemId: string): InventorySlot | undefined {
		const inventory = this.inventories.get(playerId)
		if (!inventory) return undefined

		return inventory.slots.find(slot => slot.item?.id === itemId)
	}

	public getItem(playerId: string, itemId: string): Item | undefined {
		const inventory = this.inventories.get(playerId)
		if (!inventory) return undefined

		const slot = inventory.slots.find(slot => slot.item?.id === itemId)
		return slot?.item || undefined
	}
} 