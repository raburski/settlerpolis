import { EventManager, Event } from '../events'
import { BuildingManager } from '../Buildings'
import { StorageManager } from '../Storage'
import { JobsManager } from '../Jobs'
import { LootManager } from '../Loot'
import { Logger } from '../Logs'
import { ProductionEvents } from './events'
import { BuildingProduction, ProductionRecipe, ProductionStatus } from './types'
import { BuildingInstance } from '../Buildings/types'
import { Position } from '../types'
import { Receiver } from '../Receiver'
import { calculateDistance } from '../utils'
import { JobType } from '../Population/types'
import { SimulationEvents } from '../Simulation/events'
import { SimulationTickData } from '../Simulation/types'

export class ProductionManager {
	private buildingProductions: Map<string, BuildingProduction> = new Map() // buildingInstanceId -> BuildingProduction
	private readonly PRODUCTION_TICK_INTERVAL_MS = 1000
	private tickAccumulatorMs = 0
	private simulationTimeMs = 0

	constructor(
		private event: EventManager,
		private buildingManager: BuildingManager,
		private storageManager: StorageManager,
		private jobsManager: JobsManager,
		private lootManager: LootManager,
		private logger: Logger
	) {
		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		// Listen for production tick events
		this.event.on(ProductionEvents.SS.ProductionTick, () => {
			this.productionTick()
		})

		this.event.on(SimulationEvents.SS.Tick, (data: SimulationTickData) => {
			this.handleSimulationTick(data)
		})

		// Listen for worker assignment events - when a worker is assigned to a production building, try to start production
		this.event.on(Event.Population.SC.WorkerAssigned, (data: { jobAssignment: any, settlerId: string, buildingInstanceId: string }) => {
			const buildingInstanceId = data.buildingInstanceId
			const jobAssignment = data.jobAssignment
			
			this.logger.log(`[ProductionManager] WorkerAssigned event received for building ${buildingInstanceId}, jobType: ${jobAssignment?.jobType}`)
			
			// Only handle production jobs
			if (jobAssignment && jobAssignment.jobType === JobType.Production) {
				this.logger.log(`[ProductionManager] Worker assigned to production building ${buildingInstanceId}, checking if production can start`)
				// Check if production can start (will request inputs if needed)
				this.checkAndStartProduction(buildingInstanceId)
			} else {
				this.logger.log(`[ProductionManager] WorkerAssigned event ignored - not a production job (jobType: ${jobAssignment?.jobType})`)
			}
		})

		// Listen for storage updated events - when items are added to storage, check if production can start
		// and request output transport if outputs are available
		this.event.on(Event.Storage.SC.StorageUpdated, (data: { buildingInstanceId: string, itemType: string, quantity: number, capacity: number }) => {
			const buildingInstanceId = data.buildingInstanceId
			const itemType = data.itemType

			const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
			if (!building) {
				return
			}

			const definition = this.buildingManager.getBuildingDefinition(building.buildingId)
			if (!definition) {
				return
			}
			
			// Check if this building has production
			const production = this.buildingProductions.get(buildingInstanceId)
			if (production && definition.productionRecipe) {
				const recipe = definition.productionRecipe

				// Check if the item type that was added is an input for this building
				const isInput = recipe.inputs.some(input => input.itemType === itemType)
				if (isInput) {
					this.logger.log(`[ProductionManager] Input ${itemType} added to building ${buildingInstanceId}, checking if production can start`)
					// Check if production can start (inputs may now be available)
					this.checkAndStartProduction(buildingInstanceId)
				}

				// Check if the item type that was added is an output for this building
				const isOutput = recipe.outputs.some(output => output.itemType === itemType)
				if (isOutput) {
					this.logger.log(`[ProductionManager] Output ${itemType} added to building ${buildingInstanceId}, requesting output transport`)
					// Request output transport (will only transport if there are destinations)
					this.requestOutputTransport(buildingInstanceId, recipe)
				}
			}

			if (definition.harvest && !definition.productionRecipe) {
				this.requestOutputTransportToConsumers(buildingInstanceId, itemType, 1)
			}
		})
	}

