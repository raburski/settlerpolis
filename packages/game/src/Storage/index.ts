import { EventManager } from '../events'
import type { BuildingManager } from '../Buildings'
import type { ItemsManager } from '../Items'
import type { MapObjectsManager } from '../MapObjects'
import type { MapManager } from '../Map'
import { Logger } from '../Logs'
import { StorageEvents } from './events'
import { BuildingStorage, StorageReservation, StorageReservationResult, StorageSlot, StorageReservationStatus } from './types'
import { v4 as uuidv4 } from 'uuid'
import { Receiver } from '../Receiver'
import { SimulationEvents } from '../Simulation/events'
import { SimulationTickData } from '../Simulation/types'
import { BaseManager } from '../Managers'
import type { Position } from '../types'
import type { Item } from '../Items/types'
import { ConstructionStage } from '../Buildings/types'
import type { StorageSnapshot, BuildingStorageSnapshot } from '../state/types'

export interface StorageDeps {
	buildings: BuildingManager
	items: ItemsManager
	mapObjects: MapObjectsManager
	map: MapManager
}

export class StorageManager extends BaseManager<StorageDeps> {
	private buildingStorages: Map<string, BuildingStorage> = new Map() // buildingInstanceId -> BuildingStorage
	private reservations: Map<string, StorageReservation> = new Map()  // reservationId -> StorageReservation
	private readonly STORAGE_TICK_INTERVAL_MS = 5000
	private readonly GAME_DAY_MS = 24 * 60 * 1000
	private tickAccumulatorMs = 0
	private simulationTimeMs = 0

