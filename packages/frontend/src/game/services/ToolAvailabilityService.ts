import { EventBus } from '../EventBus'
import { Event, DroppedItem, ProfessionType } from '@rugged/game'
import { itemService } from './ItemService'

type UpdateCallback = () => void

class ToolAvailabilityService {
	private itemTypesById = new Map<string, string>()
	private itemTypeCounts = new Map<string, number>()
	private itemTypeProfessions = new Map<string, ProfessionType[]>()
	private itemMetadataSubscriptions = new Map<string, () => void>()
	private updateCallbacks: Set<UpdateCallback> = new Set()
	private professionToolCounts: Record<ProfessionType, number> = {
		[ProfessionType.Carrier]: 0,
		[ProfessionType.Builder]: 0,
		[ProfessionType.Woodcutter]: 0,
		[ProfessionType.Miner]: 0,
		[ProfessionType.Metallurgist]: 0,
		[ProfessionType.Farmer]: 0,
		[ProfessionType.Miller]: 0,
		[ProfessionType.Baker]: 0,
		[ProfessionType.Vendor]: 0
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
			const hadProfessions = this.itemTypeProfessions.has(item.itemType)
			this.ensureItemTypeProfessions(item.itemType)
			if (hadProfessions) {
				const professions = this.itemTypeProfessions.get(item.itemType) || []
				professions.forEach(profession => {
					this.professionToolCounts[profession] = (this.professionToolCounts[profession] || 0) + 1
				})
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

		const professions = this.itemTypeProfessions.get(itemType) || []
		professions.forEach(profession => {
			const nextProfessionCount = (this.professionToolCounts[profession] || 0) - 1
			this.professionToolCounts[profession] = Math.max(0, nextProfessionCount)
		})
		this.notifyUpdate()
	}

	private ensureItemTypeProfessions(itemType: string): void {
		if (this.itemTypeProfessions.has(itemType)) {
			return
		}

		const metadata = itemService.getItemType(itemType)
		if (metadata) {
			this.setItemTypeProfessions(itemType, metadata.changesProfessions, metadata.changesProfession)
			return
		}

		if (this.itemMetadataSubscriptions.has(itemType)) {
			return
		}

		const unsubscribe = itemService.subscribeToItemMetadata(itemType, (itemMetadata) => {
			this.itemMetadataSubscriptions.delete(itemType)
			unsubscribe()
			this.setItemTypeProfessions(itemType, itemMetadata?.changesProfessions, itemMetadata?.changesProfession)
		})

		this.itemMetadataSubscriptions.set(itemType, unsubscribe)
	}

	private setItemTypeProfessions(itemType: string, professionsValue?: string[], professionValue?: string): void {
		const rawProfessions = (professionsValue && professionsValue.length > 0)
			? professionsValue
			: professionValue
				? [professionValue]
				: []
		const professions = rawProfessions.map((value) => value as ProfessionType)
		if (professions.length === 0) {
			this.itemTypeProfessions.set(itemType, [])
			return
		}

		this.itemTypeProfessions.set(itemType, professions)
		const count = this.itemTypeCounts.get(itemType) || 0
		if (count > 0) {
			professions.forEach(profession => {
				this.professionToolCounts[profession] = (this.professionToolCounts[profession] || 0) + count
			})
			this.notifyUpdate()
		}
	}

	public getAvailability(): Record<ProfessionType, boolean> {
		return {
			[ProfessionType.Carrier]: false,
			[ProfessionType.Builder]: this.professionToolCounts[ProfessionType.Builder] > 0,
			[ProfessionType.Woodcutter]: this.professionToolCounts[ProfessionType.Woodcutter] > 0,
			[ProfessionType.Miner]: this.professionToolCounts[ProfessionType.Miner] > 0,
			[ProfessionType.Metallurgist]: this.professionToolCounts[ProfessionType.Metallurgist] > 0,
			[ProfessionType.Farmer]: true,
			[ProfessionType.Miller]: true,
			[ProfessionType.Baker]: true,
			[ProfessionType.Vendor]: this.professionToolCounts[ProfessionType.Vendor] > 0
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
