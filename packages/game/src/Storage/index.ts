import { EventManager } from '../events'
import { BuildingManager } from '../Buildings'
import { ItemsManager } from '../Items'
import { Logger } from '../Logs'
import { StorageEvents } from './events'
import { BuildingStorage, StorageReservation } from './types'
import { BuildingInstance } from '../Buildings/types'
import { v4 as uuidv4 } from 'uuid'
import { Receiver } from '../Receiver'
import { SimulationEvents } from '../Simulation/events'
import { SimulationTickData } from '../Simulation/types'

export class StorageManager {
	private buildingStorages: Map<string, BuildingStorage> = new Map() // buildingInstanceId -> BuildingStorage
	private reservations: Map<string, StorageReservation> = new Map()  // reservationId -> StorageReservation
	private readonly STORAGE_TICK_INTERVAL_MS = 5000
	private tickAccumulatorMs = 0
	private simulationTimeMs = 0

	constructor(
		private event: EventManager,
		private buildingManager: BuildingManager,
		private itemsManager: ItemsManager,
		private logger: Logger
	) {
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		// Listen for building completion to initialize storage
		this.event.on(StorageEvents.SS.StorageTick, () => {
			this.storageTick()
		})

		this.event.on(SimulationEvents.SS.Tick, (data: SimulationTickData) => {
			this.handleSimulationTick(data)
		})
	}

	private handleSimulationTick(data: SimulationTickData): void {
		this.simulationTimeMs = data.nowMs
		this.tickAccumulatorMs += data.deltaMs
		if (this.tickAccumulatorMs < this.STORAGE_TICK_INTERVAL_MS) {
			return
		}
		this.tickAccumulatorMs -= this.STORAGE_TICK_INTERVAL_MS
		this.event.emit(Receiver.All, StorageEvents.SS.StorageTick, {})
	}

	// Initialize storage for a building
	// Creates BuildingStorage with empty buffer (capacities are read from BuildingDefinition when needed)
	public initializeBuildingStorage(buildingInstanceId: string): void {
		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (!building) {
			this.logger.warn(`[StorageManager] Cannot initialize storage: Building ${buildingInstanceId} not found`)
			return
		}

		const definition = this.buildingManager.getBuildingDefinition(building.buildingId)
		if (!definition) {
			this.logger.warn(`[StorageManager] Cannot initialize storage: Building definition ${building.buildingId} not found`)
			return
		}

		// Only initialize if building has storage capacity defined
		if (!definition.storage) {
			return // Building has no storage capacity
		}

		// Check if storage already exists
		if (this.buildingStorages.has(buildingInstanceId)) {
			this.logger.log(`[StorageManager] Storage already initialized for building ${buildingInstanceId}`)
			return
		}

		const storage: BuildingStorage = {
			buildingInstanceId,
			buffer: new Map(),
			reserved: new Map()
		}

		this.buildingStorages.set(buildingInstanceId, storage)
		this.logger.log(`[StorageManager] Initialized storage for building ${buildingInstanceId}`)
	}

	// Get building storage
	public getBuildingStorage(buildingInstanceId: string): BuildingStorage | undefined {
		return this.buildingStorages.get(buildingInstanceId)
	}

	// Reserve storage space for delivery (incoming or outgoing)
	// For outgoing reservations (items already in storage): Only checks that items exist, doesn't reserve space
	// For incoming reservations (empty space): Checks that space is available and reserves it
	public reserveStorage(buildingInstanceId: string, itemType: string, quantity: number, reservedBy: string, isOutgoing: boolean = false): string | null {
		const storage = this.buildingStorages.get(buildingInstanceId)
		if (!storage) {
			this.logger.warn(`[StorageManager] Cannot reserve storage: Building ${buildingInstanceId} has no storage`)
			return null
		}

		const capacity = this.getStorageCapacity(buildingInstanceId, itemType)
		if (capacity === 0) {
			this.logger.warn(`[StorageManager] Cannot reserve storage: Building ${buildingInstanceId} does not accept item type ${itemType}`)
			return null
		}

		const current = storage.buffer.get(itemType) || 0
		const reserved = storage.reserved.get(itemType) || 0

		if (isOutgoing) {
			// For outgoing reservations: Check that items exist (they're already in storage)
			// Reserved items for outgoing transport don't block new production since they'll be removed
			if (current < quantity) {
				this.logger.warn(`[StorageManager] Cannot reserve outgoing storage: Not enough items. Current: ${current}, Requested: ${quantity}`)
				return null
			}
		} else {
			// For incoming reservations: Check that space is available
			const available = capacity - current - reserved
			if (available < quantity) {
				this.logger.warn(`[StorageManager] Cannot reserve incoming storage: Not enough capacity. Available: ${available}, Requested: ${quantity}`)
				return null
			}
		}

		const reservationId = uuidv4()
		const reservation: StorageReservation = {
			reservationId,
			buildingInstanceId,
			itemType,
			quantity,
			reservedBy,
			status: 'pending',
			createdAt: this.simulationTimeMs,
			isOutgoing
		}

		this.reservations.set(reservationId, reservation)
		storage.reserved.set(itemType, reserved + quantity)

		this.logger.log(`[StorageManager] Reserved ${quantity} ${itemType} for building ${buildingInstanceId} (reservation: ${reservationId}, outgoing: ${isOutgoing})`)

		// Emit reservation created event
		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (building) {
			this.event.emit(Receiver.Group, StorageEvents.SC.ReservationCreated, {
				reservationId,
				buildingInstanceId,
				itemType,
				quantity,
				reservedBy
			}, building.mapName)
		}

		return reservationId
	}