	constructor(
		managers: StorageDeps,
		private event: EventManager,
		private logger: Logger
	) {
		super(managers)
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

	private getTileSize(mapId: string): number {
		const map = this.managers.map.getMap(mapId)
		return map?.tiledMap.tilewidth || 32
	}

	private getPileSize(itemType: string): number {
		const metadata = this.managers.items.getItemMetadata(itemType)
		return Math.max(1, metadata?.maxStackSize || 1)
	}

	private getSlotsForItem(storage: BuildingStorage, itemType: string): StorageSlot[] {
		const slotIds = storage.slotsByItem.get(itemType) || []
		return slotIds.map(id => storage.slots.get(id)).filter(Boolean) as StorageSlot[]
	}

	private getStorageSlotByReservation(reservationId?: string): StorageSlot | null {
		if (!reservationId) {
			return null
		}
		const reservation = this.reservations.get(reservationId)
		if (!reservation?.slotId) {
			return null
		}
		const storage = this.buildingStorages.get(reservation.buildingInstanceId)
		if (!storage) {
			return null
		}
		return storage.slots.get(reservation.slotId) || null
	}

	private placePileObject(slot: StorageSlot): void {
		if (slot.hidden) {
			return
		}
		if (slot.mapObjectId) {
			return
		}
		const building = this.managers.buildings.getBuildingInstance(slot.buildingInstanceId)
		if (!building) {
			return
		}

		const item: Item = {
			id: uuidv4(),
			itemType: slot.itemType
		}

		const fakeClient = {
			id: 'world',
			currentGroup: building.mapId,
			emit: (receiver: Receiver, event: string, data: any, target?: string) => {
				this.event.emit(receiver, event, data, target)
			},
			setGroup: () => {}
		}

		const mapObject = this.managers.mapObjects.placeObject('world', {
			position: slot.position,
			item,
			metadata: {
				storagePile: true,
				storageSlotId: slot.slotId,
				itemType: slot.itemType
			}
		}, fakeClient)

		if (!mapObject) {
			this.logger.warn(`[StorageManager] Failed to place pile for slot ${slot.slotId}`)
			return
		}

		slot.mapObjectId = mapObject.id
	}

	private removePileObject(slot: StorageSlot): void {
		if (slot.hidden) {
			if (slot.mapObjectId) {
				slot.mapObjectId = undefined
			}
			return
		}
		if (!slot.mapObjectId) {
			return
		}
		const building = this.managers.buildings.getBuildingInstance(slot.buildingInstanceId)
		if (!building) {
			return
		}
		this.managers.mapObjects.removeObjectById(slot.mapObjectId, building.mapId)
		slot.mapObjectId = undefined
	}

	private updatePileForSlot(slot: StorageSlot): void {
		if (slot.hidden) {
			this.emitSlotUpdated(slot)
			return
		}
		if (slot.quantity > 0) {
			this.placePileObject(slot)
		} else {
			this.removePileObject(slot)
		}
		this.emitSlotUpdated(slot)
	}

	private emitSlotUpdated(slot: StorageSlot): void {
		const building = this.managers.buildings.getBuildingInstance(slot.buildingInstanceId)
		if (!building) {
			return
		}
		this.event.emit(Receiver.Group, StorageEvents.SC.StorageSlotUpdated, {
			slotId: slot.slotId,
			buildingInstanceId: slot.buildingInstanceId,
			itemType: slot.itemType,
			quantity: slot.quantity,
			position: slot.position
		}, building.mapId)
	}

	// Initialize storage for a building using fixed slots
	public initializeBuildingStorage(buildingInstanceId: string): void {
		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			this.logger.warn(`[StorageManager] Cannot initialize storage: Building ${buildingInstanceId} not found`)
			return
		}

		const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
		if (!definition) {
			this.logger.warn(`[StorageManager] Cannot initialize storage: Building definition ${building.buildingId} not found`)
			return
		}

		if (!definition.storage || !definition.storage.slots || definition.storage.slots.length === 0) {
			return
		}

		if (this.buildingStorages.has(buildingInstanceId)) {
			this.logger.log(`[StorageManager] Storage already initialized for building ${buildingInstanceId}`)
			return
		}

		const storage: BuildingStorage = {
			buildingInstanceId,
			slots: new Map(),
			slotsByItem: new Map()
		}

		const tileSize = this.getTileSize(building.mapId)
		for (const slotDef of definition.storage.slots) {
			const basePileSize = this.getPileSize(slotDef.itemType)
			const pileSize = typeof slotDef.maxQuantity === 'number'
				? Math.max(1, Math.min(basePileSize, slotDef.maxQuantity))
				: basePileSize
			const slotId = uuidv4()
			const position: Position = {
				x: building.position.x + slotDef.offset.x * tileSize,
				y: building.position.y + slotDef.offset.y * tileSize
			}

			const slot: StorageSlot = {
				slotId,
				buildingInstanceId,
				itemType: slotDef.itemType,
				position,
				pileSize,
				quantity: 0,
				batches: [],
				reservedIncoming: 0,
				reservedOutgoing: 0,
				hidden: slotDef.hidden
			}

			storage.slots.set(slotId, slot)
			if (!storage.slotsByItem.has(slotDef.itemType)) {
				storage.slotsByItem.set(slotDef.itemType, [])
			}
			storage.slotsByItem.get(slotDef.itemType)!.push(slotId)
		}

		this.buildingStorages.set(buildingInstanceId, storage)
		this.logger.log(`[StorageManager] Initialized storage with ${storage.slots.size} slots for building ${buildingInstanceId}`)
	}

	// Get building storage
	public getBuildingStorage(buildingInstanceId: string): BuildingStorage | undefined {
		return this.buildingStorages.get(buildingInstanceId)
	}

	// Remove storage for a demolished/removed building
	public removeBuildingStorage(buildingInstanceId: string): void {
		const storage = this.buildingStorages.get(buildingInstanceId)
		if (!storage) {
			return
		}

		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (building) {
			for (const slot of storage.slots.values()) {
				if (slot.mapObjectId) {
					this.managers.mapObjects.removeObjectById(slot.mapObjectId, building.mapId)
					slot.mapObjectId = undefined
				}
			}
		}

		for (const [reservationId, reservation] of this.reservations.entries()) {
			if (reservation.buildingInstanceId === buildingInstanceId) {
				this.reservations.delete(reservationId)
			}
		}

		this.buildingStorages.delete(buildingInstanceId)
	}

