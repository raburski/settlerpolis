import { EventBus } from '../EventBus'
import { ItemsEvents } from '../../../backend/src/Game/Items/events'

export interface ItemType {
	name: string
	type: string
	description?: string
	icon?: string
}

type UpdateCallback = () => void

class ItemService {
	private itemTypes: Map<string, ItemType> = new Map()
	private requestedTypes: Set<string> = new Set()
	private updateCallbacks: Set<UpdateCallback> = new Set()

	constructor() {
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		EventBus.on(ItemsEvents.SC.Type, (data: { itemType: string, meta: ItemType }) => {
			this.itemTypes.set(data.itemType, data.meta)
			this.notifyUpdate()
		})
	}

	getItemType(itemType: string): ItemType | undefined {
		const cachedType = this.itemTypes.get(itemType)
		
		if (!cachedType && !this.requestedTypes.has(itemType)) {
			this.requestedTypes.add(itemType)
			setTimeout(() => {
				EventBus.emit(ItemsEvents.CS.GetType, { itemType })
			}, 0)
		}

		return cachedType
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

	clearCache() {
		this.itemTypes.clear()
		this.requestedTypes.clear()
	}
}

// Export singleton instance
export const itemService = new ItemService() 