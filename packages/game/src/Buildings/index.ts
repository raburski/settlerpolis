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
	BuildingCancelledData
} from './types'
import { Receiver } from '../Receiver'
import { v4 as uuidv4 } from 'uuid'
import { InventoryManager } from '../Inventory'
import { MapObjectsManager } from '../MapObjects'
import { ItemsManager } from '../Items'
import { MapManager } from '../Map'
import { PlayerJoinData, PlayerTransitionData } from '../Players/types'
import { PlaceObjectData } from '../MapObjects/types'
import { Item } from '../Items/types'

export class BuildingManager {
	private buildings = new Map<string, BuildingInstance>() // buildingInstanceId -> BuildingInstance
	private definitions = new Map<BuildingId, BuildingDefinition>() // buildingId -> BuildingDefinition
	private constructionTimers = new Map<string, NodeJS.Timeout>() // buildingInstanceId -> timer
	private buildingToMapObject = new Map<string, string>() // buildingInstanceId -> mapObjectId
	private tickInterval: NodeJS.Timeout | null = null
	private readonly TICK_INTERVAL_MS = 1000 // Update construction progress every second

	constructor(
		private event: EventManager,
		private inventoryManager: InventoryManager,
		private mapObjectsManager: MapObjectsManager,
		private itemsManager: ItemsManager,
		private mapManager: MapManager
	) {
		this.setupEventHandlers()
		this.startTickLoop()
		
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

		// Handle player join to send existing buildings and building catalog
		this.event.on<PlayerJoinData>(Event.Players.CS.Join, (data, client) => {
			this.sendBuildingsToClient(client, data.mapId)
			this.sendBuildingCatalog(client)
		})

		// Handle player transition to send buildings for new map
		this.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, (data, client) => {
			this.sendBuildingsToClient(client, data.mapId)
		})
	}

	private startTickLoop() {
		// Start a periodic tick loop to update construction progress
		this.tickInterval = setInterval(() => {
			this.tick()
		}, this.TICK_INTERVAL_MS)
	}

	private tick() {
		const now = Date.now()
		const buildingsToUpdate: BuildingInstance[] = []

		// Collect all buildings that are under construction
		for (const building of this.buildings.values()) {
			if (building.stage === ConstructionStage.Foundation || building.stage === ConstructionStage.Constructing) {
				buildingsToUpdate.push(building)
			}
		}

		// Update progress for each building
		for (const building of buildingsToUpdate) {
			const definition = this.definitions.get(building.buildingId)
			if (!definition) continue

			const elapsed = (now - building.startedAt) / 1000 // elapsed time in seconds
			const progress = Math.min(100, (elapsed / definition.constructionTime) * 100)

			// Update building progress
			building.progress = progress
			building.stage = progress < 100 ? ConstructionStage.Constructing : ConstructionStage.Completed

			// Emit progress update
			const progressData: BuildingProgressData = {
				buildingInstanceId: building.id,
				progress,
				stage: building.stage
			}
			this.event.emit(Receiver.Group, BuildingsEvents.SC.Progress, progressData, building.mapName)

			// Check if construction is complete
			if (progress >= 100 && building.stage === ConstructionStage.Completed) {
				this.completeBuilding(building)
			}
		}
	}

	private placeBuilding(data: PlaceBuildingData, client: EventClient) {
		const { buildingId, position } = data
		const definition = this.definitions.get(buildingId)

		if (!definition) {
			console.error(`Building definition not found: ${buildingId}`)
			return
		}

		// Check if player has required resources
		if (!this.hasRequiredResources(definition.costs, client.id)) {
			console.error(`Player ${client.id} does not have required resources for building ${buildingId}`)
			// TODO: Emit error event to client
			return
		}

		// Check for collisions using building footprint
		if (this.checkBuildingCollision(client.currentGroup, position, definition)) {
			console.error(`Cannot place building at position due to collision:`, position)
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

		// Place the building object on the map
		// Store building footprint in metadata so MapObjectsManager can use it for collision
		const placeObjectData: PlaceObjectData = {
			position,
			item: buildingItem,
			metadata: {
				buildingId,
				buildingInstanceId: '', // Will be set after creation
				stage: ConstructionStage.Foundation,
				progress: 0,
				footprint: {
					width: definition.footprint.width,
					height: definition.footprint.height
				}
			}
		}

		// Create building instance first to get the ID
		const buildingInstance: BuildingInstance = {
			id: uuidv4(),
			buildingId,
			playerId: client.id,
			mapName: client.currentGroup,
			position,
			stage: ConstructionStage.Foundation,
			progress: 0,
			startedAt: Date.now(),
			createdAt: Date.now()
		}

		// Update metadata with building instance ID
		if (placeObjectData.metadata) {
			placeObjectData.metadata.buildingInstanceId = buildingInstance.id
		}

		// Try to place the object
		const placedObject = this.mapObjectsManager.placeObject(client.id, placeObjectData, client)
		if (!placedObject) {
			console.error(`Failed to place building at position:`, position)
			return
		}

		// Store mapping between building instance and map object
		this.buildingToMapObject.set(buildingInstance.id, placedObject.id)

		// Remove required resources from inventory (only after successful placement)
		this.removeRequiredResources(definition.costs, client)

		// Store building instance
		this.buildings.set(buildingInstance.id, buildingInstance)

		// Emit placed event
		const placedData: BuildingPlacedData = {
			building: buildingInstance
		}
		client.emit(Receiver.Group, BuildingsEvents.SC.Placed, placedData, client.currentGroup)
	}

	private cancelBuilding(data: CancelBuildingData, client: EventClient) {
		const { buildingInstanceId } = data
		const building = this.buildings.get(buildingInstanceId)

		if (!building) {
			console.error(`Building instance not found: ${buildingInstanceId}`)
			return
		}

		// Verify ownership
		if (building.playerId !== client.id) {
			console.error(`Player ${client.id} does not own building ${buildingInstanceId}`)
			return
		}

		// Stop construction timer if exists
		const timer = this.constructionTimers.get(buildingInstanceId)
		if (timer) {
			clearTimeout(timer)
			this.constructionTimers.delete(buildingInstanceId)
		}

		// Calculate refund (partial refund based on progress)
		const refundedItems = this.calculateRefund(building)

		// Refund resources
		for (const cost of refundedItems) {
			for (let i = 0; i < cost.quantity; i++) {
				const item: Item = {
					id: uuidv4(),
					itemType: cost.itemType
				}
				this.inventoryManager.addItem(client, item)
			}
		}

		// Remove building from map objects
		const mapObjectId = this.buildingToMapObject.get(buildingInstanceId)
		if (mapObjectId) {
			this.mapObjectsManager.removeObjectById(mapObjectId, building.mapName)
			this.buildingToMapObject.delete(buildingInstanceId)
		}

		// Remove building instance
		this.buildings.delete(buildingInstanceId)

		// Emit cancelled event
		const cancelledData: BuildingCancelledData = {
			buildingInstanceId,
			refundedItems
		}
		client.emit(Receiver.Group, BuildingsEvents.SC.Cancelled, cancelledData, building.mapName)
	}

	private completeBuilding(building: BuildingInstance) {
		// Update building stage
		building.stage = ConstructionStage.Completed

		// Update MapObject metadata to reflect completion
		const mapObjectId = this.buildingToMapObject.get(building.id)
		if (mapObjectId) {
			const mapObject = this.mapObjectsManager.getObjectById(mapObjectId)
			if (mapObject && mapObject.metadata) {
				mapObject.metadata.stage = ConstructionStage.Completed
				mapObject.metadata.progress = 100
				// Emit update to clients - MapObjectsManager doesn't have an update event,
				// so we'll rely on the building completed event for UI updates
			}
		}

		// Emit completed event
		const completedData: BuildingCompletedData = {
			building
		}
		this.event.emit(Receiver.Group, BuildingsEvents.SC.Completed, completedData, building.mapName)
	}

	private checkBuildingCollision(mapName: string, position: { x: number, y: number }, definition: BuildingDefinition): boolean {
		// Get all existing buildings and map objects in this map
		const existingBuildings = this.getBuildingsForMap(mapName)
		const existingObjects = this.mapObjectsManager.getAllObjectsForMap(mapName)

		// Get tile size from map (default to 32 if map not loaded)
		const map = this.mapManager.getMap(mapName)
		const TILE_SIZE = map?.tiledMap?.tilewidth || 32
		const buildingWidth = definition.footprint.width * TILE_SIZE
		const buildingHeight = definition.footprint.height * TILE_SIZE

		console.log(`[BuildingManager] Checking collision for building ${definition.id} at position (${position.x}, ${position.y}) with footprint ${definition.footprint.width}x${definition.footprint.height} (${buildingWidth}x${buildingHeight} pixels)`)

		// Check collision with map tiles (non-passable tiles)
		if (this.checkMapTileCollision(mapName, position, definition, TILE_SIZE)) {
			console.log(`[BuildingManager] ❌ Collision with map tiles at position:`, position)
			return true
		}

		// Check collision with existing buildings
		for (const building of existingBuildings) {
			const def = this.definitions.get(building.buildingId)
			if (!def) continue

			// Convert existing building footprint to pixels
			const existingWidth = def.footprint.width * TILE_SIZE
			const existingHeight = def.footprint.height * TILE_SIZE

			console.log(`[BuildingManager] Checking against existing building at (${building.position.x}, ${building.position.y}) with footprint ${def.footprint.width}x${def.footprint.height} (${existingWidth}x${existingHeight} pixels)`)

			if (this.doRectanglesOverlap(
				position, buildingWidth, buildingHeight,
				building.position, existingWidth, existingHeight
			)) {
				console.log(`[BuildingManager] ❌ Collision with existing building ${building.id}`)
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
				console.log(`[BuildingManager] Checking against map object (building) at (${obj.position.x}, ${obj.position.y}) with footprint ${obj.metadata.footprint.width}x${obj.metadata.footprint.height} (${objWidth}x${objHeight} pixels)`)
			} else {
				// Regular item: use placement size from metadata (already in pixels or tiles?)
				const itemMetadata = this.itemsManager.getItemMetadata(obj.item.itemType)
				const placementWidth = itemMetadata?.placement?.size?.width || 1
				const placementHeight = itemMetadata?.placement?.size?.height || 1
				// Assume placement size is in tiles, convert to pixels
				objWidth = placementWidth * TILE_SIZE
				objHeight = placementHeight * TILE_SIZE
			}

			// Only check collision if the object blocks placement
			const itemMetadata = this.itemsManager.getItemMetadata(obj.item.itemType)
			if (itemMetadata?.placement?.blocksPlacement || obj.metadata?.buildingId) {
				if (this.doRectanglesOverlap(
					position, buildingWidth, buildingHeight,
					obj.position, objWidth, objHeight
				)) {
					console.log(`[BuildingManager] ❌ Collision with map object ${obj.id}`)
					return true // Collision detected
				}
			}
		}

		console.log(`[BuildingManager] ✅ No collision detected, placement allowed`)
		return false // No collision
	}

	/**
	 * Check if building footprint overlaps with non-passable map tiles
	 * @param mapName Map identifier
	 * @param position Building position in pixels
	 * @param definition Building definition with footprint
	 * @param tileSize Tile size in pixels
	 * @returns true if collision with map tiles detected
	 */
	private checkMapTileCollision(
		mapName: string,
		position: { x: number, y: number },
		definition: BuildingDefinition,
		tileSize: number
	): boolean {
		// Get map data
		const map = this.mapManager.getMap(mapName)
		if (!map) {
			console.warn(`[BuildingManager] Map ${mapName} not found, allowing placement`)
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
				if (this.mapManager.isCollision(mapName, checkTileX, checkTileY)) {
					console.log(`[BuildingManager] Collision detected at tile (${checkTileX}, ${checkTileY})`)
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
			if (!this.inventoryManager.doesHave(cost.itemType, cost.quantity, playerId)) {
				return false
			}
		}
		return true
	}

	private removeRequiredResources(costs: BuildingCost[], client: EventClient) {
		for (const cost of costs) {
			this.inventoryManager.removeItemByType(client, cost.itemType, cost.quantity)
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

	private sendBuildingsToClient(client: EventClient, mapName?: string) {
		const targetMap = mapName || client.currentGroup
		const buildingsInMap = Array.from(this.buildings.values()).filter(
			building => building.mapName === targetMap
		)

		for (const building of buildingsInMap) {
			const placedData: BuildingPlacedData = {
				building
			}
			client.emit(Receiver.Sender, BuildingsEvents.SC.Placed, placedData)
		}
	}

	private sendBuildingCatalog(client: EventClient) {
		// Send all available building definitions to the client
		const buildingDefinitions = this.getAllBuildingDefinitions()
		console.log(`[BuildingManager] Sending building catalog to client ${client.id}:`, buildingDefinitions.length, 'buildings')
		console.log(`[BuildingManager] Event name: ${BuildingsEvents.SC.Catalog}`)
		console.log(`[BuildingManager] Receiver: Sender`)
		console.log(`[BuildingManager] Buildings:`, buildingDefinitions.map(b => ({ id: b.id, name: b.name })))
		if (buildingDefinitions.length === 0) {
			console.warn('[BuildingManager] No building definitions loaded! Check content loading.')
			return
		}
		client.emit(Receiver.Sender, BuildingsEvents.SC.Catalog, {
			buildings: buildingDefinitions
		})
		console.log(`[BuildingManager] Catalog event emitted to client ${client.id}`)
	}

	public loadBuildings(definitions: BuildingDefinition[]): void {
		console.log(`[BuildingManager] Loading ${definitions.length} building definitions`)
		for (const definition of definitions) {
			this.definitions.set(definition.id, definition)
			console.log(`[BuildingManager] Loaded building: ${definition.id} - ${definition.name}`)
		}
		console.log(`[BuildingManager] Total building definitions: ${this.definitions.size}`)
		
		// After buildings are loaded, send catalog to all existing clients
		// This ensures clients that connected before buildings were loaded will still receive them
		this.broadcastCatalogToAllClients()
	}
	
	private broadcastCatalogToAllClients() {
		// This is a workaround - we need to send catalog to clients that might have connected
		// before buildings were loaded. For now, we'll rely on the player join event.
		// In a real implementation, we'd track connected clients and send to them here.
		console.log('[BuildingManager] Buildings loaded, catalog will be sent on next player join')
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

	public getBuildingsForMap(mapName: string): BuildingInstance[] {
		return Array.from(this.buildings.values()).filter(
			building => building.mapName === mapName
		)
	}

	public destroy() {
		// Clear all timers
		if (this.tickInterval) {
			clearInterval(this.tickInterval)
			this.tickInterval = null
		}

		for (const timer of this.constructionTimers.values()) {
			clearTimeout(timer)
		}
		this.constructionTimers.clear()
	}
}

