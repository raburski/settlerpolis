import { EventManager, Event, EventClient } from '../events'
import { Inventory, InventoryData, DropItemData, PickUpItemData, ConsumeItemData, MoveItemData, InventorySlot, Position, AddItemData, RemoveByTypePayload } from './types'
import { PlayerJoinData } from '../Players/types'
import { Receiver } from '../Receiver'
import { v4 as uuidv4 } from 'uuid'
import { Item, ItemCategory } from "../Items/types"
import type { ItemsManager } from "../Items"
import { INVENTORY_GRID_ROWS, INVENTORY_GRID_COLUMNS } from '../consts'
import { Logger } from '../Logs'
import { BaseManager } from '../Managers'
import type { InventorySnapshot } from '../state/types'

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

export interface InventoryDeps {
	event: EventManager
	items: ItemsManager
}

export class InventoryManager extends BaseManager<InventoryDeps> {
	private inventories = new Map<string, Inventory>()

	constructor(
		managers: InventoryDeps,
		private logger: Logger
	) {
		super(managers)
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
		this.logger.debug('Processing MoveItem request:', { itemId, sourcePosition, targetPosition })
		
		const inventory = this.inventories.get(client.id)
		if (!inventory) {
			this.logger.debug('Inventory not found for client:', client.id)
			return
		}
		
		// Get or create slots at source and target positions
		const sourceSlot = getSlotAtPosition(inventory, sourcePosition)
		const targetSlot = getSlotAtPosition(inventory, targetPosition)
		
		if (!sourceSlot || !targetSlot) {
			this.logger.debug('Failed to get or create slots')
			return
		}
		
		// If target slot is empty, simply move the item
		if (!targetSlot.item) {
			this.logger.debug('Moving item to empty slot')
			targetSlot.item = sourceSlot.item
			sourceSlot.item = null
		} else {
			// If target slot has an item, swap them
			this.logger.debug('Swapping items between slots')
			const tempItem = targetSlot.item
			targetSlot.item = sourceSlot.item
			sourceSlot.item = tempItem
		}
		
		// Emit the move item event back to the client
		this.logger.debug('Emitting MoveItem response:', {
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
		if (!inventory) {
			this.logger.warn(`Cannot remove items: inventory not found for player ${client.id}`)
			return false
		}

		let removedCount = 0
		const slotsWithItem = inventory.slots.filter(slot => slot.item?.itemType === itemType)

		this.logger.debug(`Removing ${quantity} of ${itemType} from player ${client.id}, found ${slotsWithItem.length} slots with this item`)

		// Remove items up to the requested quantity
		for (const slot of slotsWithItem) {
			if (removedCount >= quantity) break
			if (slot.item) {
				const itemId = slot.item.id
				slot.item = null
				client.emit(Receiver.Sender, Event.Inventory.SC.Remove, { itemId })
				removedCount++
				this.logger.debug(`Removed item ${itemId} (${itemType}), ${removedCount}/${quantity} removed`)
			}
		}

		if (removedCount < quantity) {
			this.logger.warn(`Only removed ${removedCount} of ${quantity} requested items of type ${itemType}`)
		}

		// Send full inventory update after removing items to ensure UI is synchronized
		if (removedCount > 0) {
			client.emit(Receiver.Sender, Event.Inventory.SC.Update, { inventory })
			this.logger.debug(`Sent inventory update after removing ${removedCount} items`)
		}

		return removedCount > 0
	}

	private setupEventHandlers() {
		this.managers.event.onJoined(this.handleLifecycleJoined)
		this.managers.event.onLeft(this.handleLifecycleLeft)
		this.managers.event.on<PlayerJoinData>(Event.Players.CS.Join, this.handlePlayersCSJoin)
		this.managers.event.on<ConsumeItemData>(Event.Inventory.CS.Consume, this.handleInventoryCSConsume)
		this.managers.event.on(Event.Inventory.SS.Add, this.handleInventorySSAdd)
		this.managers.event.on<MoveItemData>(Event.Inventory.CS.MoveItem, this.handleInventoryCSMoveItem)
		this.managers.event.on<RemoveByTypePayload>(Event.Inventory.SS.RemoveByType, this.handleInventorySSRemoveByType)
	}

	/* EVENT HANDLERS */
	private readonly handleLifecycleJoined = (client: EventClient): void => {
		const initialInventory = this.createInitialInventory()
		this.inventories.set(client.id, initialInventory)
	}

	private readonly handleLifecycleLeft = (client: EventClient): void => {
		this.inventories.delete(client.id)
	}

	private readonly handlePlayersCSJoin = (_data: PlayerJoinData, client: EventClient): void => {
		const inventory = this.inventories.get(client.id)
		if (inventory) {
			client.emit(Receiver.Sender, Event.Inventory.SC.Update, { inventory })
		}
	}

	private readonly handleInventoryCSConsume = (data: ConsumeItemData, client: EventClient): void => {
		const inventory = this.inventories.get(client.id)
		if (!inventory) return

		const slot = inventory.slots.find(candidate => candidate.item?.id === data.itemId)
		if (!slot || !slot.item) return

		const itemType = this.managers.items.getItemMetadata(slot.item.itemType)
		if (itemType?.category !== ItemCategory.Consumable) return

		slot.item = null
		client.emit(Receiver.Sender, Event.Inventory.SC.Remove, { itemId: data.itemId })
	}

	private readonly handleInventorySSAdd = (item: Item, client: EventClient): void => {
		const inventory = this.inventories.get(client.id)
		if (!inventory) return

		const emptySlot = this.findFirstEmptySlot(client.id)
		if (emptySlot) {
			this.addItemToPosition(client, item, emptySlot)
		}
	}

	private readonly handleInventoryCSMoveItem = (data: MoveItemData, client: EventClient): void => {
		this.logger.debug('Received MoveItem event:', data)
		this.moveItem(data, client)
	}

	private readonly handleInventorySSRemoveByType = (data: RemoveByTypePayload, client: EventClient): void => {
		this.removeItemByType(client, data.itemType, data.quantity)
	}

	/* METHODS */
	private createInitialInventory(): Inventory {
		const initialInventory = createEmptyInventory()

		const defaultItem = createItemWithRandomId(DEFAULT_INVENTORY_ITEM_NAME)
		const firstSlot = getSlotAtPosition(initialInventory, { row: 0, column: 0 })
		firstSlot.item = defaultItem

		let slotIndex = 1
		for (let i = 0; i < 40; i += 1) {
			const logItem = createItemWithRandomId('logs')
			const slot = getSlotAtPosition(initialInventory, {
				row: Math.floor(slotIndex / INVENTORY_GRID_COLUMNS),
				column: slotIndex % INVENTORY_GRID_COLUMNS
			})
			if (slot && !slot.item) {
				slot.item = logItem
				slotIndex += 1
			}
		}

		for (let i = 0; i < 30; i += 1) {
			const stoneItem = createItemWithRandomId('stone')
			const slot = getSlotAtPosition(initialInventory, {
				row: Math.floor(slotIndex / INVENTORY_GRID_COLUMNS),
				column: slotIndex % INVENTORY_GRID_COLUMNS
			})
			if (slot && !slot.item) {
				slot.item = stoneItem
				slotIndex += 1
			}
		}

		return initialInventory
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

	serialize(): InventorySnapshot {
		return {
			inventories: Array.from(this.inventories.entries()).map(([playerId, inventory]) => ([
				playerId,
				{ slots: inventory.slots.map(slot => ({ position: { ...slot.position }, item: slot.item ? { ...slot.item } : null })) }
			]))
		}
	}

	deserialize(state: InventorySnapshot): void {
		this.inventories.clear()
		for (const [playerId, inventory] of state.inventories) {
			this.inventories.set(playerId, {
				slots: inventory.slots.map(slot => ({
					position: { ...slot.position },
					item: slot.item ? { ...slot.item } : null
				}))
			})
		}
	}

	reset(): void {
		this.inventories.clear()
	}
}