	// Reserve storage space for delivery (incoming or outgoing) at a specific slot
	public reserveStorage(buildingInstanceId: string, itemType: string, quantity: number, reservedBy: string, isOutgoing: boolean = false, allowInternal: boolean = false): StorageReservationResult | null {
		const storage = this.buildingStorages.get(buildingInstanceId)
		if (!storage) {
			this.logger.warn(`[StorageManager] Cannot reserve storage: Building ${buildingInstanceId} has no storage`)
			return null
		}

		if (isOutgoing && !allowInternal && !this.canReserveOutgoing(buildingInstanceId, itemType)) {
			this.logger.warn(`[StorageManager] Outgoing blocked for ${itemType} in building ${buildingInstanceId}`)
			return null
		}

		const capacity = this.getStorageCapacity(buildingInstanceId, itemType)
		if (capacity === 0) {
			this.logger.warn(`[StorageManager] Cannot reserve storage: Building ${buildingInstanceId} does not accept item type ${itemType}`)
			return null
		}

		let slots = this.getSlotsForItem(storage, itemType)
		if (slots.length === 0) {
			this.logger.warn(`[StorageManager] Cannot reserve storage: No slots for ${itemType} in building ${buildingInstanceId}`)
			return null
		}
		if (isOutgoing && !allowInternal) {
			slots = slots.filter(slot => !slot.hidden)
			if (slots.length === 0) {
				this.logger.warn(`[StorageManager] Cannot reserve outgoing storage: All slots for ${itemType} are hidden in ${buildingInstanceId}`)
				return null
			}
		}

		let slot: StorageSlot | undefined
		if (isOutgoing) {
			slot = slots.find(candidate => (candidate.quantity - candidate.reservedOutgoing) >= quantity)
			if (!slot) {
				this.logger.warn(`[StorageManager] Cannot reserve outgoing storage: Not enough items in any slot (requested: ${quantity})`)
				return null
			}
			slot.reservedOutgoing += quantity
		} else {
			slot = slots.find(candidate => (candidate.pileSize - candidate.quantity - candidate.reservedIncoming) >= quantity)
			if (!slot) {
				this.logger.warn(`[StorageManager] Cannot reserve incoming storage: Not enough capacity in any slot (requested: ${quantity})`)
				return null
			}
			slot.reservedIncoming += quantity
		}

		const reservationId = uuidv4()
		const reservation: StorageReservation = {
			reservationId,
			buildingInstanceId,
			itemType,
			quantity,
			reservedBy,
			status: StorageReservationStatus.Pending,
			createdAt: this.simulationTimeMs,
			isOutgoing,
			slotId: slot.slotId
		}

		this.reservations.set(reservationId, reservation)

		this.logger.log(`[StorageManager] Reserved ${quantity} ${itemType} in slot ${slot.slotId} for building ${buildingInstanceId} (reservation: ${reservationId}, outgoing: ${isOutgoing})`)

		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (building) {
			this.event.emit(Receiver.Group, StorageEvents.SC.ReservationCreated, {
				reservationId,
				buildingInstanceId,
				itemType,
				quantity,
				reservedBy
			}, building.mapId)
		}

		return {
			reservationId,
			slotId: slot.slotId,
			position: slot.position,
			quantity
		}
	}

	public allowsOutgoing(buildingInstanceId: string, itemType: string): boolean {
		return this.canReserveOutgoing(buildingInstanceId, itemType)
	}

	private canReserveOutgoing(buildingInstanceId: string, itemType: string): boolean {
		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return false
		}
		const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
		if (!definition) {
			return false
		}

		if (definition.spawnsSettlers) {
			return false
		}

		const consumes = definition.consumes?.some(entry => entry.itemType === itemType)
		if (consumes) {
			return false
		}

		const recipeInputs = definition.productionRecipe?.inputs?.some(entry => entry.itemType === itemType)
		if (recipeInputs) {
			return false
		}

		const autoInputs = definition.autoProduction?.inputs?.some(entry => entry.itemType === itemType)
		if (autoInputs) {
			return false
		}