	// Add items to building storage
	public addToStorage(buildingInstanceId: string, itemType: string, quantity: number): boolean {
		const storage = this.buildingStorages.get(buildingInstanceId)
		if (!storage) {
			this.logger.warn(`[StorageManager] Cannot add to storage: Building ${buildingInstanceId} has no storage`)
			return false
		}

		const capacity = this.getStorageCapacity(buildingInstanceId, itemType)
		if (capacity === 0) {
			this.logger.warn(`[StorageManager] Cannot add to storage: Building ${buildingInstanceId} does not accept item type ${itemType}`)
			return false
		}

		const current = storage.buffer.get(itemType) || 0
		
		// Calculate incoming reservations (space reserved for delivery)
		// Only count reservations that are NOT outgoing (i.e., incoming reservations)
		let incomingReserved = 0
		for (const [reservationId, reservation] of this.reservations.entries()) {
			if (reservation.buildingInstanceId === buildingInstanceId &&
				reservation.itemType === itemType &&
				reservation.status !== 'cancelled' &&
				reservation.status !== 'delivered' &&
				!reservation.isOutgoing) {
				incomingReserved += reservation.quantity
			}
		}
		
		// Available space = capacity - current items - incoming reservations
		// Outgoing reservations don't reduce available space since those items will be removed
		const available = capacity - current - incomingReserved

		if (available < quantity) {
			this.logger.warn(`[StorageManager] Cannot add to storage: Not enough capacity. Available: ${available}, Requested: ${quantity}, Current: ${current}, Capacity: ${capacity}, IncomingReserved: ${incomingReserved}`)
			return false
		}

		storage.buffer.set(itemType, current + quantity)

		this.logger.log(`[StorageManager] Added ${quantity} ${itemType} to building ${buildingInstanceId} (current: ${current + quantity}/${capacity})`)

		// Emit storage updated event
		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (building) {
			this.event.emit(Receiver.Group, StorageEvents.SC.StorageUpdated, {
				buildingInstanceId,
				itemType,
				quantity: current + quantity,
				capacity
			}, building.mapName)
		}

		return true
	}

	// Remove items from building storage
	public removeFromStorage(buildingInstanceId: string, itemType: string, quantity: number): boolean {
		const storage = this.buildingStorages.get(buildingInstanceId)
		if (!storage) {
			this.logger.warn(`[StorageManager] Cannot remove from storage: Building ${buildingInstanceId} has no storage`)
			return false
		}

		const current = storage.buffer.get(itemType) || 0
		if (current < quantity) {
			this.logger.warn(`[StorageManager] Cannot remove from storage: Not enough items. Current: ${current}, Requested: ${quantity}`)
			return false
		}

		const newQuantity = current - quantity
		if (newQuantity === 0) {
			storage.buffer.delete(itemType)
		} else {
			storage.buffer.set(itemType, newQuantity)
		}

		const capacity = this.getStorageCapacity(buildingInstanceId, itemType)

		this.logger.log(`[StorageManager] Removed ${quantity} ${itemType} from building ${buildingInstanceId} (current: ${newQuantity}/${capacity})`)

		// Emit storage updated event
		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (building) {
			this.event.emit(Receiver.Group, StorageEvents.SC.StorageUpdated, {
				buildingInstanceId,
				itemType,
				quantity: newQuantity,
				capacity
			}, building.mapName)
		}

		return true
	}

	// Check if building has available storage for item type
	public hasAvailableStorage(buildingInstanceId: string, itemType: string, quantity: number): boolean {
		const capacity = this.getStorageCapacity(buildingInstanceId, itemType)
		if (capacity === 0) {
			return false
		}

		const storage = this.buildingStorages.get(buildingInstanceId)
		if (!storage) {
			return false
		}

		const current = storage.buffer.get(itemType) || 0
		
		// Calculate incoming reservations (space reserved for delivery)
		// Only count reservations that are NOT outgoing (i.e., incoming reservations)
		let incomingReserved = 0
		for (const [reservationId, reservation] of this.reservations.entries()) {
			if (reservation.buildingInstanceId === buildingInstanceId &&
				reservation.itemType === itemType &&
				reservation.status !== 'cancelled' &&
				reservation.status !== 'delivered' &&
				!reservation.isOutgoing) {
				incomingReserved += reservation.quantity
			}
		}
		
		// Available space = capacity - current items - incoming reservations
		// Outgoing reservations don't reduce available space since those items will be removed
		const available = capacity - current - incomingReserved

		return available >= quantity
	}

