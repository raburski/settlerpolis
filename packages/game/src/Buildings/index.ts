import { EventManager, Event, EventClient } from '../events'
import { BuildingsEvents } from './events'
import {
	BuildingDefinition,
	BuildingInstance,
	BuildingId,
	PlaceBuildingData,
	CancelBuildingData,
	ConstructionStage,
	BuildingCost,
	BuildingPlacedData,
	BuildingProgressData,
	BuildingCompletedData,
	BuildingCancelledData,
	ProductionStatus,
	ProductionRecipe,
	SetWorkAreaData,
	BuildingWorkAreaUpdatedData
} from './types'
import { Receiver } from '../Receiver'
import { v4 as uuidv4 } from 'uuid'
import type { InventoryManager } from '../Inventory'
import type { MapObjectsManager } from '../MapObjects'
import type { ItemsManager } from '../Items'
import type { MapManager } from '../Map'
import { PlayerJoinData, PlayerTransitionData } from '../Players/types'
import { PlaceObjectData } from '../MapObjects/types'
import { Item } from '../Items/types'
import { Position } from '../types'
import type { LootManager } from '../Loot'
import { Logger } from '../Logs'
import { SimulationEvents } from '../Simulation/events'
import { SimulationTickData } from '../Simulation/types'
import type { StorageManager } from '../Storage'
import { BaseManager } from '../Managers'
import type { BuildingsSnapshot, BuildingInstanceSnapshot } from '../state/types'

export interface BuildingDeps {
	inventory: InventoryManager
	mapObjects: MapObjectsManager
	items: ItemsManager
	map: MapManager
	loot: LootManager
	storage: StorageManager
}

export class BuildingManager extends BaseManager<BuildingDeps> {
	private buildings = new Map<string, BuildingInstance>() // buildingInstanceId -> BuildingInstance
	private definitions = new Map<BuildingId, BuildingDefinition>() // buildingId -> BuildingDefinition
	private buildingToMapObject = new Map<string, string>() // buildingInstanceId -> mapObjectId
	private readonly TICK_INTERVAL_MS = 1000 // Update construction progress every second
	private resourceRequests: Map<string, Set<string>> = new Map() // buildingInstanceId -> Set<itemType> (resources still needed)
	private assignedWorkers: Map<string, Set<string>> = new Map() // buildingInstanceId -> settlerIds
	private activeConstructionWorkers: Map<string, Set<string>> = new Map() // buildingInstanceId -> settlerIds (present at building)
	private simulationTimeMs = 0
	private tickAccumulatorMs = 0
	private autoProductionState = new Map<string, { status: ProductionStatus, progressMs: number, progress: number }>()

	constructor(
		managers: BuildingDeps,
		private event: EventManager,
		private logger: Logger,
		// managers provides Loot/Storage
	) {
		super(managers)
		this.setupEventHandlers()
		
		// Send building catalog to clients when they connect (in addition to when they join a map)
		// Note: Buildings might not be loaded yet, so we also send on player join
		this.event.onJoined((client) => {
			// Send catalog if buildings are already loaded
			// This ensures UI gets buildings even before player joins a map
			if (this.definitions.size > 0) {
				this.sendBuildingCatalog(client)
			}
		})
	}

	private setupEventHandlers() {
		// Handle building placement requests
		this.event.on<PlaceBuildingData>(BuildingsEvents.CS.Place, (data, client) => {
			this.placeBuilding(data, client)
		})

		// Handle building cancellation
		this.event.on<CancelBuildingData>(BuildingsEvents.CS.Cancel, (data, client) => {
			this.cancelBuilding(data, client)
		})
		
		// Handle work area updates
		this.event.on<SetWorkAreaData>(BuildingsEvents.CS.SetWorkArea, (data, client) => {
			this.setWorkArea(data, client)
		})

		// Handle player join to send existing buildings and building catalog
		this.event.on<PlayerJoinData>(Event.Players.CS.Join, (data, client) => {
			this.sendBuildingsToClient(client, data.mapId)
			this.sendBuildingCatalog(client)
		})

		// Handle player transition to send buildings for new map
		this.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, (data, client) => {
			this.sendBuildingsToClient(client, data.mapId)
		})

