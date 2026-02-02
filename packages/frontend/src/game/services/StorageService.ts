import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'

interface BuildingStorage {
	buildingInstanceId: string
	items: Record<string, number> // itemType -> quantity
	capacities: Record<string, number> // itemType -> capacity
}

interface StorageSlotState {
	slotId: string
	buildingInstanceId: string
	itemType: string
	quantity: number
	position: { x: number, y: number }
}

class StorageServiceClass {
	private buildingStorages = new Map<string, BuildingStorage>() // buildingInstanceId -> BuildingStorage
	private slotStates = new Map<string, StorageSlotState>() // slotId -> state

	constructor() {
		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		// Handle storage updated
		EventBus.on(Event.Storage.SC.StorageUpdated, (data: {
			buildingInstanceId: string
			itemType: string
			quantity: number
			capacity: number
		}) => {
			let storage = this.buildingStorages.get(data.buildingInstanceId)
			if (!storage) {
				storage = {
					buildingInstanceId: data.buildingInstanceId,
					items: {},
					capacities: {}
				}
				this.buildingStorages.set(data.buildingInstanceId, storage)
			}

			// Update item quantity
			storage.items[data.itemType] = data.quantity
			storage.capacities[data.itemType] = data.capacity

			// Emit UI event for reactive updates
			EventBus.emit('ui:storage:updated', {
				buildingInstanceId: data.buildingInstanceId,
				storage: { ...storage }
			})
		})

		// Handle reservation created
		EventBus.on(Event.Storage.SC.ReservationCreated, (data: {
			reservationId: string
			buildingInstanceId: string
			itemType: string
			quantity: number
			reservedBy: string
		}) => {
			// Reservations are handled server-side, but we can log them for debugging
			console.log('[StorageService] Reservation created:', data)
		})

		// Handle reservation cancelled
		EventBus.on(Event.Storage.SC.ReservationCancelled, (data: {
			reservationId: string
			buildingInstanceId: string
			itemType: string
			quantity: number
		}) => {
			console.log('[StorageService] Reservation cancelled:', data)
		})

		EventBus.on(Event.Storage.SC.StorageSlotUpdated, (data: StorageSlotState) => {
			this.slotStates.set(data.slotId, { ...data })
			EventBus.emit('ui:storage:slot-updated', { ...data })
		})
	}

	// Get storage for a building
	public getBuildingStorage(buildingInstanceId: string): BuildingStorage | undefined {
		return this.buildingStorages.get(buildingInstanceId)
	}

	// Get item quantity for a building
	public getItemQuantity(buildingInstanceId: string, itemType: string): number {
		const storage = this.buildingStorages.get(buildingInstanceId)
		if (!storage) {
			return 0
		}
		return storage.items[itemType] || 0
	}

	// Get storage capacity for a building
	public getStorageCapacity(buildingInstanceId: string, itemType: string): number {
		const storage = this.buildingStorages.get(buildingInstanceId)
		if (!storage) {
			return 0
		}
		return storage.capacities[itemType] || 0
	}

	// Get all items in storage for a building
	public getStorageItems(buildingInstanceId: string): Record<string, number> {
		const storage = this.buildingStorages.get(buildingInstanceId)
		if (!storage) {
			return {}
		}
		return { ...storage.items }
	}

	public getSlotQuantity(slotId: string): number {
		return this.slotStates.get(slotId)?.quantity || 0
	}

	public getSlotState(slotId: string): StorageSlotState | undefined {
		return this.slotStates.get(slotId)
	}

	public getAllBuildingStorages(): BuildingStorage[] {
		return Array.from(this.buildingStorages.values()).map((storage) => ({
			buildingInstanceId: storage.buildingInstanceId,
			items: { ...storage.items },
			capacities: { ...storage.capacities }
		}))
	}
}

export const storageService = new StorageServiceClass()
