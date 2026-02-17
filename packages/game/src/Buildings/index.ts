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
	ProductionPlan,
	SetWorkAreaData,
	BuildingWorkAreaUpdatedData,
	SetStorageRequestsData,
	SetProductionPlanData,
	SetGlobalProductionPlanData,
	ProductionPlanUpdatedData,
	GlobalProductionPlanUpdatedData
} from './types'
import { Receiver } from '../Receiver'
import { v4 as uuidv4 } from 'uuid'
import type { InventoryManager } from '../Inventory'
import type { MapObjectsManager } from '../MapObjects'
import type { ItemsManager } from '../Items'
import type { MapManager } from '../Map'
import { PlayerJoinData, PlayerTransitionData } from '../Players/types'
import { PlaceObjectData } from '../MapObjects/types'
import { Item, ItemType } from '../Items/types'
import { Position } from '../types'
import type { LootManager } from '../Loot'
import { Logger } from '../Logs'
import { SimulationEvents } from '../Simulation/events'
import { SimulationTickData } from '../Simulation/types'
import type { StorageManager } from '../Storage'
import { BaseManager } from '../Managers'
import type { BuildingsSnapshot } from '../state/types'
import { CityCharterEvents } from '../CityCharter/events'
import type { CityCharterUnlockFlagsUpdated } from '../CityCharter/types'
import { getProductionRecipes } from './work'
import type { ResourceNodesManager } from '../ResourceNodes'
import { BuildingManagerState } from './BuildingManagerState'

const MINE_BUILDING_IDS = new Set(['coal_mine', 'iron_mine', 'gold_mine', 'stone_mine', 'quarry'])
const RESOURCE_NODE_TYPES = new Set(['resource_deposit', 'stone_deposit'])

export interface BuildingDeps {
	event: EventManager
	inventory: InventoryManager
	mapObjects: MapObjectsManager
	items: ItemsManager
	map: MapManager
	loot: LootManager
	storage: StorageManager
	resourceNodes: ResourceNodesManager
}

export class BuildingManager extends BaseManager<BuildingDeps> {
	private readonly state = new BuildingManagerState()
	private readonly TICK_INTERVAL_MS = 1000 // Update construction progress every second

	constructor(
		managers: BuildingDeps,
		private logger: Logger,
		// managers provides Loot/Storage
	) {
		super(managers)
		this.setupEventHandlers()
		
		// Send building catalog to clients when they connect (in addition to when they join a map)
		// Note: Buildings might not be loaded yet, so we also send on player join
		this.managers.event.onJoined(this.handleLifecycleJoined)
	}