	private handleSimulationTick(data: SimulationTickData): void {
		this.simulationTimeMs = data.nowMs
		this.tickAccumulatorMs += data.deltaMs
		if (this.tickAccumulatorMs < this.PRODUCTION_TICK_INTERVAL_MS) {
			return
		}
		this.tickAccumulatorMs -= this.PRODUCTION_TICK_INTERVAL_MS
		this.event.emit(Receiver.All, ProductionEvents.SS.ProductionTick, {})
	}

	// Initialize production for a building (gets recipe from BuildingDefinition)
	public initializeBuildingProduction(buildingInstanceId: string): void {
		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (!building) {
			this.logger.warn(`[ProductionManager] Cannot initialize production: Building ${buildingInstanceId} not found`)
			return
		}

		const definition = this.buildingManager.getBuildingDefinition(building.buildingId)
		if (!definition) {
			this.logger.warn(`[ProductionManager] Cannot initialize production: Building definition ${building.buildingId} not found`)
			return
		}

		// Only initialize if building has production recipe
		if (!definition.productionRecipe) {
			return // Building has no production recipe
		}

		// Check if production already exists
		if (this.buildingProductions.has(buildingInstanceId)) {
			this.logger.log(`[ProductionManager] Production already initialized for building ${buildingInstanceId}`)
			return
		}

		const production: BuildingProduction = {
			buildingInstanceId,
			status: ProductionStatus.Idle,
			progress: 0,
			isProducing: false
		}

		this.buildingProductions.set(buildingInstanceId, production)
		this.logger.log(`[ProductionManager] Initialized production for building ${buildingInstanceId}`)

		// Try to start production if worker is assigned
		this.checkAndStartProduction(buildingInstanceId)
	}

	// Start production for a building
	public startProduction(buildingInstanceId: string): boolean {
		const production = this.buildingProductions.get(buildingInstanceId)
		if (!production) {
			this.logger.warn(`[ProductionManager] Cannot start production: Building ${buildingInstanceId} has no production`)
			return false
		}

		const recipe = this.getProductionRecipe(buildingInstanceId)
		if (!recipe) {
			this.logger.warn(`[ProductionManager] Cannot start production: Building ${buildingInstanceId} has no recipe`)
			return false
		}

		// Check if building has required inputs
		if (!this.hasRequiredInputs(buildingInstanceId, recipe)) {
			this.logger.log(`[ProductionManager] Cannot start production: Building ${buildingInstanceId} missing inputs`)
			production.status = ProductionStatus.NoInput
			this.emitStatusChanged(buildingInstanceId, ProductionStatus.NoInput)
			// Request input resources
			this.requestInputResources(buildingInstanceId, recipe)
			return false
		}

		// Check if building has worker assigned (if required)
		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return false
		}

		const definition = this.buildingManager.getBuildingDefinition(building.buildingId)
		if (!definition) {
			return false
		}

		// Require at least one assigned worker to run production
		const assignedWorkers = this.buildingManager.getBuildingWorkers(buildingInstanceId)
		if (assignedWorkers.length === 0) {
			production.status = ProductionStatus.NoWorker
			this.emitStatusChanged(buildingInstanceId, ProductionStatus.NoWorker)
			return false
		}

		// Start production
		production.status = ProductionStatus.InProduction
		production.isProducing = true
		production.currentBatchStartTime = this.simulationTimeMs
		production.progress = 0

		this.logger.log(`[ProductionManager] Started production for building ${buildingInstanceId}`)

		// Emit production started event
		this.event.emit(Receiver.Group, ProductionEvents.SC.ProductionStarted, {
			buildingInstanceId,
			recipe
		}, building.mapName)

		this.emitStatusChanged(buildingInstanceId, ProductionStatus.InProduction)