	// Check if building accepts item type
	// Returns true if itemType has a capacity defined in BuildingDefinition
	public acceptsItemType(buildingInstanceId: string, itemType: string): boolean {
		return this.getStorageCapacity(buildingInstanceId, itemType) > 0
	}

	// Get storage capacity for item type (reads from BuildingDefinition)
	public getStorageCapacity(buildingInstanceId: string, itemType: string): number {
		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return 0
		}

		const definition = this.buildingManager.getBuildingDefinition(building.buildingId)
		if (!definition || !definition.storage) {
			return 0
		}

		return definition.storage.capacities[itemType] || 0
	}

	// Get available quantity for an item type (items available for transport)
	// Returns: current items in storage minus items reserved for outgoing transport
	// This is used to check if a building has items that can be transported to other buildings
	public getAvailableQuantity(buildingInstanceId: string, itemType: string): number {
		const storage = this.buildingStorages.get(buildingInstanceId)
		if (!storage) {
			return 0
		}

		const current = storage.buffer.get(itemType) || 0
		
		// Calculate outgoing reservations (items reserved for transport away from this building)
		// Only count reservations that ARE outgoing (items being transported away)
		let outgoingReserved = 0
		for (const [reservationId, reservation] of this.reservations.entries()) {
			if (reservation.buildingInstanceId === buildingInstanceId &&
				reservation.itemType === itemType &&
				reservation.status !== 'cancelled' &&
				reservation.status !== 'delivered' &&
				reservation.isOutgoing) {
				outgoingReserved += reservation.quantity
			}
		}
		
		// Available items = current items - items reserved for outgoing transport
		// Incoming reservations don't affect available items (they're for empty space)
		return Math.max(0, current - outgoingReserved)
	}

	// Get current quantity for an item type
	public getCurrentQuantity(buildingInstanceId: string, itemType: string): number {
		const storage = this.buildingStorages.get(buildingInstanceId)
		if (!storage) {
			return 0
		}

		return storage.buffer.get(itemType) || 0
	}

	// Release storage reservation
	public releaseReservation(reservationId: string): void {
		const reservation = this.reservations.get(reservationId)
		if (!reservation) {
			this.logger.warn(`[StorageManager] Cannot release reservation: Reservation ${reservationId} not found`)
			return
		}

		const storage = this.buildingStorages.get(reservation.buildingInstanceId)
		if (storage) {
			const reserved = storage.reserved.get(reservation.itemType) || 0
			const newReserved = Math.max(0, reserved - reservation.quantity)
			if (newReserved === 0) {
				storage.reserved.delete(reservation.itemType)
			} else {
				storage.reserved.set(reservation.itemType, newReserved)
			}
		}

		reservation.status = 'cancelled'
		this.reservations.delete(reservationId)

		this.logger.log(`[StorageManager] Released reservation ${reservationId}`)

		// Emit reservation cancelled event
		const building = this.buildingManager.getBuildingInstance(reservation.buildingInstanceId)
		if (building) {
			this.event.emit(Receiver.Group, StorageEvents.SC.ReservationCancelled, {
				reservationId,
				buildingInstanceId: reservation.buildingInstanceId,
				itemType: reservation.itemType,
				quantity: reservation.quantity
			}, building.mapName)
		}
	}

	public hasReservation(reservationId: string): boolean {
		return this.reservations.has(reservationId)
	}

	// Get all buildings with available items of a specific type
	public getBuildingsWithAvailableItems(itemType: string, quantity: number, mapName: string, playerId: string): string[] {
		const buildings: string[] = []

		for (const [buildingInstanceId, storage] of this.buildingStorages.entries()) {
			const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
			if (!building || building.mapName !== mapName || building.playerId !== playerId) {
				continue
			}

			const available = this.getAvailableQuantity(buildingInstanceId, itemType)
			if (available >= quantity) {
				buildings.push(buildingInstanceId)
			}
		}

		return buildings
	}

	private storageTick(): void {
		// Periodic storage management tasks
		// For now, just cleanup old cancelled reservations
		const now = this.simulationTimeMs
		const RESERVATION_CLEANUP_AGE = 60000 // 1 minute

		for (const [reservationId, reservation] of this.reservations.entries()) {
			if (reservation.status === 'cancelled' && (now - reservation.createdAt) > RESERVATION_CLEANUP_AGE) {
				this.reservations.delete(reservationId)
			}
		}
	}
}