	private setupEventHandlers() {
		this.managers.event.on<PlaceBuildingData>(BuildingsEvents.CS.Place, this.handleBuildingsCSPlace)
		this.managers.event.on<CancelBuildingData>(BuildingsEvents.CS.Cancel, this.handleBuildingsCSCancel)
		this.managers.event.on<SetWorkAreaData>(BuildingsEvents.CS.SetWorkArea, this.handleBuildingsCSSetWorkArea)
		this.managers.event.on<SetStorageRequestsData>(BuildingsEvents.CS.SetStorageRequests, this.handleBuildingsCSSetStorageRequests)
		this.managers.event.on<SetProductionPlanData>(BuildingsEvents.CS.SetProductionPlan, this.handleBuildingsCSSetProductionPlan)
		this.managers.event.on<SetGlobalProductionPlanData>(BuildingsEvents.CS.SetGlobalProductionPlan, this.handleBuildingsCSSetGlobalProductionPlan)
		this.managers.event.on<PlayerJoinData>(Event.Players.CS.Join, this.handlePlayersCSJoin)
		this.managers.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, this.handlePlayersCSTransitionTo)
		this.managers.event.on(SimulationEvents.SS.SlowTick, this.handleSimulationSSTick)
		this.managers.event.on<CityCharterUnlockFlagsUpdated>(CityCharterEvents.SS.UnlockFlagsUpdated, this.handleCityCharterSSUnlockFlagsUpdated)
	}

	/* EVENT HANDLERS */
	private readonly handleLifecycleJoined = (client: EventClient): void => {
		if (this.state.definitions.size > 0) {
			this.sendBuildingCatalog(client)
		}
	}

	private readonly handleBuildingsCSPlace = (data: PlaceBuildingData, client: EventClient): void => {
		this.placeBuilding(data, client)
	}

	private readonly handleBuildingsCSCancel = (data: CancelBuildingData, client: EventClient): void => {
		this.cancelBuilding(data, client)
	}

	private readonly handleBuildingsCSSetWorkArea = (data: SetWorkAreaData, client: EventClient): void => {
		this.setWorkArea(data, client)
	}

	private readonly handleBuildingsCSSetStorageRequests = (data: SetStorageRequestsData, client: EventClient): void => {
		const building = this.state.buildings.get(data.buildingInstanceId)
		if (!building) {
			return
		}
		if (building.playerId !== client.id) {
			this.logger.error(`Player ${client.id} does not own building ${data.buildingInstanceId}`)
			return
		}
		const definition = this.state.definitions.get(building.buildingId)
		if (!definition) {
			return
		}
		const normalized = this.normalizeStorageRequests(definition, data.itemTypes)
		if (!normalized) {
			return
		}
		building.storageRequests = normalized
		this.managers.event.emit(Receiver.Group, BuildingsEvents.SC.StorageRequestsUpdated, {
			buildingInstanceId: building.id,
			itemTypes: normalized
		}, building.mapId)
	}

	private readonly handleBuildingsCSSetProductionPlan = (data: SetProductionPlanData, client: EventClient): void => {
		this.setProductionPlan(data, client)
	}

	private readonly handleBuildingsCSSetGlobalProductionPlan = (data: SetGlobalProductionPlanData, client: EventClient): void => {
		this.setGlobalProductionPlan(data, client)
	}

	private readonly handlePlayersCSJoin = (data: PlayerJoinData, client: EventClient): void => {
		this.sendBuildingsToClient(client, data.mapId)
		this.sendBuildingCatalog(client)
	}

	private readonly handlePlayersCSTransitionTo = (data: PlayerTransitionData, client: EventClient): void => {
		this.sendBuildingsToClient(client, data.mapId)
	}

	private readonly handleSimulationSSTick = (data: SimulationTickData): void => {
		this.handleSimulationTick(data)
	}

	private readonly handleCityCharterSSUnlockFlagsUpdated = (data: CityCharterUnlockFlagsUpdated): void => {
		const key = this.getPlayerMapKey(data.playerId, data.mapId)
		this.state.unlockedFlagsByPlayerMap.set(key, new Set(data.unlockedFlags))
	}

	private handleSimulationTick(data: SimulationTickData) {
		this.state.simulationTimeMs = data.nowMs
		this.tick()
	}

	/* METHODS */
	private tick() {
		const now = this.state.simulationTimeMs
		const buildingsToUpdate: BuildingInstance[] = []

		// Collect all buildings that need processing
		for (const building of this.state.buildings.values()) {
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
			const definition = this.state.definitions.get(building.buildingId)
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
			this.managers.event.emit(Receiver.Group, BuildingsEvents.SC.Progress, progressData, building.mapId)

			// Check if construction is complete
			if (progress >= 100 && building.stage === ConstructionStage.Completed) {
				this.completeBuilding(building)
			}
		}

		// Handle auto-production for completed buildings
		for (const building of this.state.buildings.values()) {
			if (building.stage !== ConstructionStage.Completed) {
				continue
			}
			const definition = this.state.definitions.get(building.buildingId)
			if (!definition?.autoProduction) {
				continue
			}
			this.processAutoProduction(building, definition.autoProduction, this.TICK_INTERVAL_MS)
		}
	}

	private getPlayerMapKey(playerId: string, mapId: string): string {
		return `${playerId}:${mapId}`
	}

	private placeBuilding(data: PlaceBuildingData, client: EventClient) {
		const { buildingId, position, resourceNodeId } = data
		const rotation = typeof data.rotation === 'number' ? data.rotation : 0
		const definition = this.state.definitions.get(buildingId)

		if (!definition) {
			this.logger.error(`Building definition not found: ${buildingId}`)
			return
		}
		const isMine = MINE_BUILDING_IDS.has(buildingId)

		if (definition.unlockFlags && definition.unlockFlags.length > 0) {
			const key = this.getPlayerMapKey(client.id, client.currentGroup)
			const unlockedFlags = this.state.unlockedFlagsByPlayerMap.get(key)
			const isUnlocked = definition.unlockFlags.every(flag => unlockedFlags?.has(flag))
			if (!isUnlocked) {
				this.logger.warn(`Building ${buildingId} is locked for player ${client.id} on map ${client.currentGroup}`)
				return
			}
		}

		if (isMine) {
			if (!resourceNodeId) {
				this.logger.warn(`Missing resourceNodeId for ${buildingId}; placement blocked`)
				return
			}
			const node = this.managers.resourceNodes.getNode(resourceNodeId)
			if (!node) {
				this.logger.warn(`Invalid resourceNodeId=${resourceNodeId} for ${buildingId}`)
				return
			}
			if (node.mapId !== client.currentGroup) {
				this.logger.warn(`Resource node map mismatch nodeId=${resourceNodeId} nodeMap=${node.mapId} mapId=${client.currentGroup}`)
				return
			}
			const expectedDeposit: Record<string, string> = {
				coal_mine: 'coal',
				iron_mine: 'iron',
				gold_mine: 'gold',
				stone_mine: 'stone',
				quarry: 'stone'
			}
			const expectedType = expectedDeposit[buildingId]
			if (node.nodeType === 'stone_deposit') {
				if (expectedType !== 'stone') {
					this.logger.warn(`Node type stone_deposit incompatible with ${buildingId}`)
					return
				}
			} else {
				if (!node.depositDiscovered || node.depositType !== expectedType) {
					this.logger.warn(`Deposit mismatch nodeId=${resourceNodeId} depositType=${node.depositType ?? 'unknown'} expected=${expectedType}`)
					return
				}
			}
		}

		// Note: Resource validation removed - resources are collected from the ground by carriers
		// Building costs are just a blueprint of what's needed
		// Resources don't need to be in inventory to place a building

		// Check for collisions using building footprint
		if (this.checkBuildingCollision(client.currentGroup, position, definition, rotation)) {
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
		const rotatedFootprint = this.getRotatedFootprint(definition, rotation)
		const placeObjectData: PlaceObjectData = {
			position,
			rotation,
			item: buildingItem,
			metadata: {
				buildingId,
				buildingInstanceId,
				allowOverlapResourceNodes: isMine,
				stage: ConstructionStage.CollectingResources,
				progress: 0,
				footprint: {
					width: rotatedFootprint.width,
					height: rotatedFootprint.height
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
			rotation,
			stage: ConstructionStage.CollectingResources,
			progress: 0,
			startedAt: 0, // Will be set when construction starts (resources collected)
			createdAt: this.state.simulationTimeMs,
			collectedResources: new Map(),
			requiredResources: [],
			productionPaused: false,
			resourceNodeId: isMine ? resourceNodeId : undefined
		}
		if (getProductionRecipes(definition).length > 0) {
			buildingInstance.useGlobalProductionPlan = true
			this.ensureGlobalPlanForPlayer(client.id, definition)
		}
		const storageRequests = this.normalizeStorageRequests(definition)
		if (storageRequests) {
			buildingInstance.storageRequests = storageRequests
		}

		// Initialize building resources
		this.initializeBuildingResources(buildingInstance, definition)

		// Try to place the object
		const placedObject = this.managers.mapObjects.placeObject(client.id, placeObjectData, client, {
			skipCollisionCheck: true
		})
		if (!placedObject) {
			this.logger.error(`Failed to place building at position:`, position)
			return
		}

		// Store mapping between building instance and map object
		this.state.buildingToMapObject.set(buildingInstance.id, placedObject.id)

		// Note: Resources are NOT removed from inventory on placement
		// Resources are collected from the ground by carriers and delivered to the building
		// The building costs are just a blueprint of what's needed

		// Store building instance
		this.state.buildings.set(buildingInstance.id, buildingInstance)
		if (buildingInstance.stage !== ConstructionStage.Completed) {
			this.updateConstructionPenalty(buildingInstance, true)
		}

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
		this.managers.event.emit(Receiver.All, BuildingsEvents.SS.Placed, { building: buildingInstance })
	}

	private cancelBuilding(data: CancelBuildingData, client: EventClient) {
		const { buildingInstanceId } = data
		const building = this.state.buildings.get(buildingInstanceId)

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
		this.managers.event.emit(Receiver.All, BuildingsEvents.SS.Removed, {
			buildingInstanceId: building.id,
			buildingId: building.buildingId,
			mapId: building.mapId,
			playerId: building.playerId
		})

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
		const definition = this.state.definitions.get(building.buildingId)
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
				this.managers.event.emit(receiver, event, data, target)
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
		this.updateConstructionPenalty(building, false)
		if (building.stage === ConstructionStage.Completed) {
			this.updateBlockedTiles(building, false)
		}
		// Clean up resource requests and worker tracking
		this.state.resourceRequests.delete(building.id)
		this.state.assignedWorkers.delete(building.id)
		this.state.activeConstructionWorkers.delete(building.id)
		this.state.autoProductionState.delete(building.id)
		this.state.productionCountsByBuilding.delete(building.id)

		// Remove storage piles/records before deleting the building
		if (this.managers.storage) {
			this.managers.storage.removeBuildingStorage(building.id)
		}

		// Remove building from map objects
		const mapObjectId = this.state.buildingToMapObject.get(building.id)
		if (mapObjectId) {
			this.managers.mapObjects.removeObjectById(mapObjectId, building.mapId)
			this.state.buildingToMapObject.delete(building.id)
		}

		// Remove building instance
		this.state.buildings.delete(building.id)
	}

	private setWorkArea(data: SetWorkAreaData, client: EventClient) {
		const { buildingInstanceId, center } = data
		const building = this.state.buildings.get(buildingInstanceId)
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

		this.managers.event.emit(Receiver.Group, BuildingsEvents.SC.WorkAreaUpdated, updatedData, building.mapId)
	}

	private setProductionPlan(data: SetProductionPlanData, client: EventClient): void {
		const building = this.state.buildings.get(data.buildingInstanceId)
		if (!building) {
			return
		}
		if (building.playerId !== client.id) {
			this.logger.error(`Player ${client.id} does not own building ${data.buildingInstanceId}`)
			return
		}
		const definition = this.state.definitions.get(building.buildingId)
		if (!definition) {
			return
		}
		const recipes = getProductionRecipes(definition)
		if (recipes.length === 0) {
			return
		}

		const globalPlan = this.ensureGlobalPlanForPlayer(client.id, definition)
		let useGlobal = typeof data.useGlobal === 'boolean'
			? data.useGlobal
			: (building.useGlobalProductionPlan ?? true)

		if (data.plan) {
			building.productionPlan = this.normalizeProductionPlan(definition, data.plan, globalPlan)
			if (typeof data.useGlobal !== 'boolean') {
				useGlobal = false
			}
		}

		building.useGlobalProductionPlan = useGlobal

		const updatedData: ProductionPlanUpdatedData = {
			buildingInstanceId: building.id,
			plan: building.productionPlan,
			useGlobal
		}
		this.managers.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionPlanUpdated, updatedData, building.mapId)
	}

	private setGlobalProductionPlan(data: SetGlobalProductionPlanData, client: EventClient): void {
		const definition = this.state.definitions.get(data.buildingId)
		if (!definition) {
			return
		}
		const recipes = getProductionRecipes(definition)
		if (recipes.length === 0) {
			return
		}

		const normalized = this.normalizeProductionPlan(definition, data.plan)
		if (!normalized) {
			return
		}

		const plans = this.getOrCreateGlobalPlansForPlayer(client.id)
		plans.set(data.buildingId, normalized)

		const updatedData: GlobalProductionPlanUpdatedData = {
			buildingId: data.buildingId,
			plan: normalized
		}
		client.emit(Receiver.Sender, BuildingsEvents.SC.GlobalProductionPlanUpdated, updatedData)
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
		this.state.resourceRequests.set(building.id, neededResources)

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
			this.state.resourceRequests.set(building.id, neededResources)
			this.logger.log(`[RESOURCE COLLECTION] Rebuilt resourceRequests for building ${building.id}: [${Array.from(neededResources).join(', ')}]`)
		} else {
			this.logger.log(`[RESOURCE COLLECTION] Rebuilt resourceRequests for building ${building.id}: all resources collected`)
		}
	}

	// Add resource to building (called when carrier delivers)
	public addResourceToBuilding(buildingInstanceId: string, itemType: string, quantity: number): boolean {
		const building = this.state.buildings.get(buildingInstanceId)
		if (!building) {
			this.logger.warn(`[RESOURCE DELIVERY] Building not found: ${buildingInstanceId}`)
			return false
		}

		// Check if building still needs this resource
		const neededResources = this.state.resourceRequests.get(buildingInstanceId)
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
				this.state.resourceRequests.delete(buildingInstanceId)
			} else {
				this.logger.log(`[RESOURCE DELIVERY] Building ${buildingInstanceId} still needs: [${Array.from(neededResources).join(', ')}]`)
			}
		}

			// Emit resources changed event
			this.managers.event.emit(Receiver.Group, BuildingsEvents.SC.ResourcesChanged, {
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
			building.startedAt = this.state.simulationTimeMs // Start construction timer

			// Emit stage changed event (this signals that all resources are collected)
			this.managers.event.emit(Receiver.Group, BuildingsEvents.SC.StageChanged, {
				buildingInstanceId: building.id,
				stage: building.stage
			}, building.mapId)

			// Update MapObject metadata
			const mapObjectId = this.state.buildingToMapObject.get(building.id)
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
		const activeBuilders = this.state.activeConstructionWorkers.get(building.id)
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
		this.updateConstructionPenalty(building, false)
		this.updateBlockedTiles(building, true)

		// Initialize storage for building if it has storage capacity
		if (this.managers.storage) {
			this.managers.storage.initializeBuildingStorage(building.id)
		}

		// Update MapObject metadata to reflect completion
		const mapObjectId = this.state.buildingToMapObject.get(building.id)
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
		const buildingDef = this.state.definitions.get(building.buildingId)
		if (buildingDef && buildingDef.spawnsSettlers) {
			this.logger.log(`✓ House building completed: ${building.buildingId} (${building.id})`)
			
			// Emit internal server-side event for PopulationManager
			this.logger.log(`Emitting internal house completed event (ss:)`)
			this.managers.event.emit(Receiver.All, BuildingsEvents.SS.HouseCompleted, {
				buildingInstanceId: building.id,
				buildingId: building.buildingId
			})
		}

		// Emit internal construction completed event for PopulationManager to handle builder reassignment
		// This event is emitted for ALL completed buildings (not just houses)
		this.managers.event.emit(Receiver.All, BuildingsEvents.SS.ConstructionCompleted, {
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
		this.managers.event.emit(Receiver.Group, BuildingsEvents.SC.Completed, completedData, building.mapId)
		this.logger.log(`✓ Building completed event emitted`)
	}

	private updateBlockedTiles(building: BuildingInstance, blocked: boolean): void {
		const definition = this.state.definitions.get(building.buildingId)
		if (!definition?.blockedTiles || definition.blockedTiles.length === 0) {
			return
		}

		const map = this.managers.map.getMap(building.mapId)
		if (!map) {
			return
		}

		const tileSize = map.tiledMap?.tilewidth || 32
		const originTileX = Math.floor(building.position.x / tileSize)
		const originTileY = Math.floor(building.position.y / tileSize)
		const rotation = typeof building.rotation === 'number' ? building.rotation : 0
		const width = definition.footprint.width
		const height = definition.footprint.height

		const accessSet = new Set<string>()
		if (definition.accessTiles && definition.accessTiles.length > 0) {
			for (const access of definition.accessTiles) {
				const normalized = { x: Math.round(access.x), y: Math.round(access.y) }
				const rotated = rotatePointOffset(normalized, width, height, rotation)
				accessSet.add(`${Math.round(rotated.x)},${Math.round(rotated.y)}`)
			}
		}

		const blockedSet = new Set<string>()
		for (const tile of definition.blockedTiles) {
			const normalized = { x: Math.round(tile.x), y: Math.round(tile.y) }
			const rotated = rotatePointOffset(normalized, width, height, rotation)
			const tileX = originTileX + Math.round(rotated.x)
			const tileY = originTileY + Math.round(rotated.y)
			const key = `${Math.round(rotated.x)},${Math.round(rotated.y)}`
			if (blockedSet.has(key)) {
				continue
			}
			blockedSet.add(key)
			if (accessSet.has(key)) {
				continue
			}
			this.managers.map.setDynamicCollision(building.mapId, tileX, tileY, blocked)
		}
	}

	private updateConstructionPenalty(building: BuildingInstance, penalize: boolean): void {
		const definition = this.state.definitions.get(building.buildingId)
		if (!definition) {
			return
		}

		const map = this.managers.map.getMap(building.mapId)
		if (!map) {
			return
		}

		const tileSize = map.tiledMap?.tilewidth || 32
		const originTileX = Math.floor(building.position.x / tileSize)
		const originTileY = Math.floor(building.position.y / tileSize)
		const rotation = typeof building.rotation === 'number' ? building.rotation : 0
		const footprint = this.getRotatedFootprint(definition, rotation)

		for (let tileY = 0; tileY < footprint.height; tileY++) {
			for (let tileX = 0; tileX < footprint.width; tileX++) {
				this.managers.map.setConstructionPenalty(
					building.mapId,
					originTileX + tileX,
					originTileY + tileY,
					penalize
				)
			}
		}
	}

	private processAutoProduction(building: BuildingInstance, recipe: ProductionRecipe, deltaMs: number): void {
		if (!this.managers.storage) {
			return
		}

		const productionTimeMs = Math.max(1, (recipe.productionTime ?? 1) * 1000)
		const state = this.state.autoProductionState.get(building.id) || {
			status: ProductionStatus.Idle,
			progressMs: 0,
			progress: 0
		}

		for (const input of recipe.inputs) {
			const current = this.managers.storage.getCurrentQuantity(building.id, input.itemType, 'incoming')
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
			const ok = this.managers.storage.removeFromStorage(building.id, input.itemType, input.quantity, undefined, 'incoming')
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
		this.managers.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionStarted, {
			buildingInstanceId: building.id,
			recipe
		}, building.mapId)
		this.managers.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionProgress, {
			buildingInstanceId: building.id,
			progress: 0
		}, building.mapId)
	}

	private emitAutoProductionCompleted(building: BuildingInstance, recipe: ProductionRecipe): void {
		this.emitAutoProductionStatus(building, ProductionStatus.Idle, 100, 0)
		this.managers.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionCompleted, {
			buildingInstanceId: building.id,
			recipe
		}, building.mapId)
		this.managers.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionProgress, {
			buildingInstanceId: building.id,
			progress: 100
		}, building.mapId)
	}

	private emitAutoProductionStatus(building: BuildingInstance, status: ProductionStatus, progress: number, progressMs: number): void {
		const current = this.state.autoProductionState.get(building.id)
		const nextProgress = typeof progress === 'number' ? progress : (current?.progress ?? 0)
		const nextProgressMs = typeof progressMs === 'number' ? progressMs : (current?.progressMs ?? 0)

		if (current && current.status === status && current.progress === nextProgress) {
			if (current.progressMs !== nextProgressMs) {
				this.state.autoProductionState.set(building.id, { status, progress: nextProgress, progressMs: nextProgressMs })
			}
			return
		}

		this.state.autoProductionState.set(building.id, { status, progress: nextProgress, progressMs: nextProgressMs })
		this.managers.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionStatusChanged, {
			buildingInstanceId: building.id,
			status
		}, building.mapId)
		this.managers.event.emit(Receiver.Group, BuildingsEvents.SC.ProductionProgress, {
			buildingInstanceId: building.id,
			progress: nextProgress
		}, building.mapId)
	}

	private checkBuildingCollision(mapId: string, position: { x: number, y: number }, definition: BuildingDefinition, rotation: number): boolean {
		// Get all existing buildings and map objects in this map
		const existingBuildings = this.getBuildingsForMap(mapId)

		// Get tile size from map (default to 32 if map not loaded)
		const map = this.managers.map.getMap(mapId)
		const TILE_SIZE = map?.tiledMap?.tilewidth || 32
		const placementFootprint = this.getRotatedFootprint(definition, rotation)
		const buildingWidth = placementFootprint.width * TILE_SIZE
		const buildingHeight = placementFootprint.height * TILE_SIZE
		const existingObjects = this.managers.mapObjects.getObjectsInArea(mapId, position, buildingWidth, buildingHeight)

		this.logger.debug(`Checking collision for building ${definition.id} at position (${position.x}, ${position.y}) with footprint ${definition.footprint.width}x${definition.footprint.height} (${buildingWidth}x${buildingHeight} pixels)`)

		// Check collision with map tiles (non-passable tiles)
		if (this.checkMapTileCollision(mapId, position, definition, rotation, TILE_SIZE)) {
			this.logger.debug(`❌ Collision with map tiles at position:`, position)
			return true
		}

		// Check collision with existing buildings
		for (const building of existingBuildings) {
			const def = this.state.definitions.get(building.buildingId)
			if (!def) continue

			const existingFootprint = this.getRotatedFootprint(def, typeof building.rotation === 'number' ? building.rotation : 0)
			const existingWidth = existingFootprint.width * TILE_SIZE
			const existingHeight = existingFootprint.height * TILE_SIZE

			this.logger.debug(`Checking against existing building at (${building.position.x}, ${building.position.y}) with footprint ${def.footprint.width}x${def.footprint.height} (${existingWidth}x${existingHeight} pixels)`)

			if (this.doRectanglesOverlap(
				position, buildingWidth, buildingHeight,
				building.position, existingWidth, existingHeight
			)) {
				this.logger.debug(`❌ Collision with existing building ${building.id}`)
				return true // Collision detected
			}
		}

		// Check access tile collision (walkable + avoids existing buildings)
		if (this.checkAccessTileCollision(mapId, position, definition, rotation, TILE_SIZE, existingBuildings)) {
			this.logger.debug(`❌ Collision with access tile at position:`, position)
			return true
		}

		// Check collision with existing map objects
		for (const obj of existingObjects) {
			if (MINE_BUILDING_IDS.has(definition.id)) {
				const nodeType = obj.metadata?.resourceNodeType as string | undefined
				if (nodeType && RESOURCE_NODE_TYPES.has(nodeType)) {
					// Allow mines/quarries to replace deposits without collision blocking.
					continue
				}
			}
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
		rotation: number,
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

		const footprint = this.getRotatedFootprint(definition, rotation)
		const allowedGroundTypes = definition.allowedGroundTypes || []
		const enforceGroundTypes = allowedGroundTypes.length > 0

		// Check all tiles within the building's footprint
		for (let tileY = 0; tileY < footprint.height; tileY++) {
			for (let tileX = 0; tileX < footprint.width; tileX++) {
				const checkTileX = startTileX + tileX
				const checkTileY = startTileY + tileY

				if (enforceGroundTypes) {
					const groundType = this.managers.map.getGroundTypeAt(mapId, checkTileX, checkTileY)
					if (!groundType || !allowedGroundTypes.includes(groundType)) {
						this.logger.debug(`Ground type mismatch at tile (${checkTileX}, ${checkTileY})`)
						return true
					}
					// Allow placement on allowed ground types even if the collision layer is marked
					if (this.managers.map.isCollision(mapId, checkTileX, checkTileY)) {
						continue
					}
				}

				// Check if this tile has collision (non-zero value in collision data)
				if (this.managers.map.isCollision(mapId, checkTileX, checkTileY)) {
					this.logger.debug(`Collision detected at tile (${checkTileX}, ${checkTileY})`)
					return true
				}
			}
		}

		return false // No collision with map tiles
	}

	/**
	 * Check if access tiles overlap collisions or existing buildings.
	 */
	private checkAccessTileCollision(
		mapId: string,
		position: { x: number, y: number },
		definition: BuildingDefinition,
		rotation: number,
		tileSize: number,
		existingBuildings: BuildingInstance[]
	): boolean {
		const accessTiles = definition.accessTiles
		if (!accessTiles || accessTiles.length === 0) {
			return false
		}

		const map = this.managers.map.getMap(mapId)
		if (!map) {
			return false
		}

		const startTileX = Math.floor(position.x / tileSize)
		const startTileY = Math.floor(position.y / tileSize)
		const width = definition.footprint.width
		const height = definition.footprint.height
		const normalized = accessTiles.map((tile) => ({
			x: Math.round(tile.x),
			y: Math.round(tile.y)
		}))

		for (const tile of normalized) {
			const rotated = rotatePointOffset(tile, width, height, rotation)
			const accessTileX = startTileX + Math.round(rotated.x)
			const accessTileY = startTileY + Math.round(rotated.y)

			if (this.managers.map.isCollision(mapId, accessTileX, accessTileY)) {
				this.logger.debug(`Access tile collision at tile (${accessTileX}, ${accessTileY})`)
				return true
			}

			const accessPosition = {
				x: accessTileX * tileSize,
				y: accessTileY * tileSize
			}

			for (const building of existingBuildings) {
				const def = this.state.definitions.get(building.buildingId)
				if (!def) continue

				const existingFootprint = this.getRotatedFootprint(def, typeof building.rotation === 'number' ? building.rotation : 0)
				const existingWidth = existingFootprint.width * tileSize
				const existingHeight = existingFootprint.height * tileSize

				if (this.doRectanglesOverlap(
					accessPosition, tileSize, tileSize,
					building.position, existingWidth, existingHeight
				)) {
					this.logger.debug(`Access tile overlaps existing building ${building.id}`)
					return true
				}
			}
		}

		return false
	}

	private getRotatedFootprint(definition: BuildingDefinition, rotation: number): { width: number; height: number } {
		const turns = normalizeQuarterTurns(rotation)
		if (turns % 2 === 0) {
			return { width: definition.footprint.width, height: definition.footprint.height }
		}
		return { width: definition.footprint.height, height: definition.footprint.width }
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
		const definition = this.state.definitions.get(building.buildingId)
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
		const buildingsInMap = Array.from(this.state.buildings.values()).filter(
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
		const globalProductionPlans = this.ensureGlobalPlansForPlayer(client.id)
		client.emit(Receiver.Sender, BuildingsEvents.SC.Catalog, {
			buildings: buildingDefinitions,
			globalProductionPlans: Object.fromEntries(globalProductionPlans.entries())
		})
		this.logger.debug(`Catalog event emitted to client ${client.id}`)
	}

	public loadBuildings(definitions: BuildingDefinition[]): void {
		this.logger.log(`Loading ${definitions.length} building definitions`)
		this.state.defaultProductionPlans.clear()
		for (const definition of definitions) {
			this.state.definitions.set(definition.id, definition)
			const defaultPlan = this.buildDefaultProductionPlan(definition)
			if (defaultPlan) {
				this.state.defaultProductionPlans.set(definition.id, defaultPlan)
			}
			this.logger.debug(`Loaded building: ${definition.id} - ${definition.name}`)
		}
		this.logger.log(`Total building definitions: ${this.state.definitions.size}`)

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
		return this.state.definitions.get(buildingId)
	}

	public getAllBuildingDefinitions(): BuildingDefinition[] {
		return Array.from(this.state.definitions.values())
	}

	public getBuildingInstance(buildingInstanceId: string): BuildingInstance | undefined {
		return this.state.buildings.get(buildingInstanceId)
	}

	public hasConstructionNeedForItem(mapId: string, playerId: string, itemType: ItemType): boolean {
		for (const building of this.state.buildings.values()) {
			if (building.mapId !== mapId || building.playerId !== playerId) {
				continue
			}
			if (building.stage !== ConstructionStage.CollectingResources) {
				continue
			}
			const requiredCost = building.requiredResources.find(cost => cost.itemType === itemType)
			if (!requiredCost) {
				continue
			}
			const collected = building.collectedResources.get(itemType) || 0
			if (collected < requiredCost.quantity) {
				return true
			}
		}
		return false
	}

	public getStorageRequestCandidates(buildingInstanceId: string): ItemType[] {
		const building = this.state.buildings.get(buildingInstanceId)
		if (!building) {
			return []
		}
		const definition = this.state.definitions.get(building.buildingId)
		return this.getWarehouseItemTypes(definition)
	}

	public getStorageRequestItems(buildingInstanceId: string): ItemType[] {
		const building = this.state.buildings.get(buildingInstanceId)
		if (!building) {
			return []
		}
		const definition = this.state.definitions.get(building.buildingId)
		if (!definition) {
			return []
		}
		const normalized = this.normalizeStorageRequests(definition, building.storageRequests)
		return normalized ?? []
	}

	public isStorageRequestEnabled(buildingInstanceId: string, itemType: ItemType): boolean {
		const requested = this.getStorageRequestItems(buildingInstanceId)
		return requested.includes(itemType)
	}

	public isProductionPaused(buildingInstanceId: string): boolean {
		const building = this.state.buildings.get(buildingInstanceId)
		return Boolean(building?.productionPaused)
	}

	public setProductionPaused(buildingInstanceId: string, paused: boolean): void {
		const building = this.state.buildings.get(buildingInstanceId)
		if (!building) {
			return
		}
		if (building.productionPaused === paused) {
			return
		}
		building.productionPaused = paused
	}

	public getEffectiveProductionPlan(buildingInstanceId: string): ProductionPlan | undefined {
		const building = this.state.buildings.get(buildingInstanceId)
		if (!building) {
			return undefined
		}
		const definition = this.state.definitions.get(building.buildingId)
		if (!definition) {
			return undefined
		}
		const recipes = getProductionRecipes(definition)
		if (recipes.length === 0) {
			return undefined
		}
		const globalPlan = this.ensureGlobalPlanForPlayer(building.playerId, definition)
		if (building.useGlobalProductionPlan === false) {
			return this.normalizeProductionPlan(definition, building.productionPlan, globalPlan) ?? globalPlan
		}
		return globalPlan
	}

	public getProductionCounts(buildingInstanceId: string): Record<string, number> {
		const counts = this.state.productionCountsByBuilding.get(buildingInstanceId)
		if (!counts) {
			return {}
		}
		return Object.fromEntries(counts.entries())
	}

	public recordProduction(buildingInstanceId: string, recipeId: string | undefined, quantity = 1): void {
		if (!recipeId || quantity <= 0) {
			return
		}
		let counts = this.state.productionCountsByBuilding.get(buildingInstanceId)
		if (!counts) {
			counts = new Map<string, number>()
			this.state.productionCountsByBuilding.set(buildingInstanceId, counts)
		}
		const current = counts.get(recipeId) || 0
		counts.set(recipeId, current + quantity)
	}

	public getBuildingsForMap(mapId: string): BuildingInstance[] {
		return Array.from(this.state.buildings.values()).filter(
			building => building.mapId === mapId
		)
	}

	public getAllBuildings(): BuildingInstance[] {
		return Array.from(this.state.buildings.values())
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

	public getBuildingAccessPoints(buildingInstanceId: string): { entry?: Position; center?: Position; accessTiles?: Position[] } | null {
		const building = this.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return null
		}
		const definition = this.getBuildingDefinition(building.buildingId)
		if (!definition) {
			return null
		}
		const entry = definition.entryPoint
		const center = definition.centerPoint
		const accessTiles = definition.accessTiles
		if (!entry && !center && (!accessTiles || accessTiles.length === 0)) {
			return null
		}
		const map = this.managers.map.getMap(building.mapId)
		const tileSize = map?.tiledMap?.tilewidth || 32
		const rotation = typeof building.rotation === 'number' ? building.rotation : 0
		const width = definition.footprint.width
		const height = definition.footprint.height
		const result: { entry?: Position; center?: Position; accessTiles?: Position[] } = {}
		if (entry) {
			const rotated = rotatePointOffset(entry, width, height, rotation)
			result.entry = {
				x: building.position.x + rotated.x * tileSize,
				y: building.position.y + rotated.y * tileSize
			}
		}
		if (center) {
			const rotated = rotatePointOffset(center, width, height, rotation)
			result.center = {
				x: building.position.x + rotated.x * tileSize,
				y: building.position.y + rotated.y * tileSize
			}
		}
		if (accessTiles && accessTiles.length > 0) {
			const seen = new Set<string>()
			const positions: Position[] = []
			for (const tile of accessTiles) {
				const normalized = { x: Math.round(tile.x), y: Math.round(tile.y) }
				const rotated = rotatePointOffset(normalized, width, height, rotation)
				const key = `${rotated.x},${rotated.y}`
				if (seen.has(key)) {
					continue
				}
				seen.add(key)
				positions.push({
					x: building.position.x + (rotated.x + 0.5) * tileSize,
					y: building.position.y + (rotated.y + 0.5) * tileSize
				})
			}
			if (positions.length > 0) {
				result.accessTiles = positions
			}
		}
		return result
	}

	// Check if building needs workers
	public getBuildingNeedsWorkers(buildingInstanceId: string): boolean {
		const building = this.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return false
		}

		const definition = this.state.definitions.get(building.buildingId)
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
		const currentWorkers = this.state.assignedWorkers.get(buildingInstanceId)?.size || 0
		return currentWorkers < definition.workerSlots
	}

		return false
	}

	public buildingNeedsResource(buildingInstanceId: string, itemType: string): boolean {
		const neededResources = this.state.resourceRequests.get(buildingInstanceId)
		if (!neededResources) {
			return false
		}
		return neededResources.has(itemType)
	}

	public setAssignedWorker(buildingInstanceId: string, settlerId: string, assigned: boolean): void {
		if (!this.state.assignedWorkers.has(buildingInstanceId)) {
			this.state.assignedWorkers.set(buildingInstanceId, new Set())
		}
		const set = this.state.assignedWorkers.get(buildingInstanceId)!
		if (assigned) {
			set.add(settlerId)
		} else {
			set.delete(settlerId)
		}
	}

	public setConstructionWorkerActive(buildingInstanceId: string, settlerId: string, active: boolean): void {
		if (!this.state.activeConstructionWorkers.has(buildingInstanceId)) {
			this.state.activeConstructionWorkers.set(buildingInstanceId, new Set())
		}
		const set = this.state.activeConstructionWorkers.get(buildingInstanceId)!
		if (active) {
			set.add(settlerId)
		} else {
			set.delete(settlerId)
			if (set.size === 0) {
				this.state.activeConstructionWorkers.delete(buildingInstanceId)
			}
		}
	}

	public getBuildingsNeedingResources(): string[] {
		const results: string[] = []
		for (const [buildingId, needed] of this.state.resourceRequests.entries()) {
			if (needed.size > 0) {
				results.push(buildingId)
			}
		}
		return results
	}

	public getNeededResources(buildingInstanceId: string): Array<{ itemType: string, remaining: number }> {
		const building = this.state.buildings.get(buildingInstanceId)
		if (!building) {
			return []
		}
		const neededResources = this.state.resourceRequests.get(buildingInstanceId)
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
		const workers = this.state.assignedWorkers.get(buildingInstanceId)
		if (!workers) {
			return []
		}
		return Array.from(workers)
	}

	// Update tick to account for worker speedup
	private calculateConstructionProgress(building: BuildingInstance, deltaSeconds: number): number {
		const definition = this.state.definitions.get(building.buildingId)
		if (!definition) {
			return building.progress
		}

		const workerCount = this.state.activeConstructionWorkers.get(building.id)?.size || 0
		
		// Apply speedup: each worker doubles construction speed (up to 4x with 2 workers for now)
		const speedup = 1 + (workerCount * 0.5) // 1x base, 1.5x with 1 worker, 2x with 2 workers, etc.
		
		const progressIncrease = (deltaSeconds / definition.constructionTime) * 100 * speedup
		const progress = Math.min(100, building.progress + progressIncrease)

		return progress
	}

	private getWarehouseItemTypes(definition?: BuildingDefinition): ItemType[] {
		if (!definition?.isWarehouse || !definition.storageSlots || definition.storageSlots.length === 0) {
			return []
		}
		const seen = new Set<ItemType>()
		const items: ItemType[] = []
		for (const slot of definition.storageSlots) {
			if (!slot.itemType || seen.has(slot.itemType)) {
				continue
			}
			seen.add(slot.itemType)
			items.push(slot.itemType)
		}
		return items
	}

	private normalizeStorageRequests(definition: BuildingDefinition, itemTypes?: ItemType[]): ItemType[] | undefined {
		const candidates = this.getWarehouseItemTypes(definition)
		if (candidates.length === 0) {
			return undefined
		}
		const allowed = new Set(candidates)
		const requested = Array.isArray(itemTypes) ? itemTypes.filter(item => allowed.has(item)) : candidates
		const unique: ItemType[] = []
		const seen = new Set<ItemType>()
		for (const item of requested) {
			if (seen.has(item)) {
				continue
			}
			seen.add(item)
			unique.push(item)
		}
		return unique
	}

	private getOrCreateGlobalPlansForPlayer(playerId: string): Map<BuildingId, ProductionPlan> {
		let plans = this.state.globalProductionPlansByPlayer.get(playerId)
		if (!plans) {
			plans = new Map<BuildingId, ProductionPlan>()
			this.state.globalProductionPlansByPlayer.set(playerId, plans)
		}
		return plans
	}

	private ensureGlobalPlansForPlayer(playerId: string): Map<BuildingId, ProductionPlan> {
		const plans = this.getOrCreateGlobalPlansForPlayer(playerId)
		for (const definition of this.state.definitions.values()) {
			if (!this.state.defaultProductionPlans.has(definition.id)) {
				continue
			}
			if (!plans.has(definition.id)) {
				const defaultPlan = this.state.defaultProductionPlans.get(definition.id)
				if (defaultPlan) {
					plans.set(definition.id, { ...defaultPlan })
				}
			}
		}
		return plans
	}

	private ensureGlobalPlanForPlayer(playerId: string, definition: BuildingDefinition): ProductionPlan {
		const plans = this.getOrCreateGlobalPlansForPlayer(playerId)
		const existing = plans.get(definition.id)
		if (existing) {
			return existing
		}
		const defaultPlan = this.state.defaultProductionPlans.get(definition.id) ?? this.buildDefaultProductionPlan(definition)
		const plan = defaultPlan ? { ...defaultPlan } : {}
		plans.set(definition.id, plan)
		return plan
	}

	private buildDefaultProductionPlan(definition: BuildingDefinition): ProductionPlan | undefined {
		const recipes = getProductionRecipes(definition)
		if (recipes.length === 0) {
			return undefined
		}
		const defaults = definition.productionPlanDefaults || {}
		const plan: ProductionPlan = {}
		for (const recipe of recipes) {
			const raw = defaults[recipe.id]
			const weight = typeof raw === 'number' && Number.isFinite(raw) ? raw : 1
			plan[recipe.id] = Math.max(0, weight)
		}
		return plan
	}

	private normalizeProductionPlan(
		definition: BuildingDefinition,
		plan?: ProductionPlan,
		fallback?: ProductionPlan
	): ProductionPlan | undefined {
		const recipes = getProductionRecipes(definition)
		if (recipes.length === 0) {
			return undefined
		}
		const normalized: ProductionPlan = {}
		for (const recipe of recipes) {
			const raw = plan?.[recipe.id]
			const fallbackValue = fallback?.[recipe.id]
			let weight = typeof raw === 'number' && Number.isFinite(raw)
				? raw
				: (typeof fallbackValue === 'number' && Number.isFinite(fallbackValue) ? fallbackValue : 0)
			if (weight < 0) {
				weight = 0
			}
			normalized[recipe.id] = weight
		}
		return normalized
	}

	public destroy() {
		// no-op for now (tick-driven construction)
	}

	serialize(): BuildingsSnapshot {
		return this.state.serialize()
	}

	deserialize(state: BuildingsSnapshot): void {
		this.state.deserialize(state)

		this.initializeStorageForExistingBuildings()
		this.initializeCollisionForExistingBuildings()
		this.initializeConstructionPenaltyForExistingBuildings()
	}

	private initializeStorageForExistingBuildings(): void {
		if (!this.managers.storage || this.state.definitions.size === 0) {
			return
		}
		for (const building of this.state.buildings.values()) {
			const definition = this.state.definitions.get(building.buildingId)
			if (definition) {
				const normalized = this.normalizeStorageRequests(definition, building.storageRequests)
				if (normalized) {
					building.storageRequests = normalized
				}
			}
			if (building.stage !== ConstructionStage.Completed) {
				continue
			}
			if (!definition?.storageSlots || definition.storageSlots.length === 0) {
				continue
			}
			if (this.managers.storage.getBuildingStorage(building.id)) {
				continue
			}
			this.managers.storage.initializeBuildingStorage(building.id)
		}
	}

	private initializeCollisionForExistingBuildings(): void {
		if (this.state.definitions.size === 0) {
			return
		}
		for (const building of this.state.buildings.values()) {
			if (building.stage !== ConstructionStage.Completed) {
				continue
			}
			this.updateBlockedTiles(building, true)
		}
	}

	private initializeConstructionPenaltyForExistingBuildings(): void {
		if (this.state.definitions.size === 0) {
			return
		}
		for (const building of this.state.buildings.values()) {
			if (building.stage === ConstructionStage.Completed) {
				continue
			}
			this.updateConstructionPenalty(building, true)
		}
	}

	reset(): void {
		this.managers.map.resetConstructionPenalties()
		this.state.reset()
	}
}

const HALF_PI = Math.PI / 2

function normalizeQuarterTurns(rotation: number): number {
	if (!Number.isFinite(rotation)) return 0
	const turns = Math.round(rotation / HALF_PI)
	const normalized = ((turns % 4) + 4) % 4
	return normalized
}

function rotatePointOffset(
	offset: { x: number; y: number },
	width: number,
	height: number,
	rotation: number
): { x: number; y: number } {
	const turns = normalizeQuarterTurns(rotation)
	if (turns === 0) {
		return { x: offset.x, y: offset.y }
	}
	if (turns === 1) {
		return { x: offset.y, y: width - offset.x }
	}
	if (turns === 2) {
		return { x: width - offset.x, y: height - offset.y }
	}
	return { x: height - offset.y, y: offset.x }
}

export * from './BuildingManagerState'
