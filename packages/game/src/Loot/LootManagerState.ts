import type { DroppedItem } from './types'
import type { LootSnapshot } from '../state/types'

export class LootManagerState {
	public droppedItems = new Map<string, DroppedItem[]>()
	public itemIdToMapId = new Map<string, string>()
	public itemReservations = new Map<string, string>()
	public simulationTimeMs = 0

	public serialize(): LootSnapshot {
		return {
			droppedItems: Array.from(this.droppedItems.entries()).map(([mapId, items]) => ([
				mapId,
				items.map(item => ({
					...item,
					position: { ...item.position }
				}))
			])),
			itemReservations: Array.from(this.itemReservations.entries())
		}
	}

	public deserialize(state: LootSnapshot): void {
		this.droppedItems.clear()
		this.itemIdToMapId.clear()
		this.itemReservations.clear()
		for (const [mapId, items] of state.droppedItems) {
			const nextItems = items.map(item => ({
				...item,
				position: { ...item.position }
			}))
			this.droppedItems.set(mapId, nextItems)
			for (const item of nextItems) {
				this.itemIdToMapId.set(item.id, mapId)
			}
		}
		for (const [itemId, ownerId] of state.itemReservations) {
			this.itemReservations.set(itemId, ownerId)
		}
	}

	public reset(): void {
		this.droppedItems.clear()
		this.itemIdToMapId.clear()
		this.itemReservations.clear()
	}
}
