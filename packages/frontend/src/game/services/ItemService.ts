import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'

export interface ItemType {
	name: string
	type: string
	description?: string
	icon?: string
	category?: string
	emoji?: string
	changesProfession?: string
	changesProfessions?: string[]
}

type UpdateCallback = () => void
type ItemMetadataCallback = (metadata: ItemType | undefined) => void

class ItemService {
	private itemTypes: Map<string, ItemType> = new Map()
	private requestedTypes: Set<string> = new Set()
	private updateCallbacks: Set<UpdateCallback> = new Set()
	private itemMetadataCallbacks: Map<string, Set<ItemMetadataCallback>> = new Map()
	private eventHandler: ((data: { itemType: string, meta: ItemType }) => void) | null = null

	constructor() {
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		this.eventHandler = (data: { itemType: string, meta: ItemType }) => {
			this.itemTypes.set(data.itemType, data.meta)
			this.notifyUpdate()
			this.notifyItemMetadataUpdate(data.itemType, data.meta)
		}

		EventBus.on(Event.Items.SC.Type, this.eventHandler)
	}

	getItemType(itemType: string): ItemType | undefined {
		const cachedType = this.itemTypes.get(itemType)
		
		if (!cachedType && !this.requestedTypes.has(itemType)) {
			this.requestedTypes.add(itemType)
			setTimeout(() => {
				EventBus.emit(Event.Items.CS.GetType, { itemType })
			}, 0)
		}

		return cachedType
	}

	getItemTypeAsync(itemType: string): Promise<ItemType | undefined> {
		return new Promise((resolve) => {
			const cachedType = this.itemTypes.get(itemType)
			if (cachedType) {
				resolve(cachedType)
				return
			}

			const unsubscribe = this.subscribeToItemMetadata(itemType, (metadata) => {
				unsubscribe()
				resolve(metadata)
			})
		})
	}

	subscribeToItemMetadata(itemType: string, callback: ItemMetadataCallback): () => void {
		// Initialize callbacks set for this item type if it doesn't exist
		if (!this.itemMetadataCallbacks.has(itemType)) {
			this.itemMetadataCallbacks.set(itemType, new Set())
		}
		
		// Add the callback
		const callbacks = this.itemMetadataCallbacks.get(itemType)!
		callbacks.add(callback)
		
		// If we already have the metadata, call the callback immediately
		const cachedType = this.itemTypes.get(itemType)
		if (cachedType) {
			callback(cachedType)
		} else if (!this.requestedTypes.has(itemType)) {
			// Request the metadata if we don't have it yet
			this.requestedTypes.add(itemType)
			setTimeout(() => {
				EventBus.emit(Event.Items.CS.GetType, { itemType })
			}, 0)
		}
		
		// Return unsubscribe function
		return () => {
			callbacks.delete(callback)
			if (callbacks.size === 0) {
				this.itemMetadataCallbacks.delete(itemType)
			}
		}
	}

	onUpdate(callback: UpdateCallback) {
		this.updateCallbacks.add(callback)
		return () => {
			this.updateCallbacks.delete(callback)
		}
	}

	private notifyUpdate() {
		this.updateCallbacks.forEach(callback => callback())
	}

	private notifyItemMetadataUpdate(itemType: string, metadata: ItemType) {
		const callbacks = this.itemMetadataCallbacks.get(itemType)
		if (callbacks) {
			callbacks.forEach(callback => callback(metadata))
		}
	}

	clearCache() {
		this.itemTypes.clear()
		this.requestedTypes.clear()
	}

	destroy() {
		if (this.eventHandler) {
			EventBus.off(Event.Items.SC.Type, this.eventHandler)
			this.eventHandler = null
		}
		this.updateCallbacks.clear()
		this.itemMetadataCallbacks.clear()
		this.clearCache()
	}
}

// Export singleton instance
export const itemService = new ItemService() 
