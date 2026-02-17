import { EventManager, Event, EventClient } from '../events'
import { ItemCategory, ItemMetadata, ItemTypeRequest, ItemTypeResponse } from './types'
import { Receiver } from '../Receiver'
import { Logger } from '../Logs'
import { ItemsManagerState } from './ItemsManagerState'

export class ItemsManager {
	private readonly state = new ItemsManagerState()

	constructor(
		private event: EventManager,
		private logger: Logger
	) {
		this.setupEventHandlers()
	}

	public loadItems(items: ItemMetadata[]) {
		this.state.itemsMetadata = items.reduce((acc, item) => {
			acc[item.id] = item
			return acc
		}, {} as Record<string, ItemMetadata>)
	}

	private setupEventHandlers() {
		this.event.on<ItemTypeRequest>(Event.Items.CS.GetType, this.handleItemsCSGetType)
	}

	/* EVENT HANDLERS */
	private readonly handleItemsCSGetType = (data: ItemTypeRequest, client: EventClient): void => {
		const metadata = this.state.itemsMetadata[data.itemType] || null

		const response: ItemTypeResponse = {
			itemType: data.itemType,
			meta: metadata
		}
		client.emit(Receiver.Sender, Event.Items.SC.Type, response)
	}

	/**
	 * Get item metadata by ID
	 * @returns ItemMetadata if found, null otherwise
	 */
	/* METHODS */
	public getItemMetadata(itemId: string): ItemMetadata | null {
		return this.state.itemsMetadata[itemId] || null
	}

	public getItems(): ItemMetadata[] {
		return Object.values(this.state.itemsMetadata)
	}

	public getItemsByCategory(category: ItemCategory): ItemMetadata[] {
		return this.getItems().filter(item => item.category === category)
	}

	/**
	 * Check if an item exists
	 */
	public itemExists(itemId: string): boolean {
		return itemId in this.state.itemsMetadata
	}
}

export * from './ItemsManagerState'