		// Drive construction progress from simulation ticks
		this.event.on(SimulationEvents.SS.Tick, (data: SimulationTickData) => {
			this.handleSimulationTick(data)
		})
	}

	private handleSimulationTick(data: SimulationTickData) {
		this.simulationTimeMs = data.nowMs
		this.tickAccumulatorMs += data.deltaMs
		if (this.tickAccumulatorMs < this.TICK_INTERVAL_MS) {
			return
		}
		this.tickAccumulatorMs -= this.TICK_INTERVAL_MS
		this.tick()
	}

	private tick() {
		const now = this.simulationTimeMs
		const buildingsToUpdate: BuildingInstance[] = []

		// Collect all buildings that need processing
		for (const building of this.buildings.values()) {
			if (building.stage === ConstructionStage.Constructing) {
				// Check if construction can progress
				if (this.canConstructionProgress(building)) {
					buildingsToUpdate.push(building)
				}
			}
			// Note: Completed buildings are not processed in the tick loop
		}

		// Update progress for buildings in Constructing stage with builders
		for (const building of buildingsToUpdate) {
			const definition = this.definitions.get(building.buildingId)
			if (!definition) continue

			const deltaSeconds = this.TICK_INTERVAL_MS / 1000
			const progress = this.calculateConstructionProgress(building, deltaSeconds)

			// Update building progress
			building.progress = progress
			building.stage = progress < 100 ? ConstructionStage.Constructing : ConstructionStage.Completed

			// Emit progress update
			const progressData: BuildingProgressData = {
				buildingInstanceId: building.id,
				progress,
				stage: building.stage
			}
			this.event.emit(Receiver.Group, BuildingsEvents.SC.Progress, progressData, building.mapId)

			// Check if construction is complete
			if (progress >= 100 && building.stage === ConstructionStage.Completed) {
				this.completeBuilding(building)
			}
		}

		// Handle auto-production for completed buildings
		for (const building of this.buildings.values()) {
			if (building.stage !== ConstructionStage.Completed) {
				continue
			}
			const definition = this.definitions.get(building.buildingId)
			if (!definition?.autoProduction) {
				continue
			}
			this.processAutoProduction(building, definition.autoProduction, this.TICK_INTERVAL_MS)
		}
	}

	private placeBuilding(data: PlaceBuildingData, client: EventClient) {
		const { buildingId, position } = data
		const definition = this.definitions.get(buildingId)

		if (!definition) {
			this.logger.error(`Building definition not found: ${buildingId}`)
			return
		}

		// Note: Resource validation removed - resources are collected from the ground by carriers
		// Building costs are just a blueprint of what's needed
		// Resources don't need to be in inventory to place a building

		// Check for collisions using building footprint
		if (this.checkBuildingCollision(client.currentGroup, position, definition)) {
			this.logger.error(`Cannot place building at position due to collision:`, position)
			// TODO: Emit error event to client
			return
		}

		// Create a placeholder item for the building foundation
		// We'll use a generic building item type - for Phase A, we assume this exists
		// or we create it on the fly. For now, let's create a simple item.
		const buildingItem: Item = {
			id: uuidv4(),
			itemType: 'building_foundation' // Generic building foundation item type
		}

		// Generate building instance ID first so we can use it in metadata
		const buildingInstanceId = uuidv4()

		// Place the building object on the map
		// Store building footprint in metadata so MapObjectsManager can use it for collision
		const placeObjectData: PlaceObjectData = {
			position,
			item: buildingItem,
			metadata: {
				buildingId,
				buildingInstanceId,
				stage: ConstructionStage.CollectingResources,
				progress: 0,
				footprint: {
					width: definition.footprint.width,
					height: definition.footprint.height
				}
			}
		}

		// Create building instance
		const buildingInstance: BuildingInstance = {
			id: buildingInstanceId,
			buildingId,
			playerId: client.id,
			mapId: client.currentGroup,
			position,
			stage: ConstructionStage.CollectingResources,
			progress: 0,
			startedAt: 0, // Will be set when construction starts (resources collected)
			createdAt: this.simulationTimeMs,
			collectedResources: new Map(),
			requiredResources: [],
			productionPaused: false
		}

		// Initialize building resources
		this.initializeBuildingResources(buildingInstance, definition)

		// Try to place the object
		const placedObject = this.managers.mapObjects.placeObject(client.id, placeObjectData, client)
		if (!placedObject) {
			this.logger.error(`Failed to place building at position:`, position)
			return
		}

		// Store mapping between building instance and map object
		this.buildingToMapObject.set(buildingInstance.id, placedObject.id)

		// Note: Resources are NOT removed from inventory on placement
		// Resources are collected from the ground by carriers and delivered to the building
		// The building costs are just a blueprint of what's needed

		// Store building instance
		this.buildings.set(buildingInstance.id, buildingInstance)

		// Emit placed event - send building with empty collectedResources (client will track via ResourcesChanged events)
		const clientBuilding = {
			...buildingInstance,
			collectedResources: {} as Record<string, number> // Empty initially, updated via ResourcesChanged events
		}
		// Remove server-only fields
		delete (clientBuilding as any).requiredResources
		const placedData: BuildingPlacedData = {
			building: clientBuilding as any
		}
		client.emit(Receiver.Group, BuildingsEvents.SC.Placed, placedData, client.currentGroup)
	}

	private cancelBuilding(data: CancelBuildingData, client: EventClient) {
		const { buildingInstanceId } = data
		const building = this.buildings.get(buildingInstanceId)

		if (!building) {
			this.logger.error(`Building instance not found: ${buildingInstanceId}`)
			return
		}

		// Verify ownership
		if (building.playerId !== client.id) {
			this.logger.error(`Player ${client.id} does not own building ${buildingInstanceId}`)
			return
		}

		const isDemolition = building.stage === ConstructionStage.Completed
		const refundedItems = isDemolition
			? this.calculateDemolitionRefund(building)
			: this.calculateCollectedRefund(building)

		this.dropRefundItems(building, refundedItems)
		this.removeBuildingInstance(building)

		// Emit cancelled event
		const cancelledData: BuildingCancelledData = {
			buildingInstanceId,
			refundedItems
		}
		client.emit(Receiver.Group, BuildingsEvents.SC.Cancelled, cancelledData, building.mapId)
	}

	private calculateCollectedRefund(building: BuildingInstance): BuildingCost[] {
		const refundedItems: BuildingCost[] = []
		for (const [itemType, quantity] of building.collectedResources.entries()) {
			if (quantity > 0) {
				refundedItems.push({ itemType, quantity })
			}
		}
		return refundedItems
	}

	private calculateDemolitionRefund(building: BuildingInstance): BuildingCost[] {
		const definition = this.definitions.get(building.buildingId)
		if (!definition) {
			return []
		}
		return definition.costs
			.map(cost => ({
				itemType: cost.itemType,
				quantity: Math.floor(cost.quantity * 0.5)
			}))
			.filter(cost => cost.quantity > 0)
	}

	private dropRefundItems(building: BuildingInstance, refundedItems: BuildingCost[]): void {
		if (!this.managers.loot || refundedItems.length === 0) {
			return
		}

		// Create fake client for dropping items
		const fakeClient: EventClient = {
			id: building.playerId,
			currentGroup: building.mapId,
			emit: (receiver, event, data, target?) => {
				this.event.emit(receiver, event, data, target)
			},
			setGroup: (_group: string) => {
				// No-op for fake client
			}
		}

		let dropIndex = 0
		for (const { itemType, quantity } of refundedItems) {
			for (let i = 0; i < quantity; i++) {
				const item: Item = {
					id: uuidv4(),
					itemType
				}
				// Drop item near building position (spread in a grid)
				const dropPosition = {
					x: building.position.x + (dropIndex % 3) * 32,
					y: building.position.y + Math.floor(dropIndex / 3) * 32
				}
				this.managers.loot.dropItem(item, dropPosition, fakeClient)
				dropIndex += 1
			}
		}
	}

	private removeBuildingInstance(building: BuildingInstance): void {
		// Clean up resource requests and worker tracking
		this.resourceRequests.delete(building.id)
		this.assignedWorkers.delete(building.id)
		this.activeConstructionWorkers.delete(building.id)
		this.autoProductionState.delete(building.id)

		// Remove storage piles/records before deleting the building
		if (this.managers.storage) {
			this.managers.storage.removeBuildingStorage(building.id)
		}

		// Remove building from map objects
		const mapObjectId = this.buildingToMapObject.get(building.id)
		if (mapObjectId) {
			this.managers.mapObjects.removeObjectById(mapObjectId, building.mapId)
			this.buildingToMapObject.delete(building.id)
		}

		// Remove building instance
		this.buildings.delete(building.id)
	}

	private setWorkArea(data: SetWorkAreaData, client: EventClient) {
		const { buildingInstanceId, center } = data
		const building = this.buildings.get(buildingInstanceId)
		if (!building) {
			this.logger.error(`Building instance not found: ${buildingInstanceId}`)
			return
		}

		// Verify ownership
		if (building.playerId !== client.id) {
			this.logger.error(`Player ${client.id} does not own building ${buildingInstanceId}`)
			return
		}

		building.workAreaCenter = { x: center.x, y: center.y }

		const updatedData: BuildingWorkAreaUpdatedData = {
			buildingInstanceId: building.id,
			center: building.workAreaCenter
		}

		this.event.emit(Receiver.Group, BuildingsEvents.SC.WorkAreaUpdated, updatedData, building.mapId)
	}

	// Initialize building with resource collection
	private initializeBuildingResources(building: BuildingInstance, definition: BuildingDefinition): void {
		// Initialize collectedResources map
		building.collectedResources = new Map()

		// Initialize requiredResources from definition.costs
		building.requiredResources = definition.costs.map(cost => ({
			itemType: cost.itemType,
			quantity: cost.quantity
		}))

		// Initialize resourceRequests set with all required item types
		const neededResources = new Set<string>()
		for (const cost of building.requiredResources) {
			neededResources.add(cost.itemType)
		}
		this.resourceRequests.set(building.id, neededResources)

		// Set stage to CollectingResources
		building.stage = ConstructionStage.CollectingResources
		building.progress = 0
	}

	// Check if building has all required resources
	private hasAllRequiredResources(building: BuildingInstance): boolean {
		for (const cost of building.requiredResources) {
			const collected = building.collectedResources.get(cost.itemType) || 0
			if (collected < cost.quantity) {
				return false
			}
		}
		return true
	}

	// Rebuild resourceRequests based on actual collected vs required resources
	// This is used as a safety mechanism if resourceRequests gets out of sync
	private rebuildResourceRequests(building: BuildingInstance): void {
		const neededResources = new Set<string>()
		for (const cost of building.requiredResources) {
			const collected = building.collectedResources.get(cost.itemType) || 0
			if (collected < cost.quantity) {
				neededResources.add(cost.itemType)
			}
		}
		
		if (neededResources.size > 0) {
			this.resourceRequests.set(building.id, neededResources)
			this.logger.log(`[RESOURCE COLLECTION] Rebuilt resourceRequests for building ${building.id}: [${Array.from(neededResources).join(', ')}]`)
		} else {
			this.logger.log(`[RESOURCE COLLECTION] Rebuilt resourceRequests for building ${building.id}: all resources collected`)
		}
	}

	// Add resource to building (called when carrier delivers)
	public addResourceToBuilding(buildingInstanceId: string, itemType: string, quantity: number): boolean {
		const building = this.buildings.get(buildingInstanceId)
		if (!building) {
			this.logger.warn(`[RESOURCE DELIVERY] Building not found: ${buildingInstanceId}`)
			return false
		}

		// Check if building still needs this resource
		const neededResources = this.resourceRequests.get(buildingInstanceId)
		if (!neededResources || !neededResources.has(itemType)) {
			this.logger.log(`[RESOURCE DELIVERY] Building ${buildingInstanceId} doesn't need ${itemType} anymore (neededResources: ${neededResources ? Array.from(neededResources).join(', ') : 'null'})`)
			return false // Building doesn't need this resource anymore
		}

		// Get required quantity
		const requiredCost = building.requiredResources.find(cost => cost.itemType === itemType)
		if (!requiredCost) {
			this.logger.warn(`[RESOURCE DELIVERY] Required cost not found for ${itemType} in building ${buildingInstanceId}`)
			return false
		}

		// Add to collected resources
		const currentCollected = building.collectedResources.get(itemType) || 0
		const newCollected = Math.min(currentCollected + quantity, requiredCost.quantity)
		building.collectedResources.set(itemType, newCollected)
		
		this.logger.log(`[RESOURCE DELIVERY] Building ${buildingInstanceId} received ${quantity} ${itemType}. Collected: ${currentCollected} -> ${newCollected}/${requiredCost.quantity}`)

		// If resource is fully collected, remove from needed resources
		if (newCollected >= requiredCost.quantity) {
			this.logger.log(`[RESOURCE DELIVERY] Resource ${itemType} fully collected for building ${buildingInstanceId}. Removing from neededResources.`)
			neededResources.delete(itemType)
			if (neededResources.size === 0) {
				this.logger.log(`[RESOURCE DELIVERY] All resources collected for building ${buildingInstanceId}. Deleting resourceRequests entry.`)
				this.resourceRequests.delete(buildingInstanceId)
			} else {
				this.logger.log(`[RESOURCE DELIVERY] Building ${buildingInstanceId} still needs: [${Array.from(neededResources).join(', ')}]`)
			}
		}

			// Emit resources changed event
			this.event.emit(Receiver.Group, BuildingsEvents.SC.ResourcesChanged, {
				buildingInstanceId: building.id,
				itemType,
				quantity: newCollected,
				requiredQuantity: requiredCost.quantity
			}, building.mapId)

		// Check if all resources are collected
		if (this.hasAllRequiredResources(building)) {
			this.logger.log(`[RESOURCE DELIVERY] All required resources collected for building ${buildingInstanceId}. Transitioning to Constructing stage.`)
			// Transition to Constructing stage
			building.stage = ConstructionStage.Constructing
			building.startedAt = this.simulationTimeMs // Start construction timer

			// Emit stage changed event (this signals that all resources are collected)
			this.event.emit(Receiver.Group, BuildingsEvents.SC.StageChanged, {
				buildingInstanceId: building.id,
				stage: building.stage
			}, building.mapId)

			// Update MapObject metadata
			const mapObjectId = this.buildingToMapObject.get(building.id)
			if (mapObjectId) {
				const mapObject = this.managers.mapObjects.getObjectById(mapObjectId)
				if (mapObject && mapObject.metadata) {
					mapObject.metadata.stage = ConstructionStage.Constructing
				}
			}
		} else {
			// Log what resources are still needed
			const stillNeeded = building.requiredResources.filter(cost => {
				const collected = building.collectedResources.get(cost.itemType) || 0
				return collected < cost.quantity
			}).map(cost => {
				const collected = building.collectedResources.get(cost.itemType) || 0
				return `${cost.itemType}: ${collected}/${cost.quantity}`
			}).join(', ')
			this.logger.log(`[RESOURCE DELIVERY] Building ${buildingInstanceId} still needs: ${stillNeeded}`)
		}

		return true
	}

	// Check if construction can progress (resources collected AND builder present)
	private canConstructionProgress(building: BuildingInstance): boolean {
		// Check if all resources are collected
		if (!this.hasAllRequiredResources(building)) {
			return false
		}

		// Check if builder is present at building
		const activeBuilders = this.activeConstructionWorkers.get(building.id)
		if (!activeBuilders || activeBuilders.size === 0) {
			return false
		}

		return true
	}


	private completeBuilding(building: BuildingInstance) {
		this.logger.log(`Completing building:`, {
			id: building.id,
			buildingId: building.buildingId,
			playerId: building.playerId,
			mapId: building.mapId,
			stage: building.stage
		})
		
		// Update building stage
		building.stage = ConstructionStage.Completed

		// Initialize storage for building if it has storage capacity
		if (this.managers.storage) {
			this.managers.storage.initializeBuildingStorage(building.id)
		}

		// Update MapObject metadata to reflect completion
		const mapObjectId = this.buildingToMapObject.get(building.id)
		if (mapObjectId) {
			const mapObject = this.managers.mapObjects.getObjectById(mapObjectId)
			if (mapObject && mapObject.metadata) {
				mapObject.metadata.stage = ConstructionStage.Completed
				mapObject.metadata.progress = 100
				// Emit update to clients - MapObjectsManager doesn't have an update event,
				// so we'll rely on the building completed event for UI updates
			}
		}

		// Check if this is a house
		const buildingDef = this.definitions.get(building.buildingId)
		if (buildingDef && buildingDef.spawnsSettlers) {
			this.logger.log(`✓ House building completed: ${building.buildingId} (${building.id})`)
			
			// Emit internal server-side event for PopulationManager
			this.logger.log(`Emitting internal house completed event (ss:)`)
			this.event.emit(Receiver.All, BuildingsEvents.SS.HouseCompleted, {
				buildingInstanceId: building.id,
				buildingId: building.buildingId
			})
		}

		// Emit internal construction completed event for PopulationManager to handle builder reassignment
		// This event is emitted for ALL completed buildings (not just houses)
		this.event.emit(Receiver.All, BuildingsEvents.SS.ConstructionCompleted, {
			buildingInstanceId: building.id,
			buildingId: building.buildingId,
			mapId: building.mapId,
			playerId: building.playerId
		})

		// Emit completed event to clients
		const clientBuilding = {
			...building,
			collectedResources: Object.fromEntries(building.collectedResources) as Record<string, number>
		}
		// Remove server-only fields
		delete (clientBuilding as any).requiredResources
		const completedData: BuildingCompletedData = {
			building: clientBuilding as any
		}
		this.logger.log(`Emitting building completed event to group: ${building.mapId}`)
		this.event.emit(Receiver.Group, BuildingsEvents.SC.Completed, completedData, building.mapId)
		this.logger.log(`✓ Building completed event emitted`)
	}

	private processAutoProduction(building: BuildingInstance, recipe: ProductionRecipe, deltaMs: number): void {
		if (!this.managers.storage) {
			return
		}

		const productionTimeMs = Math.max(1, (recipe.productionTime ?? 1) * 1000)
		const state = this.autoProductionState.get(building.id) || {
			status: ProductionStatus.Idle,
			progressMs: 0,
			progress: 0
		}

		for (const input of recipe.inputs) {
			const current = this.managers.storage.getCurrentQuantity(building.id, input.itemType)
			if (current < input.quantity) {
				state.progressMs = 0
				this.emitAutoProductionStatus(building, ProductionStatus.NoInput, 0, state.progressMs)
				return
			}
		}

		for (const output of recipe.outputs) {
			if (!this.managers.storage.hasAvailableStorage(building.id, output.itemType, output.quantity)) {
				state.progressMs = 0
				this.emitAutoProductionStatus(building, ProductionStatus.Idle, 0, state.progressMs)
				return
			}
		}

		if (state.status !== ProductionStatus.InProduction) {
			state.progressMs = 0
			this.emitAutoProductionStarted(building, recipe)
		}

		state.progressMs += deltaMs
		const progress = Math.min(100, Math.floor((state.progressMs / productionTimeMs) * 100))
		this.emitAutoProductionStatus(building, ProductionStatus.InProduction, progress, state.progressMs)

		if (state.progressMs < productionTimeMs) {
			return
		}

		for (const input of recipe.inputs) {
			const ok = this.managers.storage.removeFromStorage(building.id, input.itemType, input.quantity)
			if (!ok) {
				state.progressMs = 0
				this.emitAutoProductionStatus(building, ProductionStatus.NoInput, 0, state.progressMs)
				return
			}
		}

		for (const output of recipe.outputs) {
			const ok = this.managers.storage.addToStorage(building.id, output.itemType, output.quantity)
			if (!ok) {
				state.progressMs = 0
				this.emitAutoProductionStatus(building, ProductionStatus.Idle, 0, state.progressMs)
				return
			}
		}

		state.progressMs = 0
		this.emitAutoProductionCompleted(building, recipe)
	}

	private emitAutoProductionStarted(building: BuildingInstance, recipe: ProductionRecipe): void {
		this.emitAutoProductionStatus(building, ProductionStatus.InProduction, 0, 0)
		this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionStarted, {
			buildingInstanceId: building.id,
			recipe
		}, building.mapId)
		this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionProgress, {
			buildingInstanceId: building.id,
			progress: 0
		}, building.mapId)
	}

	private emitAutoProductionCompleted(building: BuildingInstance, recipe: ProductionRecipe): void {
		this.emitAutoProductionStatus(building, ProductionStatus.Idle, 100, 0)
		this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionCompleted, {
			buildingInstanceId: building.id,
			recipe
		}, building.mapId)
		this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionProgress, {
			buildingInstanceId: building.id,
			progress: 100
		}, building.mapId)
	}

	private emitAutoProductionStatus(building: BuildingInstance, status: ProductionStatus, progress: number, progressMs: number): void {
		const current = this.autoProductionState.get(building.id)
		const nextProgress = typeof progress === 'number' ? progress : (current?.progress ?? 0)
		const nextProgressMs = typeof progressMs === 'number' ? progressMs : (current?.progressMs ?? 0)

		if (current && current.status === status && current.progress === nextProgress) {
			if (current.progressMs !== nextProgressMs) {
				this.autoProductionState.set(building.id, { status, progress: nextProgress, progressMs: nextProgressMs })
			}
			return
		}

		this.autoProductionState.set(building.id, { status, progress: nextProgress, progressMs: nextProgressMs })
		this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionStatusChanged, {
			buildingInstanceId: building.id,
			status
		}, building.mapId)
		this.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionProgress, {
			buildingInstanceId: building.id,
			progress: nextProgress
		}, building.mapId)
	}

	private checkBuildingCollision(mapId: string, position: { x: number, y: number }, definition: BuildingDefinition): boolean {
		// Get all existing buildings and map objects in this map
		const existingBuildings = this.getBuildingsForMap(mapId)
		const existingObjects = this.managers.mapObjects.getAllObjectsForMap(mapId)

		// Get tile size from map (default to 32 if map not loaded)
		const map = this.managers.map.getMap(mapId)
		const TILE_SIZE = map?.tiledMap?.tilewidth || 32
		const buildingWidth = definition.footprint.width * TILE_SIZE
		const buildingHeight = definition.footprint.height * TILE_SIZE

		this.logger.debug(`Checking collision for building ${definition.id} at position (${position.x}, ${position.y}) with footprint ${definition.footprint.width}x${definition.footprint.height} (${buildingWidth}x${buildingHeight} pixels)`)

		// Check collision with map tiles (non-passable tiles)
		if (this.checkMapTileCollision(mapId, position, definition, TILE_SIZE)) {
			this.logger.debug(`❌ Collision with map tiles at position:`, position)
			return true
		}

		// Check collision with existing buildings
		for (const building of existingBuildings) {
			const def = this.definitions.get(building.buildingId)
			if (!def) continue

			// Convert existing building footprint to pixels
			const existingWidth = def.footprint.width * TILE_SIZE
			const existingHeight = def.footprint.height * TILE_SIZE

			this.logger.debug(`Checking against existing building at (${building.position.x}, ${building.position.y}) with footprint ${def.footprint.width}x${def.footprint.height} (${existingWidth}x${existingHeight} pixels)`)

			if (this.doRectanglesOverlap(
				position, buildingWidth, buildingHeight,
				building.position, existingWidth, existingHeight
			)) {
				this.logger.debug(`❌ Collision with existing building ${building.id}`)
				return true // Collision detected
			}
		}

		// Check collision with existing map objects
		for (const obj of existingObjects) {
			// For buildings, use footprint from metadata
			let objWidth: number
			let objHeight: number

			if (obj.metadata?.footprint) {
				// Building: use footprint from metadata (convert tiles to pixels)
				objWidth = obj.metadata.footprint.width * TILE_SIZE
				objHeight = obj.metadata.footprint.height * TILE_SIZE
				this.logger.debug(`Checking against map object (building) at (${obj.position.x}, ${obj.position.y}) with footprint ${obj.metadata.footprint.width}x${obj.metadata.footprint.height} (${objWidth}x${objHeight} pixels)`)
			} else {
				// Regular item: use placement size from metadata (already in pixels or tiles?)
				const itemMetadata = this.managers.items.getItemMetadata(obj.item.itemType)
				const placementWidth = itemMetadata?.placement?.size?.width || 1
				const placementHeight = itemMetadata?.placement?.size?.height || 1
				// Assume placement size is in tiles, convert to pixels
				objWidth = placementWidth * TILE_SIZE
				objHeight = placementHeight * TILE_SIZE
			}

			// Only check collision if the object blocks placement
			const itemMetadata = this.managers.items.getItemMetadata(obj.item.itemType)
			if (itemMetadata?.placement?.blocksPlacement || obj.metadata?.buildingId) {
				if (this.doRectanglesOverlap(
					position, buildingWidth, buildingHeight,
					obj.position, objWidth, objHeight
				)) {
					this.logger.debug(`❌ Collision with map object ${obj.id}`)
					return true // Collision detected
				}
			}
		}

		this.logger.debug(`✅ No collision detected, placement allowed`)
		return false // No collision
	}

	/**
	 * Check if building footprint overlaps with non-passable map tiles
	 * @param mapId Map identifier
	 * @param position Building position in pixels
	 * @param definition Building definition with footprint
	 * @param tileSize Tile size in pixels
	 * @returns true if collision with map tiles detected
	 */
	private checkMapTileCollision(
		mapId: string,
		position: { x: number, y: number },
		definition: BuildingDefinition,
		tileSize: number
	): boolean {
		// Get map data
		const map = this.managers.map.getMap(mapId)
		if (!map) {
			this.logger.warn(`Map ${mapId} not found, allowing placement`)
			return false // Allow placement if map not loaded (shouldn't happen)
		}

		// Convert pixel position to tile coordinates
		const startTileX = Math.floor(position.x / tileSize)
		const startTileY = Math.floor(position.y / tileSize)

		// Check all tiles within the building's footprint
		for (let tileY = 0; tileY < definition.footprint.height; tileY++) {
			for (let tileX = 0; tileX < definition.footprint.width; tileX++) {
				const checkTileX = startTileX + tileX
				const checkTileY = startTileY + tileY

				// Check if this tile has collision (non-zero value in collision data)
				if (this.managers.map.isCollision(mapId, checkTileX, checkTileY)) {
					this.logger.debug(`Collision detected at tile (${checkTileX}, ${checkTileY})`)
					return true
				}
			}
		}

		return false // No collision with map tiles
	}

	private doRectanglesOverlap(
		pos1: { x: number, y: number },
		width1: number,
		height1: number,
		pos2: { x: number, y: number },
		width2: number,
		height2: number
	): boolean {
		// Rectangle 1 bounds: [pos1.x, pos1.x + width1) x [pos1.y, pos1.y + height1)
		// Rectangle 2 bounds: [pos2.x, pos2.x + width2) x [pos2.y, pos2.y + height2)
		// They overlap if they intersect in both dimensions

		// Check if one rectangle is completely to the left of the other
		const rect1Right = pos1.x + width1
		const rect2Right = pos2.x + width2
		if (rect1Right <= pos2.x || rect2Right <= pos1.x) {
			return false // No horizontal overlap
		}

		// Check if one rectangle is completely above the other
		const rect1Bottom = pos1.y + height1
		const rect2Bottom = pos2.y + height2
		if (rect1Bottom <= pos2.y || rect2Bottom <= pos1.y) {
			return false // No vertical overlap
		}

		// Both dimensions overlap, so rectangles overlap
		return true
	}

	private hasRequiredResources(costs: BuildingCost[], playerId: string): boolean {
		for (const cost of costs) {
			if (!this.managers.inventory.doesHave(cost.itemType, cost.quantity, playerId)) {
				return false
			}
		}
		return true
	}

	private removeRequiredResources(costs: BuildingCost[], client: EventClient) {
		for (const cost of costs) {
			this.managers.inventory.removeItemByType(client, cost.itemType, cost.quantity)
		}
	}

	private calculateRefund(building: BuildingInstance): BuildingCost[] {
		const definition = this.definitions.get(building.buildingId)
		if (!definition) return []

		// Calculate refund based on remaining progress
		const refundPercentage = (100 - building.progress) / 100
		const refundedItems: BuildingCost[] = []

		for (const cost of definition.costs) {
			// Refund a percentage of the cost (rounded down)
			const refundQuantity = Math.floor(cost.quantity * refundPercentage)
			if (refundQuantity > 0) {
				refundedItems.push({
					itemType: cost.itemType,
					quantity: refundQuantity
				})
			}
		}

		return refundedItems
	}

	private sendBuildingsToClient(client: EventClient, mapId?: string) {
		const targetMap = mapId || client.currentGroup
		const buildingsInMap = Array.from(this.buildings.values()).filter(
			building => building.mapId === targetMap
		)

		for (const building of buildingsInMap) {
			// Create a client-safe building instance - convert Map to Record, remove server-only fields
			const clientBuilding = {
				...building,
				collectedResources: Object.fromEntries(building.collectedResources) as Record<string, number>
			}
			// Remove server-only fields
			delete (clientBuilding as any).requiredResources
			const placedData: BuildingPlacedData = {
				building: clientBuilding as any
			}
			client.emit(Receiver.Sender, BuildingsEvents.SC.Placed, placedData)
		}
	}

	private sendBuildingCatalog(client: EventClient) {
		// Send all available building definitions to the client
		const buildingDefinitions = this.getAllBuildingDefinitions()
		this.logger.debug(`Sending building catalog to client ${client.id}:`, buildingDefinitions.length, 'buildings')
		if (buildingDefinitions.length === 0) {
			this.logger.warn('No building definitions loaded! Check content loading.')
			return
		}
		client.emit(Receiver.Sender, BuildingsEvents.SC.Catalog, {
			buildings: buildingDefinitions
		})
		this.logger.debug(`Catalog event emitted to client ${client.id}`)
	}

	public loadBuildings(definitions: BuildingDefinition[]): void {
		this.logger.log(`Loading ${definitions.length} building definitions`)
		for (const definition of definitions) {
			this.definitions.set(definition.id, definition)
			this.logger.debug(`Loaded building: ${definition.id} - ${definition.name}`)
		}
		this.logger.log(`Total building definitions: ${this.definitions.size}`)

		this.initializeStorageForExistingBuildings()
		
		// After buildings are loaded, send catalog to all existing clients
		// This ensures clients that connected before buildings were loaded will still receive them
		this.broadcastCatalogToAllClients()
	}
	
	private broadcastCatalogToAllClients() {
		// This is a workaround - we need to send catalog to clients that might have connected
		// before buildings were loaded. For now, we'll rely on the player join event.
		// In a real implementation, we'd track connected clients and send to them here.
		this.logger.debug('Buildings loaded, catalog will be sent on next player join')
	}

	public getBuildingDefinition(buildingId: BuildingId): BuildingDefinition | undefined {
		return this.definitions.get(buildingId)
	}

	public getAllBuildingDefinitions(): BuildingDefinition[] {
		return Array.from(this.definitions.values())
	}

	public getBuildingInstance(buildingInstanceId: string): BuildingInstance | undefined {
		return this.buildings.get(buildingInstanceId)
	}

	public isProductionPaused(buildingInstanceId: string): boolean {
		const building = this.buildings.get(buildingInstanceId)
		return Boolean(building?.productionPaused)
	}

	public setProductionPaused(buildingInstanceId: string, paused: boolean): void {
		const building = this.buildings.get(buildingInstanceId)
		if (!building) {
			return
		}
		if (building.productionPaused === paused) {
			return
		}
		building.productionPaused = paused
	}

	public getBuildingsForMap(mapId: string): BuildingInstance[] {
		return Array.from(this.buildings.values()).filter(
			building => building.mapId === mapId
		)
	}

	public getAllBuildings(): BuildingInstance[] {
		return Array.from(this.buildings.values())
	}

	// Get building instance (alias for consistency)
	public getBuilding(buildingInstanceId: string): BuildingInstance | undefined {
		return this.getBuildingInstance(buildingInstanceId)
	}

	// Get building position
	public getBuildingPosition(buildingInstanceId: string): Position | undefined {
		const building = this.getBuildingInstance(buildingInstanceId)
		return building?.position
	}

	// Get building definition for a building instance
	public getBuildingDefinitionForInstance(buildingInstanceId: string): BuildingDefinition | undefined {
		const building = this.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return undefined
		}
		return this.getBuildingDefinition(building.buildingId)
	}

	// Check if building needs workers
	public getBuildingNeedsWorkers(buildingInstanceId: string): boolean {
		const building = this.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return false
		}

		const definition = this.definitions.get(building.buildingId)
		if (!definition) {
			return false
		}

		// Building needs workers if it's collecting resources (waiting for resources to be collected)
		// Note: Resource collection is handled by carriers, not workers
		// Building needs workers if it's under construction
		if (building.stage === ConstructionStage.Constructing) {
			return true
		}

	// Building needs workers if it's completed and has worker slots available
	if (building.stage === ConstructionStage.Completed && definition.workerSlots) {
		const currentWorkers = this.assignedWorkers.get(buildingInstanceId)?.size || 0
		return currentWorkers < definition.workerSlots
	}

		return false
	}

	public buildingNeedsResource(buildingInstanceId: string, itemType: string): boolean {
		const neededResources = this.resourceRequests.get(buildingInstanceId)
		if (!neededResources) {
			return false
		}
		return neededResources.has(itemType)
	}

	public setAssignedWorker(buildingInstanceId: string, settlerId: string, assigned: boolean): void {
		if (!this.assignedWorkers.has(buildingInstanceId)) {
			this.assignedWorkers.set(buildingInstanceId, new Set())
		}
		const set = this.assignedWorkers.get(buildingInstanceId)!
		if (assigned) {
			set.add(settlerId)
		} else {
			set.delete(settlerId)
		}
	}

	public setConstructionWorkerActive(buildingInstanceId: string, settlerId: string, active: boolean): void {
		if (!this.activeConstructionWorkers.has(buildingInstanceId)) {
			this.activeConstructionWorkers.set(buildingInstanceId, new Set())
		}
		const set = this.activeConstructionWorkers.get(buildingInstanceId)!
		if (active) {
			set.add(settlerId)
		} else {
			set.delete(settlerId)
			if (set.size === 0) {
				this.activeConstructionWorkers.delete(buildingInstanceId)
			}
		}
	}

	public getBuildingsNeedingResources(): string[] {
		const results: string[] = []
		for (const [buildingId, needed] of this.resourceRequests.entries()) {
			if (needed.size > 0) {
				results.push(buildingId)
			}
		}
		return results
	}

	public getNeededResources(buildingInstanceId: string): Array<{ itemType: string, remaining: number }> {
		const building = this.buildings.get(buildingInstanceId)
		if (!building) {
			return []
		}
		const neededResources = this.resourceRequests.get(buildingInstanceId)
		if (!neededResources) {
			return []
		}
		const results: Array<{ itemType: string, remaining: number }> = []
		for (const itemType of neededResources) {
			const requiredCost = building.requiredResources.find(cost => cost.itemType === itemType)
			if (!requiredCost) {
				continue
			}
			const collected = building.collectedResources.get(itemType) || 0
			const remaining = Math.max(0, requiredCost.quantity - collected)
			if (remaining > 0) {
				results.push({ itemType, remaining })
			}
		}
		return results
	}

	// Get workers for building
	public getBuildingWorkers(buildingInstanceId: string): string[] {
		const workers = this.assignedWorkers.get(buildingInstanceId)
		if (!workers) {
			return []
		}
		return Array.from(workers)
	}

	// Update tick to account for worker speedup
	private calculateConstructionProgress(building: BuildingInstance, deltaSeconds: number): number {
		const definition = this.definitions.get(building.buildingId)
		if (!definition) {
			return building.progress
		}

		const workerCount = this.activeConstructionWorkers.get(building.id)?.size || 0
		
		// Apply speedup: each worker doubles construction speed (up to 4x with 2 workers for now)
		const speedup = 1 + (workerCount * 0.5) // 1x base, 1.5x with 1 worker, 2x with 2 workers, etc.
		
		const progressIncrease = (deltaSeconds / definition.constructionTime) * 100 * speedup
		const progress = Math.min(100, building.progress + progressIncrease)

		return progress
	}

	public destroy() {
		// no-op for now (tick-driven construction)
	}

	serialize(): BuildingsSnapshot {
		const buildings: BuildingInstanceSnapshot[] = Array.from(this.buildings.values()).map(building => ({
			...building,
			position: { ...building.position },
			workAreaCenter: building.workAreaCenter ? { ...building.workAreaCenter } : undefined,
			collectedResources: Array.from(building.collectedResources.entries())
		}))

		return {
			buildings,
			resourceRequests: Array.from(this.resourceRequests.entries()).map(([buildingId, needed]) => ([
				buildingId,
				Array.from(needed.values())
			])),
			assignedWorkers: Array.from(this.assignedWorkers.entries()).map(([buildingId, workers]) => ([
				buildingId,
				Array.from(workers.values())
			])),
			activeConstructionWorkers: Array.from(this.activeConstructionWorkers.entries()).map(([buildingId, workers]) => ([
				buildingId,
				Array.from(workers.values())
			])),
			autoProductionState: Array.from(this.autoProductionState.entries()),
			buildingToMapObject: Array.from(this.buildingToMapObject.entries()),
			simulationTimeMs: this.simulationTimeMs,
			tickAccumulatorMs: this.tickAccumulatorMs
		}
	}

	deserialize(state: BuildingsSnapshot): void {
		this.buildings.clear()
		for (const building of state.buildings) {
			const collectedResources = new Map(building.collectedResources)
			const restored: BuildingInstance = {
				...building,
				position: { ...building.position },
				workAreaCenter: building.workAreaCenter ? { ...building.workAreaCenter } : undefined,
				collectedResources
			}
			this.buildings.set(restored.id, restored)
		}

		this.resourceRequests.clear()
		for (const [buildingId, needed] of state.resourceRequests) {
			this.resourceRequests.set(buildingId, new Set(needed))
		}

		this.assignedWorkers.clear()
		for (const [buildingId, workers] of state.assignedWorkers) {
			this.assignedWorkers.set(buildingId, new Set(workers))
		}

		this.activeConstructionWorkers.clear()
		for (const [buildingId, workers] of state.activeConstructionWorkers) {
			this.activeConstructionWorkers.set(buildingId, new Set(workers))
		}

		this.autoProductionState = new Map(state.autoProductionState)
		this.buildingToMapObject = new Map(state.buildingToMapObject)
		this.simulationTimeMs = state.simulationTimeMs
		this.tickAccumulatorMs = state.tickAccumulatorMs

		this.initializeStorageForExistingBuildings()
	}

	private initializeStorageForExistingBuildings(): void {
		if (!this.managers.storage || this.definitions.size === 0) {
			return
		}
		for (const building of this.buildings.values()) {
			if (building.stage !== ConstructionStage.Completed) {
				continue
			}
			const definition = this.definitions.get(building.buildingId)
			if (!definition?.storage) {
				continue
			}
			if (this.managers.storage.getBuildingStorage(building.id)) {
				continue
			}
			this.managers.storage.initializeBuildingStorage(building.id)
		}
	}

	reset(): void {
		this.buildings.clear()
		this.resourceRequests.clear()
		this.assignedWorkers.clear()
		this.activeConstructionWorkers.clear()
		this.autoProductionState.clear()
		this.buildingToMapObject.clear()
		this.simulationTimeMs = 0
		this.tickAccumulatorMs = 0
	}
}