		return true
	}

	// Stop production for a building
	public stopProduction(buildingInstanceId: string): void {
		const production = this.buildingProductions.get(buildingInstanceId)
		if (!production) {
			return
		}

		production.isProducing = false
		production.status = ProductionStatus.Idle
		production.currentBatchStartTime = undefined
		production.progress = 0

		this.logger.log(`[ProductionManager] Stopped production for building ${buildingInstanceId}`)

		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (building) {
			this.event.emit(Receiver.Group, ProductionEvents.SC.ProductionStopped, {
				buildingInstanceId
			}, building.mapName)
		}

		this.emitStatusChanged(buildingInstanceId, ProductionStatus.Idle)
	}

	// Process production tick (convert inputs to outputs)
	private processProduction(buildingInstanceId: string): void {
		const production = this.buildingProductions.get(buildingInstanceId)
		if (!production || !production.isProducing) {
			return
		}

		const recipe = this.getProductionRecipe(buildingInstanceId)
		if (!recipe) {
			return
		}

		const now = this.simulationTimeMs
		if (!production.currentBatchStartTime) {
			production.currentBatchStartTime = now
			return
		}

		const elapsed = (now - production.currentBatchStartTime) / 1000 // elapsed time in seconds
		const progress = Math.min(100, (elapsed / recipe.productionTime) * 100)

		production.progress = progress

		// Emit progress update
		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (building) {
			this.event.emit(Receiver.Group, ProductionEvents.SC.ProductionProgress, {
				buildingInstanceId,
				progress
			}, building.mapName)
		}

		// Check if production is complete
		if (progress >= 100) {
			this.completeProduction(buildingInstanceId, recipe)
		}
	}

	// Complete production batch
	private completeProduction(buildingInstanceId: string, recipe: ProductionRecipe): void {
		const production = this.buildingProductions.get(buildingInstanceId)
		if (!production) {
			return
		}

		// Consume inputs
		if (!this.consumeInputs(buildingInstanceId, recipe)) {
			this.logger.warn(`[ProductionManager] Cannot complete production: Failed to consume inputs for building ${buildingInstanceId}`)
			return
		}

		// Produce outputs
		this.produceOutputs(buildingInstanceId, recipe)

		production.progress = 100
		production.isProducing = false
		production.currentBatchStartTime = undefined

		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (building) {
			this.event.emit(Receiver.Group, ProductionEvents.SC.ProductionCompleted, {
				buildingInstanceId,
				recipe
			}, building.mapName)
		}

		this.logger.log(`[ProductionManager] Completed production batch for building ${buildingInstanceId}`)

		// Note: Output transport is automatically requested via StorageUpdated event when outputs are added to storage
		// No need to explicitly call requestOutputTransport here

		// Check if next batch can start
		this.checkAndStartProduction(buildingInstanceId)
	}

	// Check and start production if conditions are met
	private checkAndStartProduction(buildingInstanceId: string): void {
		const production = this.buildingProductions.get(buildingInstanceId)
		if (!production) {
			return
		}

		// If already producing, don't start again
		if (production.isProducing) {
			return
		}

		// Try to start production
		this.startProduction(buildingInstanceId)
	}

	// Get production recipe for a building (from BuildingDefinition)
	private getProductionRecipe(buildingInstanceId: string): ProductionRecipe | null {
		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return null
		}

		const definition = this.buildingManager.getBuildingDefinition(building.buildingId)
		if (!definition) {
			return null
		}

		return definition.productionRecipe || null
	}

	// Check if building has required inputs
	private hasRequiredInputs(buildingInstanceId: string, recipe: ProductionRecipe): boolean {
		for (const input of recipe.inputs) {
			const available = this.storageManager.getCurrentQuantity(buildingInstanceId, input.itemType)
			if (available < input.quantity) {
				return false
			}
		}
		return true
	}

	// Consume inputs from storage
	private consumeInputs(buildingInstanceId: string, recipe: ProductionRecipe): boolean {
		for (const input of recipe.inputs) {
			if (!this.storageManager.removeFromStorage(buildingInstanceId, input.itemType, input.quantity)) {
				this.logger.warn(`[ProductionManager] Failed to consume ${input.quantity} ${input.itemType} for building ${buildingInstanceId}`)
				return false
			}
		}
		return true
	}

	// Produce outputs to storage
	private produceOutputs(buildingInstanceId: string, recipe: ProductionRecipe): void {
		for (const output of recipe.outputs) {
			// Check if storage has capacity
			if (!this.storageManager.hasAvailableStorage(buildingInstanceId, output.itemType, output.quantity)) {
				this.logger.warn(`[ProductionManager] Cannot produce ${output.quantity} ${output.itemType}: Storage full for building ${buildingInstanceId}`)
				// Still try to add what we can
			}

			this.storageManager.addToStorage(buildingInstanceId, output.itemType, output.quantity)
		}
	}

	// Get production status (no_input, in_production, idle, no_worker)
	public getProductionStatus(buildingInstanceId: string): ProductionStatus {
		const production = this.buildingProductions.get(buildingInstanceId)
		if (!production) {
			return ProductionStatus.Idle
		}

		return production.status
	}

	private productionTick(): void {
		// Process all buildings in production
		for (const [buildingInstanceId, production] of this.buildingProductions.entries()) {
			if (production.isProducing) {
				this.processProduction(buildingInstanceId)
			}
		}
	}

	// Request input resources (delegate to JobsManager for transport)
	// Priority: 1) Buildings with available outputs, 2) Ground items from LootManager
	private requestInputResources(buildingInstanceId: string, recipe: ProductionRecipe): void {
		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return
		}
		const buildingDef = this.buildingManager.getBuildingDefinition(building.buildingId)
		const buildingPriority = buildingDef?.priority ?? 1
		const priority = 60 + buildingPriority

		this.logger.log(`[ProductionManager] Requesting input resources for building ${buildingInstanceId}`)

		// Check each required input
		for (const input of recipe.inputs) {
			const current = this.storageManager.getCurrentQuantity(buildingInstanceId, input.itemType)
			const needed = input.quantity - current

			if (needed <= 0) {
				continue // Already have enough
			}

			// Priority 1: Find source buildings with available outputs
			const sourceBuildingId = this.findClosestSourceBuilding(input.itemType, 1, building.mapName, building.playerId, building.position, buildingInstanceId)
			
			if (sourceBuildingId) {
				const available = this.storageManager.getAvailableQuantity(sourceBuildingId, input.itemType)
				const transportQuantity = Math.min(needed, available)
				if (transportQuantity > 0) {
					this.logger.log(`[ProductionManager] Found source building ${sourceBuildingId} for ${input.itemType}, transporting ${transportQuantity}`)
					this.jobsManager.requestTransport(sourceBuildingId, buildingInstanceId, input.itemType, transportQuantity, priority)
				}
				continue
			}

			// Priority 2: Find ground items from LootManager
			const groundItems = this.findGroundItems(input.itemType, needed, building.mapName, building.playerId)
			
			if (groundItems.length > 0) {
				this.logger.log(`[ProductionManager] Found ${groundItems.length} ground items for ${input.itemType}`)
				
				// Request resource collection for each item (or batch them)
				// For now, request collection for the first item
				// TODO: Handle multiple items if needed
				for (let i = 0; i < Math.min(needed, groundItems.length); i++) {
					const item = groundItems[i]
					// Use existing requestResourceCollection for ground items
					// Note: This will need to be updated to handle production buildings, not just construction
					// For now, we'll use the same method
					this.jobsManager.requestResourceCollection(buildingInstanceId, input.itemType, priority)
				}
				continue
			}

			this.logger.log(`[ProductionManager] No sources found for ${input.itemType} (needed: ${needed})`)
		}
	}

	// Request output transport (delegate to JobsManager for building-to-building transport)
	// Moves outputs to warehouse only when storage is close to full
	private requestOutputTransport(buildingInstanceId: string, recipe: ProductionRecipe): void {
		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return
		}
		const buildingDef = this.buildingManager.getBuildingDefinition(building.buildingId)
		const buildingPriority = buildingDef?.priority ?? 1
		const priority = 20 + buildingPriority

		this.logger.log(`[ProductionManager] Checking output overflow for building ${buildingInstanceId}`)

		const OVERFLOW_THRESHOLD = 0.8

		// Check each output item
		for (const output of recipe.outputs) {
			if (this.requestOutputTransportToConsumers(buildingInstanceId, output.itemType, output.quantity, priority)) {
				continue
			}

			const capacity = this.storageManager.getStorageCapacity(buildingInstanceId, output.itemType)
			if (capacity === 0) {
				continue
			}

			const current = this.storageManager.getCurrentQuantity(buildingInstanceId, output.itemType)
			if (current === 0) {
				continue // No outputs available (or all reserved)
			}

			const fillRatio = current / capacity
			if (fillRatio < OVERFLOW_THRESHOLD) {
				continue
			}

			const warehouseId = this.findClosestWarehouse(output.itemType, output.quantity, building.mapName, building.playerId, building.position)
			if (!warehouseId) {
				continue
			}

			const transportQuantity = Math.min(output.quantity, current)
			this.logger.log(`[ProductionManager] Output overflow for ${output.itemType} at ${buildingInstanceId} (${Math.round(fillRatio * 100)}%), moving ${transportQuantity} to warehouse ${warehouseId}`)
			this.jobsManager.requestTransport(buildingInstanceId, warehouseId, output.itemType, transportQuantity, priority)
		}
	}

	private requestOutputTransportToConsumers(
		buildingInstanceId: string,
		itemType: string,
		quantity: number,
		overridePriority?: number
	): boolean {
		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return false
		}

		if (this.jobsManager.hasActiveJobForBuilding(buildingInstanceId, itemType)) {
			return false
		}

		const available = this.storageManager.getAvailableQuantity(buildingInstanceId, itemType)
		if (available === 0) {
			return false
		}

		const transportQuantity = Math.min(quantity, available)
		const targetBuildingId = this.findClosestTargetBuilding(
			buildingInstanceId,
			itemType,
			transportQuantity,
			building.mapName,
			building.playerId,
			building.position
		)

		if (!targetBuildingId) {
			return false
		}

		const buildingDef = this.buildingManager.getBuildingDefinition(building.buildingId)
		const buildingPriority = buildingDef?.priority ?? 1
		const priority = overridePriority ?? (20 + buildingPriority)

		this.logger.log(`[ProductionManager] Routing ${transportQuantity} ${itemType} from ${buildingInstanceId} to ${targetBuildingId}`)
		this.jobsManager.requestTransport(buildingInstanceId, targetBuildingId, itemType, transportQuantity, priority)
		return true
	}

	// Find source buildings with available output items (for input requests, priority 1)
	// Returns buildings with available output items
	private findSourceBuildings(itemType: string, quantity: number, mapName: string, playerId: string): string[] {
		return this.storageManager.getBuildingsWithAvailableItems(itemType, quantity, mapName, playerId)
	}

	private findClosestSourceBuilding(
		itemType: string,
		quantity: number,
		mapName: string,
		playerId: string,
		position: Position,
		excludeBuildingId?: string
	): string | null {
		const sources = this.findSourceBuildings(itemType, quantity, mapName, playerId)
			.filter(buildingId => buildingId !== excludeBuildingId)
		if (sources.length === 0) {
			return null
		}

		let closest = sources[0]
		let closestDistance = calculateDistance(position, this.buildingManager.getBuildingInstance(closest)!.position)

		for (let i = 1; i < sources.length; i++) {
			const building = this.buildingManager.getBuildingInstance(sources[i])
			if (!building) {
				continue
			}
			const distance = calculateDistance(position, building.position)
			if (distance < closestDistance) {
				closest = sources[i]
				closestDistance = distance
			}
		}

		return closest
	}

	// Find ground items from LootManager (for input requests, priority 2, fallback)
	// Returns ground items of the required type
	private findGroundItems(itemType: string, quantity: number, mapName: string, playerId: string): Array<{ itemId: string, position: Position }> {
		const mapItems = this.lootManager.getMapItems(mapName)
		const itemsOfType = mapItems.filter(item => item.itemType === itemType)
		
		// Return items with their IDs and positions
		return itemsOfType.map(item => ({
			itemId: item.id,
			position: item.position
		}))
	}

	// Find target buildings that need input items (for output requests)
	// Returns buildings that need the input items
	private findTargetBuildings(itemType: string, quantity: number, mapName: string, playerId: string): string[] {
		const buildings: string[] = []

		// Get all buildings on the map for this player
		const allBuildings = this.buildingManager.getBuildingsForMap(mapName)
			.filter(building => building.playerId === playerId)

		for (const building of allBuildings) {
			const definition = this.buildingManager.getBuildingDefinition(building.buildingId)
			if (!definition || !definition.productionRecipe) {
				continue // Building has no production recipe
			}

			// Check if production recipe requires this item type as input
			const requiredInput = definition.productionRecipe.inputs.find(input => input.itemType === itemType)
			if (!requiredInput) {
				continue // Building doesn't need this item type
			}

			const current = this.storageManager.getCurrentQuantity(building.id, itemType)
			const needed = requiredInput.quantity - current
			if (needed <= 0) {
				continue
			}

			const requestQuantity = Math.min(quantity, needed)
			if (!this.storageManager.hasAvailableStorage(building.id, itemType, requestQuantity)) {
				continue
			}

			buildings.push(building.id)
		}

		return buildings
	}

	private findClosestTargetBuilding(
		sourceBuildingInstanceId: string,
		itemType: string,
		quantity: number,
		mapName: string,
		playerId: string,
		position: Position
	): string | null {
		const targets = this.findTargetBuildings(itemType, quantity, mapName, playerId)
			.filter(buildingId => buildingId !== sourceBuildingInstanceId)

		if (targets.length === 0) {
			return null
		}

		let closest = targets[0]
		let closestDistance = calculateDistance(position, this.buildingManager.getBuildingInstance(closest)!.position)

		for (let i = 1; i < targets.length; i++) {
			const building = this.buildingManager.getBuildingInstance(targets[i])
			if (!building) {
				continue
			}
			const distance = calculateDistance(position, building.position)
			if (distance < closestDistance) {
				closest = targets[i]
				closestDistance = distance
			}
		}

		return closest
	}

	private findClosestWarehouse(
		itemType: string,
		quantity: number,
		mapName: string,
		playerId: string,
		position: Position
	): string | null {
		const warehouses = this.buildingManager.getBuildingsForMap(mapName)
			.filter(building => building.playerId === playerId)
			.filter(building => {
				const definition = this.buildingManager.getBuildingDefinition(building.buildingId)
				return !!definition?.isWarehouse
			})
			.filter(building => this.storageManager.hasAvailableStorage(building.id, itemType, quantity))

		if (warehouses.length === 0) {
			return null
		}

		let closest = warehouses[0]
		let closestDistance = calculateDistance(position, closest.position)

		for (let i = 1; i < warehouses.length; i++) {
			const distance = calculateDistance(position, warehouses[i].position)
			if (distance < closestDistance) {
				closest = warehouses[i]
				closestDistance = distance
			}
		}

		return closest.id
	}

	// Emit status changed event
	private emitStatusChanged(buildingInstanceId: string, status: ProductionStatus): void {
		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return
		}

		this.event.emit(Receiver.Group, ProductionEvents.SC.StatusChanged, {
			buildingInstanceId,
			status
		}, building.mapName)
	}
}
