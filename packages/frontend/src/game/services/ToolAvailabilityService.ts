import { EventBus } from '../EventBus'
import { Event, DroppedItem, ProfessionType } from '@rugged/game'
import { itemService } from './ItemService'

type UpdateCallback = () => void

class ToolAvailabilityService {
	private itemTypesById = new Map<string, string>()
	private itemTypeCounts = new Map<string, number>()
	private itemTypeProfession = new Map<string, ProfessionType | null>()
	private itemMetadataSubscriptions = new Map<string, () => void>()
	private updateCallbacks: Set<UpdateCallback> = new Set()
	private professionToolCounts: Record<ProfessionType, number> = {
		[ProfessionType.Carrier]: 0,
		[ProfessionType.Builder]: 0,
		[ProfessionType.Woodcutter]: 0,
		[ProfessionType.Miner]: 0
	}

	constructor() {
		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		EventBus.on(Event.Loot.SC.Spawn, (data: { item: DroppedItem }) => {
			this.addItem(data.item)
		})

		EventBus.on(Event.Loot.SC.Update, (data: { item: DroppedItem }) => {
			this.addItem(data.item)
		})

		EventBus.on(Event.Loot.SC.Despawn, (data: { itemId: string }) => {
			this.removeItem(data.itemId)
		})
	}

	private addItem(item: DroppedItem): void {
		if (!this.itemTypesById.has(item.id)) {
			this.itemTypesById.set(item.id, item.itemType)
			const nextCount = (this.itemTypeCounts.get(item.itemType) || 0) + 1
			this.itemTypeCounts.set(item.itemType, nextCount)
			const hadProfession = this.itemTypeProfession.has(item.itemType)
			this.ensureItemTypeProfession(item.itemType)
			if (hadProfession) {
				const profession = this.itemTypeProfession.get(item.itemType)
				if (profession) {
					this.professionToolCounts[profession] = (this.professionToolCounts[profession] || 0) + 1
				}
			}
			this.notifyUpdate()
		}
	}

	private removeItem(itemId: string): void {
		const itemType = this.itemTypesById.get(itemId)
		if (!itemType) {
			return
		}

		this.itemTypesById.delete(itemId)
		const nextCount = (this.itemTypeCounts.get(itemType) || 0) - 1
		if (nextCount <= 0) {
			this.itemTypeCounts.delete(itemType)
		} else {
			this.itemTypeCounts.set(itemType, nextCount)
		}

		const profession = this.itemTypeProfession.get(itemType)
		if (profession) {
			const nextProfessionCount = (this.professionToolCounts[profession] || 0) - 1
			this.professionToolCounts[profession] = Math.max(0, nextProfessionCount)
		}
		this.notifyUpdate()
	}

	private ensureItemTypeProfession(itemType: string): void {
		if (this.itemTypeProfession.has(itemType)) {
			return
		}

		const metadata = itemService.getItemType(itemType)
		if (metadata) {
			this.setItemTypeProfession(itemType, metadata.changesProfession)
			return
		}

		if (this.itemMetadataSubscriptions.has(itemType)) {
			return
		}

		const unsubscribe = itemService.subscribeToItemMetadata(itemType, (itemMetadata) => {
			this.itemMetadataSubscriptions.delete(itemType)
			unsubscribe()
			this.setItemTypeProfession(itemType, itemMetadata?.changesProfession)
		})

		this.itemMetadataSubscriptions.set(itemType, unsubscribe)
	}

	private setItemTypeProfession(itemType: string, professionValue?: string): void {
		if (!professionValue) {
			this.itemTypeProfession.set(itemType, null)
			return
		}

		const profession = professionValue as ProfessionType
		this.itemTypeProfession.set(itemType, profession)
		const count = this.itemTypeCounts.get(itemType) || 0
		if (count > 0) {
			this.professionToolCounts[profession] = (this.professionToolCounts[profession] || 0) + count
			this.notifyUpdate()
		}
	}

	public getAvailability(): Record<ProfessionType, boolean> {
		return {
			[ProfessionType.Carrier]: false,
			[ProfessionType.Builder]: this.professionToolCounts[ProfessionType.Builder] > 0,
			[ProfessionType.Woodcutter]: this.professionToolCounts[ProfessionType.Woodcutter] > 0,
			[ProfessionType.Miner]: this.professionToolCounts[ProfessionType.Miner] > 0
		}
	}

	public onUpdate(callback: UpdateCallback): () => void {
		this.updateCallbacks.add(callback)
		return () => {
			this.updateCallbacks.delete(callback)
		}
	}

	private notifyUpdate(): void {
		this.updateCallbacks.forEach(callback => callback())
	}
}

export const toolAvailabilityService = new ToolAvailabilityService()