		return true
	}

	private addToSlotBatches(slot: StorageSlot, quantity: number): void {
		if (quantity <= 0) {
			return
		}
		slot.batches.push({ quantity, storedAtMs: this.simulationTimeMs })
	}

	private removeFromSlotBatches(slot: StorageSlot, quantity: number): void {
		let remaining = quantity
		while (remaining > 0 && slot.batches.length > 0) {
			const batch = slot.batches[0]
			const take = Math.min(batch.quantity, remaining)
			batch.quantity -= take
			remaining -= take
			if (batch.quantity <= 0) {
				slot.batches.shift()
			}
		}
	}

	private emitStorageUpdated(buildingInstanceId: string, itemType: string): void {
		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return
		}
		const current = this.getCurrentQuantity(buildingInstanceId, itemType)
		const capacity = this.getStorageCapacity(buildingInstanceId, itemType)
		this.event.emit(Receiver.Group, StorageEvents.SC.StorageUpdated, {
			buildingInstanceId,
			itemType,
			quantity: current,
			capacity
		}, building.mapId)
	}

	private getSpoilageMultiplier(buildingInstanceId: string): number {
		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return 1
		}
		const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
		const multiplier = definition?.storage?.preservation?.spoilageMultiplier
		if (typeof multiplier !== 'number') {
			return 1
		}
		return Math.max(0, multiplier)
	}

	private applySpoilage(slot: StorageSlot, quantity: number): void {
		if (quantity <= 0) {
			return
		}
		const removed = Math.min(quantity, slot.quantity)
		if (removed <= 0) {
			return
		}

		slot.quantity = Math.max(0, slot.quantity - removed)
		this.removeFromSlotBatches(slot, removed)
		this.updatePileForSlot(slot)

		this.emitStorageUpdated(slot.buildingInstanceId, slot.itemType)

		const building = this.managers.buildings.getBuildingInstance(slot.buildingInstanceId)
		if (building) {
			this.event.emit(Receiver.Group, StorageEvents.SC.Spoilage, {
				buildingInstanceId: slot.buildingInstanceId,
				slotId: slot.slotId,
				itemType: slot.itemType,
				spoiledQuantity: removed,
				position: slot.position
			}, building.mapId)
		}
	}

	private maybeSpoilSlot(slot: StorageSlot): void {
		if (slot.quantity <= 0 || slot.batches.length === 0) {
			return
		}

		const metadata = this.managers.items.getItemMetadata(slot.itemType)
		const spoilage = metadata?.spoilage
		if (!spoilage) {
			return
		}

		const oldestBatch = slot.batches[0]
		if (!oldestBatch) {
			return
		}

		const ageMs = this.simulationTimeMs - oldestBatch.storedAtMs
		if (ageMs <= 0) {
			return
		}

		const shelfLifeDays = spoilage.shelfLifeDays
		if (!shelfLifeDays || shelfLifeDays <= 0) {
			return
		}

		const ageDays = ageMs / this.GAME_DAY_MS
		const over = ageDays / shelfLifeDays - 1
		if (over <= 0) {
			return
		}

		const baseRatePerDay = spoilage.baseRatePerDay ?? 0
		if (baseRatePerDay <= 0) {
			return
		}

		const preservation = this.getSpoilageMultiplier(slot.buildingInstanceId)
		const hazardPerDay = baseRatePerDay * over * over * preservation
		const deltaDays = this.STORAGE_TICK_INTERVAL_MS / this.GAME_DAY_MS
		const chance = Math.min(1, hazardPerDay * deltaDays)
		if (chance <= 0 || Math.random() >= chance) {
			return
		}

		const spoilableQty = Math.max(0, slot.quantity - slot.reservedOutgoing)
		if (spoilableQty <= 0) {
			return
		}

		const lossMin = Math.max(0, Math.min(1, spoilage.lossMinPct ?? 0))
		const lossMax = Math.max(lossMin, Math.min(1, spoilage.lossMaxPct ?? lossMin))
		const lossPct = lossMin + Math.random() * (lossMax - lossMin)
		const oldestQty = Math.min(oldestBatch.quantity, spoilableQty)
		const spoiled = Math.max(1, Math.floor(oldestQty * lossPct))
		const spoilQty = Math.min(oldestQty, spoiled)

		this.logger.log(`[StorageManager] Spoilage event: ${spoilQty} ${slot.itemType} in slot ${slot.slotId}`)
		this.applySpoilage(slot, spoilQty)
	}

	// Add items to building storage
	public addToStorage(buildingInstanceId: string, itemType: string, quantity: number, reservationId?: string): boolean {
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

		let slot = this.getStorageSlotByReservation(reservationId)
		if (!slot) {
			const slots = this.getSlotsForItem(storage, itemType)
			slot = slots.find(candidate => (candidate.pileSize - candidate.quantity - candidate.reservedIncoming) >= quantity) || null
		}

		if (!slot) {
			this.logger.warn(`[StorageManager] Cannot add to storage: No slot capacity for ${itemType} (requested: ${quantity})`)
			return false
		}

		if (slot.pileSize - slot.quantity < quantity) {
			this.logger.warn(`[StorageManager] Cannot add to storage: Slot full for ${itemType} (requested: ${quantity})`)
			return false
		}

		slot.quantity += quantity
		this.addToSlotBatches(slot, quantity)
		this.updatePileForSlot(slot)

		const current = this.getCurrentQuantity(buildingInstanceId, itemType)

		this.logger.log(`[StorageManager] Added ${quantity} ${itemType} to building ${buildingInstanceId} (current: ${current}/${capacity})`)

		// Emit storage updated event
		this.emitStorageUpdated(buildingInstanceId, itemType)

		if (reservationId) {
			this.completeReservation(reservationId)
		}

		return true
	}

	// Remove items from building storage
	public removeFromStorage(buildingInstanceId: string, itemType: string, quantity: number, reservationId?: string): boolean {
		const storage = this.buildingStorages.get(buildingInstanceId)
		if (!storage) {
			this.logger.warn(`[StorageManager] Cannot remove from storage: Building ${buildingInstanceId} has no storage`)
			return false
		}

		let slot = this.getStorageSlotByReservation(reservationId)
		if (!slot) {
			const slots = this.getSlotsForItem(storage, itemType)
			slot = slots.find(candidate => (candidate.quantity - candidate.reservedOutgoing) >= quantity) || null
		}

		if (!slot) {
			this.logger.warn(`[StorageManager] Cannot remove from storage: No slot has ${quantity} ${itemType}`)
			return false
		}

		if (slot.quantity < quantity) {
			this.logger.warn(`[StorageManager] Cannot remove from storage: Slot does not have enough ${itemType}`)
			return false
		}

		slot.quantity = Math.max(0, slot.quantity - quantity)
		this.removeFromSlotBatches(slot, quantity)
		this.updatePileForSlot(slot)

		const current = this.getCurrentQuantity(buildingInstanceId, itemType)
		const capacity = this.getStorageCapacity(buildingInstanceId, itemType)

		this.logger.log(`[StorageManager] Removed ${quantity} ${itemType} from building ${buildingInstanceId} (current: ${current}/${capacity})`)
		this.emitStorageUpdated(buildingInstanceId, itemType)

		if (reservationId) {
			this.completeReservation(reservationId)
		}

		return true
	}

	// Check if building has available storage for item type
	public hasAvailableStorage(buildingInstanceId: string, itemType: string, quantity: number): boolean {
		const storage = this.buildingStorages.get(buildingInstanceId)
		if (!storage) {
			return false
		}
		const slots = this.getSlotsForItem(storage, itemType)
		return slots.some(slot => (slot.pileSize - slot.quantity - slot.reservedIncoming) >= quantity)
	}

	// Check if building accepts item type
	// Returns true if itemType has a capacity defined in BuildingDefinition
	public acceptsItemType(buildingInstanceId: string, itemType: string): boolean {
		return this.getStorageCapacity(buildingInstanceId, itemType) > 0
	}

	// Get storage capacity for item type (reads from BuildingDefinition)
	public getStorageCapacity(buildingInstanceId: string, itemType: string): number {
		const storage = this.buildingStorages.get(buildingInstanceId)
		if (storage) {
			const slots = this.getSlotsForItem(storage, itemType)
			if (slots.length > 0) {
				return slots.reduce((sum, slot) => sum + slot.pileSize, 0)
			}
		}

		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return 0
		}

		const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
		if (!definition || !definition.storage) {
			return 0
		}
		if (definition.storage.slots && definition.storage.slots.length > 0) {
			const pileSize = this.getPileSize(itemType)
			const slotCount = definition.storage.slots.filter(slot => slot.itemType === itemType).length
			return slotCount * pileSize
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
		const slots = this.getSlotsForItem(storage, itemType)
		return slots.reduce((sum, slot) => sum + Math.max(0, slot.quantity - slot.reservedOutgoing), 0)
	}

	// Get current quantity for an item type
	public getCurrentQuantity(buildingInstanceId: string, itemType: string): number {
		const storage = this.buildingStorages.get(buildingInstanceId)
		if (!storage) {
			return 0
		}
		const slots = this.getSlotsForItem(storage, itemType)
		return slots.reduce((sum, slot) => sum + slot.quantity, 0)
	}

	// Get total quantity across all storages for a map
	public getTotalQuantity(mapId: string, itemType: string): number {
		let total = 0
		for (const building of this.managers.buildings.getAllBuildings()) {
			if (building.mapId !== mapId) {
				continue
			}
			total += this.getCurrentQuantity(building.id, itemType)
		}
		return total
	}

	// Remove items from any storage in a map
	public consumeFromAnyStorage(mapId: string, itemType: string, quantity: number): boolean {
		if (quantity <= 0) {
			return true
		}

		let remaining = quantity
		for (const building of this.managers.buildings.getAllBuildings()) {
			if (building.mapId !== mapId) {
				continue
			}
			const current = this.getCurrentQuantity(building.id, itemType)
			if (current <= 0) {
				continue
			}
			const toRemove = Math.min(current, remaining)
			if (!this.removeFromStorage(building.id, itemType, toRemove)) {
				continue
			}
			remaining -= toRemove
			if (remaining <= 0) {
				return true
			}
		}

		return false
	}

	// Release storage reservation
	public releaseReservation(reservationId: string): void {
		const reservation = this.reservations.get(reservationId)
		if (!reservation) {
			this.logger.warn(`[StorageManager] Cannot release reservation: Reservation ${reservationId} not found`)
			return
		}
		if (reservation.status === StorageReservationStatus.Cancelled || reservation.status === StorageReservationStatus.Delivered) {
			return
		}
		const storage = this.buildingStorages.get(reservation.buildingInstanceId)
		if (storage && reservation.slotId) {
			const slot = storage.slots.get(reservation.slotId)
			if (slot) {
				if (reservation.isOutgoing) {
					slot.reservedOutgoing = Math.max(0, slot.reservedOutgoing - reservation.quantity)
				} else {
					slot.reservedIncoming = Math.max(0, slot.reservedIncoming - reservation.quantity)
				}
			}
		}

		reservation.status = StorageReservationStatus.Cancelled
		this.reservations.delete(reservationId)

		this.logger.log(`[StorageManager] Released reservation ${reservationId}`)

		// Emit reservation cancelled event
		const building = this.managers.buildings.getBuildingInstance(reservation.buildingInstanceId)
		if (building) {
			this.event.emit(Receiver.Group, StorageEvents.SC.ReservationCancelled, {
				reservationId,
				buildingInstanceId: reservation.buildingInstanceId,
				itemType: reservation.itemType,
				quantity: reservation.quantity
			}, building.mapId)
		}
	}

	public completeReservation(reservationId: string): void {
		const reservation = this.reservations.get(reservationId)
		if (!reservation) {
			return
		}
		if (reservation.status === StorageReservationStatus.Cancelled || reservation.status === StorageReservationStatus.Delivered) {
			return
		}
		const storage = this.buildingStorages.get(reservation.buildingInstanceId)
		if (storage && reservation.slotId) {
			const slot = storage.slots.get(reservation.slotId)
			if (slot) {
				if (reservation.isOutgoing) {
					slot.reservedOutgoing = Math.max(0, slot.reservedOutgoing - reservation.quantity)
				} else {
					slot.reservedIncoming = Math.max(0, slot.reservedIncoming - reservation.quantity)
				}
			}
		}

		reservation.status = StorageReservationStatus.Delivered
		this.logger.log(`[StorageManager] Completed reservation ${reservationId}`)
	}

	public hasReservation(reservationId: string): boolean {
		return this.reservations.has(reservationId)
	}

	// Get all buildings with available items of a specific type
	public getBuildingsWithAvailableItems(itemType: string, quantity: number, mapId: string, playerId: string): string[] {
		const buildings: string[] = []

		for (const [buildingInstanceId, storage] of this.buildingStorages.entries()) {
			const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
			if (!building || building.mapId !== mapId || building.playerId !== playerId) {
				continue
			}

			if (!this.allowsOutgoing(buildingInstanceId, itemType)) {
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
			if ((reservation.status === StorageReservationStatus.Cancelled || reservation.status === StorageReservationStatus.Delivered) &&
				(now - reservation.createdAt) > RESERVATION_CLEANUP_AGE) {
				this.reservations.delete(reservationId)
			}
		}

		for (const storage of this.buildingStorages.values()) {
			for (const slot of storage.slots.values()) {
				this.maybeSpoilSlot(slot)
			}
		}
	}

	serialize(): StorageSnapshot {
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
			simulationTimeMs: this.simulationTimeMs,
			tickAccumulatorMs: this.tickAccumulatorMs
		}
	}

	deserialize(state: StorageSnapshot): void {
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
		this.tickAccumulatorMs = state.tickAccumulatorMs

		this.initializeStorageForMissingBuildings()
		this.releaseStalePendingReservations()
		this.syncSlotCapacitiesFromDefinitions()
	}

	private initializeStorageForMissingBuildings(): void {
		const buildings = this.managers.buildings.getAllBuildings()
		for (const building of buildings) {
			if (building.stage !== ConstructionStage.Completed) {
				continue
			}
			const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
			if (!definition?.storage) {
				continue
			}
			if (this.buildingStorages.has(building.id)) {
				continue
			}
			this.initializeBuildingStorage(building.id)
		}
	}

	private releaseStalePendingReservations(): void {
		const MAX_PENDING_AGE_MS = 2 * 60 * 1000
		for (const reservation of this.reservations.values()) {
			if (reservation.status !== StorageReservationStatus.Pending) {
				continue
			}
			if (this.simulationTimeMs - reservation.createdAt < MAX_PENDING_AGE_MS) {
				continue
			}
			this.releaseReservation(reservation.reservationId)
		}
	}

	private syncSlotCapacitiesFromDefinitions(): void {
		for (const [buildingInstanceId, storage] of this.buildingStorages.entries()) {
			const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
			if (!building) {
				continue
			}
			const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
			if (!definition?.storage?.slots || definition.storage.slots.length === 0) {
				continue
			}
			const tileSize = this.getTileSize(building.mapId)
			for (const slotDef of definition.storage.slots) {
				if (typeof slotDef.maxQuantity !== 'number') {
					continue
				}
				const basePileSize = this.getPileSize(slotDef.itemType)
				const desiredPileSize = Math.max(1, Math.min(basePileSize, slotDef.maxQuantity))
				const expectedX = building.position.x + slotDef.offset.x * tileSize
				const expectedY = building.position.y + slotDef.offset.y * tileSize
				const slots = this.getSlotsForItem(storage, slotDef.itemType)
				const matched = slots.find(slot => Math.abs(slot.position.x - expectedX) < 0.01 && Math.abs(slot.position.y - expectedY) < 0.01)
				if (!matched) {
					continue
				}
				matched.pileSize = desiredPileSize
			}
		}
	}

	reset(): void {
		this.buildingStorages.clear()
		this.reservations.clear()
		this.simulationTimeMs = 0
		this.tickAccumulatorMs = 0
	}
}
