import type { Inventory } from './types'
import type { InventorySnapshot } from '../state/types'

export class InventoryState {
	public inventories = new Map<string, Inventory>()

	/* SERIALISATION */
	public serialize(): InventorySnapshot {
		return {
			inventories: Array.from(this.inventories.entries()).map(([playerId, inventory]) => ([
				playerId,
				{
					slots: inventory.slots.map(slot => ({
						position: { ...slot.position },
						item: slot.item ? { ...slot.item } : null
					}))
				}
			]))
		}
	}

	public deserialize(state: InventorySnapshot): void {
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

	public reset(): void {
		this.inventories.clear()
	}
}
