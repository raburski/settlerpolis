import { EventManager, Event, EventClient } from '../../events'
import { ItemCategory, ItemMetadata, ItemTypeRequest, ItemTypeResponse } from './types'
import { Receiver } from '../../Receiver'

const ITEMS_METADATA: Record<string, ItemMetadata> = {
	'mozgotrzep': {
		id: 'mozgotrzep',
		name: 'Mózgotrzep',
		emoji: '🍺',
		description: 'A mysterious beverage that makes your brain tingle. The innkeeper\'s specialty.',
		category: ItemCategory.Consumable,
		stackable: true,
		maxStackSize: 5,
	},
}

export class ItemsManager {
	constructor(private event: EventManager) {
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		// Handle metadata requests
		this.event.on<ItemTypeRequest>(Event.Items.CS.GetType, (data: ItemTypeRequest, client: EventClient) => {
			const metadata = ITEMS_METADATA[data.itemType] || null
			
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
		return ITEMS_METADATA[itemId] || null
	}

	/**
	 * Check if an item exists
	 */
	public itemExists(itemId: string): boolean {
		return itemId in ITEMS_METADATA
	}
} 