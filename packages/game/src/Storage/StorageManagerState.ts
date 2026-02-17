import type { StorageReservation, StorageSlot, BuildingStorage } from './types'
import type { StorageSnapshot, BuildingStorageSnapshot } from '../state/types'

export class StorageManagerState {
	public buildingStorages: Map<string, BuildingStorage> = new Map()
	public reservations: Map<string, StorageReservation> = new Map()
	public simulationTimeMs = 0

	public serialize(): StorageSnapshot {
		const storages: BuildingStorageSnapshot[] = []
		for (const storage of this.buildingStorages.values()) {
			storages.push({
				buildingInstanceId: storage.buildingInstanceId,
				slots: Array.from(storage.slots.values()).map(slot => ({
					...slot,
					position: { ...slot.position },
					batches: slot.batches.map(batch => ({ ...batch }))
				})),
				slotsByItem: Array.from(storage.slotsByItem.entries()).map(([itemType, slotIds]) => ([
					itemType,
					[...slotIds]
				]))
			})
		}

		return {
			storages,
			reservations: Array.from(this.reservations.values()).map(reservation => ({ ...reservation })),
			simulationTimeMs: this.simulationTimeMs
		}
	}

	public deserialize(state: StorageSnapshot): void {
		this.buildingStorages.clear()
		this.reservations.clear()
		for (const storage of state.storages) {
			const slots = new Map<string, StorageSlot>()
			for (const slot of storage.slots) {
				slots.set(slot.slotId, {
					...slot,
					position: { ...slot.position },
					batches: slot.batches.map(batch => ({ ...batch }))
				})
			}
			const slotsByItem = new Map<string, string[]>()
			for (const [itemType, slotIds] of storage.slotsByItem) {
				slotsByItem.set(itemType, [...slotIds])
			}
			this.buildingStorages.set(storage.buildingInstanceId, {
				buildingInstanceId: storage.buildingInstanceId,
				slots,
				slotsByItem
			})
		}
		for (const reservation of state.reservations) {
			this.reservations.set(reservation.reservationId, { ...reservation })
		}
		this.simulationTimeMs = state.simulationTimeMs
	}

	public reset(): void {
		this.buildingStorages.clear()
		this.reservations.clear()
		this.simulationTimeMs = 0
	}
}
