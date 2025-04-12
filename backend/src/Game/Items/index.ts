import { EventManager, Event, EventClient } from '../../events'
import { ItemMetadata, ItemMetaRequest, ItemMetaResponse } from '../../types'
import { Receiver } from '../../Receiver'
import { ItemTypeRequest } from "./types"

const ITEMS_METADATA: Record<string, ItemMetadata> = {
	'mozgotrzep': {
		id: 'mozgotrzep',
		name: 'Mózgotrzep',
		emoji: '🍺',
		description: 'A mysterious beverage that makes your brain tingle. The innkeeper\'s specialty.',
		// type: ItemType.Consumable,
		rarity: 'uncommon',
		stackable: true,
		maxStackSize: 5,
		consumable: true,
		effects: [
			{
				type: 'speed_boost',
				value: 1.5,
				duration: 30
			},
			{
				type: 'confusion',
				value: 1,
				duration: 10
			}
		],
		value: 50
	},
	// Add more items here...
}

export class ItemsManager {
	constructor(private event: EventManager) {
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		// Handle metadata requests
		this.event.on<ItemTypeRequest>(Event.Items.CS.GetType, (data: ItemTypeRequest, client: EventClient) => {
			const metadata = ITEMS_METADATA[data.itemType] || null
			
			const response: ItemMetaResponse = {
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