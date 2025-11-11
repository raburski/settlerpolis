import { EventManager, Event, EventClient } from '../events'
import { ItemMetadata, ItemTypeRequest, ItemTypeResponse } from './types'
import { Receiver } from '../Receiver'
import { Logger } from '../Logs'

export class ItemsManager {
	private itemsMetadata: Record<string, ItemMetadata> = {}

	constructor(
		private event: EventManager,
		private logger: Logger
	) {
		this.setupEventHandlers()
	}

	public loadItems(items: ItemMetadata[]) {
		this.itemsMetadata = items.reduce((acc, item) => {
			acc[item.id] = item
			return acc
		}, {} as Record<string, ItemMetadata>)
	}

	private setupEventHandlers() {
		// Handle metadata requests
		this.event.on<ItemTypeRequest>(Event.Items.CS.GetType, (data: ItemTypeRequest, client: EventClient) => {
			const metadata = this.itemsMetadata[data.itemType] || null
			
			const response: ItemTypeResponse = {
				itemType: data.itemType,
				meta: metadata,
			}
			client.emit(Receiver.Sender, Event.Items.SC.Type, response)
		})
	}

	/**
	 * Get item metadata by ID
	 * @returns ItemMetadata if found, null otherwise
	 */
	public getItemMetadata(itemId: string): ItemMetadata | null {
		return this.itemsMetadata[itemId] || null
	}

	/**
	 * Check if an item exists
	 */
	public itemExists(itemId: string): boolean {
		return itemId in this.itemsMetadata
	}
} 