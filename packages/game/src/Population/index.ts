import { EventManager, Event, EventClient } from '../events'
import { PopulationEvents } from './events'
import { MovementEvents } from '../Movement/events'
import {
	SettlerId,
	Settler,
	ProfessionType,
	SettlerState,
	ProfessionDefinition,
	ProfessionToolDefinition,
	JobAssignment,
	JobType,
	SpawnSettlerData,
	RequestWorkerData,
	UnassignWorkerData
} from './types'
import { Receiver } from '../Receiver'
import { v4 as uuidv4 } from 'uuid'
import { BuildingManager } from '../Buildings'
import { Scheduler } from '../Scheduler'
import { MapManager } from '../Map'
import { LootManager } from '../Loot'
import { ItemsManager } from '../Items'
import { Position } from '../types'
import { BuildingInstance, ConstructionStage } from '../Buildings/types'
import { MovementManager, MovementEntity } from '../Movement'
import { SettlerStateMachine } from './StateMachine'
import { PopulationStats } from './Stats'
import { calculateDistance } from '../utils'
import { PlayerJoinData } from '../Players/types'
import { JobsManager } from '../Jobs'
import { Logger } from '../Logs'

const SETTLER_SPEED = 164 // pixels per second (2 tiles per second at 32px per tile)

export class PopulationManager {
	private settlers = new Map<string, Settler>() // settlerId -> Settler
	// Note: jobs map removed - JobsManager tracks jobs now
	private houseSettlers = new Map<string, string[]>() // houseBuildingInstanceId -> settlerIds[]
	private spawnTimers = new Map<string, NodeJS.Timeout>() // houseId -> timer
	private jobTickInterval: NodeJS.Timeout | null = null
	private idleTickInterval: NodeJS.Timeout | null = null
	private professionTools = new Map<string, ProfessionType>() // itemType -> ProfessionType
	private professions = new Map<ProfessionType, ProfessionDefinition>() // professionType -> ProfessionDefinition
	private stateMachine: SettlerStateMachine
	private stats: PopulationStats
	private startingPopulation: Array<{ profession: ProfessionType, count: number }> = []
	// Note: Job type is determined by building state (Phase B only supports construction jobs)

	private jobsManager?: JobsManager // Optional - set after construction to avoid circular dependency

	constructor(
		private event: EventManager,
		private buildingManager: BuildingManager,
		private scheduler: Scheduler,
		private mapManager: MapManager,
		private lootManager: LootManager,
		private itemsManager: ItemsManager,
		private movementManager: MovementManager,
		startingPopulation: Array<{ profession: ProfessionType, count: number }>,
		private logger: Logger
	) {
		this.startingPopulation = startingPopulation || []
		
		// Initialize state machine with managers
		this.stateMachine = new SettlerStateMachine(
			movementManager,
			buildingManager,
			event,
			lootManager,
			itemsManager,
			mapManager,
			this.logger
		)
		
		// Initialize stats calculator with event manager and settlers getter
		this.stats = new PopulationStats(
			event,
			(mapName: string, playerId: string) => {
				return Array.from(this.settlers.values()).filter(
					s => s.mapName === mapName && s.playerId === playerId
				)
			}
		)
		
		this.setupEventHandlers()
		// Setup stats-related event handlers
		this.stats.setupEventHandlers()
		this.startJobTickLoop()
		this.startIdleTickLoop()
		this.loadProfessionToolsFromItems()
	}

	// Set JobsManager after construction to avoid circular dependency
	public setJobsManager(jobsManager: JobsManager): void {
		this.jobsManager = jobsManager
		// Update state machine managers to include jobsManager
		this.stateMachine.setJobsManager(jobsManager)
	}

	// Set StorageManager after construction to avoid circular dependency
	public setStorageManager(storageManager: any): void {
		// Update state machine managers to include storageManager
		this.stateMachine.setStorageManager(storageManager)
	}

	// Movement is now handled by MovementManager
	// Settlers are registered with MovementManager on spawn
	// MovementManager emits MovementEvents.SS.PathComplete when movement completes (with optional target info)
	// MovementManager emits MovementEvents.SS.StepComplete to sync positions

	// Load profession tools from item metadata (deprecated - now handled by ContentLoader)
	private loadProfessionToolsFromItems(): void {
		// This method is no longer needed - profession tools are loaded via ContentLoader
		// Items with changesProfession are automatically registered as profession tools
	}

	// Public method to load profession tools (called from ContentLoader)
	public loadProfessionTools(tools: ProfessionToolDefinition[]): void {
		this.professionTools.clear()
		tools.forEach(tool => {
			this.professionTools.set(tool.itemType, tool.targetProfession)
		})
		this.logger.log(`Loaded ${tools.length} profession tools`)
	}

	// Public method to load professions (called from ContentLoader)
	public loadProfessions(professions: ProfessionDefinition[]): void {
		this.professions.clear()
		professions.forEach(prof => {
			this.professions.set(prof.type, prof)
		})
		this.logger.log(`Loaded ${professions.length} professions`)
	}

	private setupEventHandlers(): void {
		// Handle building completion - listen to internal SS event for house completion
		// This is more reliable than SC events which only go to clients
		this.event.on(Event.Buildings.SS.HouseCompleted, (data: { buildingInstanceId: string, buildingId: string }, client) => {
			this.logger.debug(`House completed SS event received:`, {
				buildingId: data.buildingId,
				buildingInstanceId: data.buildingInstanceId
			})
			
			// Verify building definition has spawnsSettlers
			const buildingDef = this.buildingManager.getBuildingDefinition(data.buildingId)
			if (buildingDef && buildingDef.spawnsSettlers) {
				this.logger.log(`✓ House detected! Starting spawn timer for house ${data.buildingInstanceId}`)
				// This is a house - start spawn timer
				this.onHouseCompleted(data.buildingInstanceId, data.buildingId)
			} else {
				this.logger.warn(`House completed event received but building ${data.buildingId} is not configured to spawn settlers`)
			}
		})

		// Handle construction completion - complete construction jobs and reassign builders
		this.event.on(Event.Buildings.SS.ConstructionCompleted, (data: { buildingInstanceId: string, buildingId: string, mapName: string, playerId: string }, client) => {
			this.logger.log(`[CONSTRUCTION COMPLETED] Building ${data.buildingInstanceId} (${data.buildingId}) completed construction`)
			this.onConstructionCompleted(data.buildingInstanceId, data.mapName, data.playerId)
		})

		// Handle CS events
		this.event.on<RequestWorkerData>(PopulationEvents.CS.RequestWorker, (data, client) => {
			this.requestWorker(data, client)
		})

		this.event.on<UnassignWorkerData>(PopulationEvents.CS.UnassignWorker, (data, client) => {
			this.unassignWorker(data, client)
		})

		// Handle SS events (internal)
		this.event.on(PopulationEvents.SS.SpawnTick, (data: { houseId: string }, client) => {
			// Handle spawn tick for house
			// This will be triggered by scheduler
		})

		// Listen for movement step completion to sync settler positions
		this.event.on(MovementEvents.SS.StepComplete, (data: { entityId: string, position: Position }) => {
			const settler = this.settlers.get(data.entityId)
			if (settler) {
				// Sync settler position with MovementManager
				const oldPosition = { ...settler.position }
				settler.position = data.position
				this.logger.debug(`[POSITION SYNC] StepComplete: settler=${data.entityId} | oldPosition=(${Math.round(oldPosition.x)},${Math.round(oldPosition.y)}) | newPosition=(${Math.round(data.position.x)},${Math.round(data.position.y)})`)
			}
		})

		// Listen to WorkerAssigned event
		// State machine emits this event - JobsManager handles job tracking
		this.event.on(PopulationEvents.SC.WorkerAssigned, (data: { jobAssignment: JobAssignment }) => {
			// Job assignment is tracked by JobsManager and settler.stateContext.jobId
			// No local tracking needed
		})

		// Listen for movement path completion - state machine handles all transitions automatically
		this.event.on(MovementEvents.SS.PathComplete, (data: { entityId: string, targetType?: string, targetId?: string }) => {
			const timestamp = Date.now()
			this.logger.log(`[PATH COMPLETE RECEIVED] entityId=${data.entityId} | targetType=${data.targetType || 'none'} | targetId=${data.targetId || 'none'} | time=${timestamp}`)
			const settler = this.settlers.get(data.entityId)
			if (!settler) {
				this.logger.warn(`[PATH COMPLETE ERROR] Settler not found for entityId=${data.entityId}`)
				return
			}

			// Sync position from MovementManager before state transition (StepComplete should have fired, but ensure sync)
			const currentPosition = this.movementManager.getEntityPosition(settler.id)
			if (currentPosition) {
				settler.position = currentPosition
				this.logger.log(`[POSITION SYNC] PathComplete: synced final position: settler=${settler.id} | position=(${Math.round(currentPosition.x)},${Math.round(currentPosition.y)})`)
			}

			this.logger.log(`[STATE BEFORE TRANSITION] entityId=${settler.id} | state=${settler.state} | position=(${Math.round(settler.position.x)},${Math.round(settler.position.y)}) | jobId=${settler.stateContext.jobId || 'none'} | targetId=${settler.stateContext.targetId || 'none'} | time=${timestamp}`)

			// State machine handles all transitions automatically via completed callbacks
			const transitionResult = this.stateMachine.completeTransition(settler)
			
			// If no transition was executed (transitionResult === false), we still need to emit events
			// to notify the frontend that movement has completed and the settler is at the final position
			// This is important for idle wandering where the completed callback returns null (no next state)
			if (!transitionResult) {
				// Sync position one more time to ensure we have the latest position from MovementManager
				const finalPosition = this.movementManager.getEntityPosition(settler.id)
				if (finalPosition) {
					settler.position = { ...finalPosition } // Create a copy to ensure we're using the exact position
				}
				
				// For idle wandering, emit PositionUpdated to stop interpolation and sync position
				// This ensures the frontend knows movement has stopped before a new movement might start
				// We use a small delay to ensure events are processed in order and the frontend has time to sync
				if (settler.state === SettlerState.Idle && !settler.stateContext.jobId) {
					// Emit PositionUpdated immediately to stop interpolation
					this.event.emit(Receiver.Group, MovementEvents.SC.PositionUpdated, {
						entityId: settler.id,
						position: { ...settler.position }, // Use exact position from MovementManager
						mapName: settler.mapName
					}, settler.mapName)
					
					this.logger.log(`[MOVEMENT COMPLETED] Emitted PositionUpdated for idle wander completion: settler=${settler.id} | position=(${Math.round(settler.position.x)},${Math.round(settler.position.y)})`)
					
					// Don't emit SettlerUpdated immediately - the PositionUpdated event already syncs the position
					// Emit it with a small delay to ensure PositionUpdated is processed first
					// This prevents position conflicts between the two events
					setTimeout(() => {
						// Re-sync position to ensure it's still correct
						const currentPosition = this.movementManager.getEntityPosition(settler.id)
						if (currentPosition) {
							settler.position = { ...currentPosition }
						}
						
						// Emit SettlerUpdated to update state context (without position, since it's already synced)
						this.event.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
							settler
						}, settler.mapName)
						
						this.logger.log(`[MOVEMENT COMPLETED] Emitted SettlerUpdated (delayed) for movement completion: settler=${settler.id} | position=(${Math.round(settler.position.x)},${Math.round(settler.position.y)})`)
					}, 50) // Small delay to ensure PositionUpdated is processed first
				} else {
					// For non-idle wandering (shouldn't happen, but handle it), emit SettlerUpdated immediately
					this.event.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, {
						settler
					}, settler.mapName)
					
					this.logger.log(`[MOVEMENT COMPLETED] Emitted SettlerUpdated for movement completion (no transition): settler=${settler.id} | position=(${Math.round(settler.position.x)},${Math.round(settler.position.y)})`)
				}
			}
			
			this.logger.log(`[STATE AFTER TRANSITION] entityId=${settler.id} | state=${settler.state} | position=(${Math.round(settler.position.x)},${Math.round(settler.position.y)}) | transitionResult=${transitionResult} | jobId=${settler.stateContext.jobId || 'none'} | targetId=${settler.stateContext.targetId || 'none'} | time=${Date.now()}`)
		})
		

		// Handle player join to spawn starting population
		this.event.on<PlayerJoinData>(Event.Players.CS.Join, (data, client) => {
			if (data.mapId && this.startingPopulation.length > 0) {
				this.spawnStartingPopulation(data.position, data.mapId, client)
			}
		})
	}

	// Spawn settler from house
	private spawnSettler(data: SpawnSettlerData, client: EventClient): void {
		this.logger.debug(`spawnSettler called:`, { houseBuildingInstanceId: data.houseBuildingInstanceId, clientId: client.id })
		
		// 1. Verify house building exists and is completed
		const building = this.buildingManager.getBuildingInstance(data.houseBuildingInstanceId)
		if (!building) {
			this.logger.error(`House building not found: ${data.houseBuildingInstanceId}`)
			return
		}

		this.logger.debug(`House building found:`, {
			id: building.id,
			buildingId: building.buildingId,
			stage: building.stage,
			position: building.position
		})

		if (building.stage !== ConstructionStage.Completed) {
			this.logger.error(`House building not completed: ${data.houseBuildingInstanceId}, stage: ${building.stage}`)
			return
		}

		const buildingDef = this.buildingManager.getBuildingDefinition(building.buildingId)
		if (!buildingDef) {
			this.logger.error(`Building definition not found: ${building.buildingId}`)
			return
		}
		
		if (!buildingDef.spawnsSettlers) {
			this.logger.error(`Building is not a house (spawnsSettlers: ${buildingDef.spawnsSettlers}): ${data.houseBuildingInstanceId}`)
			return
		}

		// 2. Check house capacity (max settlers)
		const settlersFromHouse = this.houseSettlers.get(data.houseBuildingInstanceId) || []
		this.logger.debug(`House capacity check:`, {
			currentSettlers: settlersFromHouse.length,
			maxOccupants: buildingDef.maxOccupants
		})
		
		if (buildingDef.maxOccupants && settlersFromHouse.length >= buildingDef.maxOccupants) {
			this.logger.warn(`House at capacity: ${data.houseBuildingInstanceId} (${settlersFromHouse.length}/${buildingDef.maxOccupants})`)
			return
		}

		// 3. Create settler with default Carrier profession
		// Spawn settler near house (offset by half tile size, which is typically 32px)
		// Building position is typically at top-left corner, so spawn to the right
		const TILE_SIZE = 32
		const settler: Settler = {
			id: uuidv4(),
			playerId: client.id,
			mapName: building.mapName,
			position: {
				x: building.position.x + (buildingDef.footprint.width * TILE_SIZE) + TILE_SIZE, // Spawn to the right of house
				y: building.position.y + (buildingDef.footprint.height * TILE_SIZE / 2) // Center vertically
			},
			profession: ProfessionType.Carrier,
			state: SettlerState.Idle,
			stateContext: {},
			houseId: data.houseBuildingInstanceId,
			speed: SETTLER_SPEED,
			createdAt: Date.now()
		}

		this.logger.debug(`Created settler:`, {
			id: settler.id,
			position: settler.position,
			profession: settler.profession,
			houseId: settler.houseId
		})

		// 4. Add to settlers map
		this.settlers.set(settler.id, settler)

		// 5. Register settler with MovementManager
		const movementEntity: MovementEntity = {
			id: settler.id,
			position: settler.position,
			mapName: settler.mapName,
			speed: settler.speed
		}
		this.movementManager.registerEntity(movementEntity)

		// 6. Track settler in house
		if (!this.houseSettlers.has(data.houseBuildingInstanceId)) {
			this.houseSettlers.set(data.houseBuildingInstanceId, [])
		}
		this.houseSettlers.get(data.houseBuildingInstanceId)!.push(settler.id)

		// 6. Emit sc:population:settler-spawned
		this.logger.debug(`Emitting settler spawned event to group: ${building.mapName}`)
		client.emit(Receiver.Group, PopulationEvents.SC.SettlerSpawned, {
			settler
		}, building.mapName)

		// 7. Emit sc:population:stats-updated with new stats
		this.stats.emitPopulationStatsUpdate(client, building.mapName)

		this.logger.log(`✓ Successfully spawned settler ${settler.id} from house ${data.houseBuildingInstanceId}`)
	}

	// Spawn starting population when player joins
	private spawnStartingPopulation(playerPosition: Position, mapName: string, client: EventClient): void {
		if (this.startingPopulation.length === 0) {
			return // No starting population configured
		}

		const TILE_SIZE = 32
		let settlerIndex = 0

		this.startingPopulation.forEach((popEntry) => {
			// Validate profession exists
			if (!this.professions.has(popEntry.profession)) {
				this.logger.warn(`Starting population profession ${popEntry.profession} does not exist, skipping`)
				return
			}

			// Spawn the specified number of settlers with this profession
			for (let i = 0; i < popEntry.count; i++) {
				// Calculate offset in a grid pattern (3 columns)
				const col = settlerIndex % 3
				const row = Math.floor(settlerIndex / 3)
				const offsetX = (col - 1) * TILE_SIZE * 2 // Spread horizontally
				const offsetY = row * TILE_SIZE * 2 // Stack vertically

				const settler: Settler = {
					id: uuidv4(),
					playerId: client.id,
					mapName: mapName,
					position: {
						x: playerPosition.x + offsetX,
						y: playerPosition.y + offsetY
					},
					profession: popEntry.profession,
					state: SettlerState.Idle,
					stateContext: {},
					speed: SETTLER_SPEED,
					createdAt: Date.now()
				}

				this.logger.debug(`Spawning starting settler:`, {
					id: settler.id,
					profession: settler.profession,
					position: settler.position
				})

				// Add to settlers map
				this.settlers.set(settler.id, settler)

				// Register settler with MovementManager
				const movementEntity: MovementEntity = {
					id: settler.id,
					position: settler.position,
					mapName: settler.mapName,
					speed: settler.speed
				}
				this.movementManager.registerEntity(movementEntity)

				// Emit settler spawned event
				client.emit(Receiver.Group, PopulationEvents.SC.SettlerSpawned, {
					settler
				}, mapName)

				settlerIndex++
			}
		})

		// Emit stats update after spawning all starting population
		if (settlerIndex > 0) {
			this.stats.emitPopulationStatsUpdate(client, mapName)
			this.logger.log(`✓ Spawned ${settlerIndex} starting settlers for player ${client.id}`)
		}
	}

	// Request worker for building (automatic assignment)
	private requestWorker(data: RequestWorkerData, client: EventClient): void {
		// 1. Verify building exists and needs workers
		const building = this.buildingManager.getBuildingInstance(data.buildingInstanceId)
		if (!building) {
			this.logger.error(`Building not found: ${data.buildingInstanceId}`)
			client.emit(Receiver.Sender, PopulationEvents.SC.WorkerRequestFailed, {
				reason: 'building_not_found',
				buildingInstanceId: data.buildingInstanceId
			})
			return
		}

		// 2. Get building definition to check required profession
		const buildingDef = this.buildingManager.getBuildingDefinition(building.buildingId)
		if (!buildingDef) {
			this.logger.error(`Building definition not found: ${building.buildingId}`)
			client.emit(Receiver.Sender, PopulationEvents.SC.WorkerRequestFailed, {
				reason: 'building_definition_not_found',
				buildingInstanceId: data.buildingInstanceId
			})
			return
		}

		// 3. Check if building needs workers
		if (!this.buildingManager.getBuildingNeedsWorkers(data.buildingInstanceId)) {
			this.logger.warn(`Building does not need workers: ${data.buildingInstanceId}`)
			client.emit(Receiver.Sender, PopulationEvents.SC.WorkerRequestFailed, {
				reason: 'building_does_not_need_workers',
				buildingInstanceId: data.buildingInstanceId
			})
			return
		}

		// 4. Get building position
		const buildingPosition = building.position

		// 5. Delegate to JobsManager to create job and assign worker
		if (this.jobsManager) {
			this.jobsManager.requestWorker(data.buildingInstanceId)
		} else {
			this.logger.warn(`JobsManager not set, cannot assign worker`)
			client.emit(Receiver.Sender, PopulationEvents.SC.WorkerRequestFailed, {
				reason: 'jobs_manager_not_available',
				buildingInstanceId: data.buildingInstanceId
			})
		}
	}

	// Query methods for JobsManager
	public getAvailableCarriers(mapName: string, playerId: string): Settler[] {
		return Array.from(this.settlers.values()).filter(settler =>
			settler.mapName === mapName &&
			settler.playerId === playerId &&
			settler.profession === ProfessionType.Carrier &&
			settler.state === SettlerState.Idle
		)
	}

	// Find worker for building (handles profession requirements and tool pickup)
	// Returns Settler or null (updated signature for JobsManager)
	public findWorkerForBuilding(
		buildingInstanceId: string,
		requiredProfession?: ProfessionType,
		mapName?: string,
		buildingPosition?: Position,
		playerId?: string
	): Settler | null {
		// Get building to get mapName and playerId if not provided
		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return null
		}

		const targetMapName = mapName || building.mapName
		const targetPlayerId = playerId || building.playerId
		const targetPosition = buildingPosition || building.position

		// Use existing findWorkerForBuilding logic but return Settler directly
		const workerResult = this.findWorkerForBuildingInternal(
			buildingInstanceId,
			requiredProfession,
			targetMapName,
			targetPosition,
			targetPlayerId
		)

		if (!workerResult) {
			return null
		}

		return this.settlers.get(workerResult.settlerId) || null
	}

	// Internal method that returns worker result with tool info
	private findWorkerForBuildingInternal(
		buildingInstanceId: string,
		requiredProfession: ProfessionType | undefined,
		mapName: string,
		buildingPosition: Position,
		playerId: string
	): { settlerId: SettlerId, needsTool: boolean, toolId?: string, toolPosition?: Position } | null {
		// 1. Get all idle settlers for this map and player
		const idleSettlers = Array.from(this.settlers.values()).filter(
			s => s.mapName === mapName &&
				s.playerId === playerId &&
				s.state === SettlerState.Idle
		)

		if (idleSettlers.length === 0) {
			return null
		}

		// 2. If requiredProfession is set:
		if (requiredProfession) {
			// a. Filter settlers with matching profession
			const settlersWithProfession = idleSettlers.filter(s => s.profession === requiredProfession)

			if (settlersWithProfession.length > 0) {
				// b. Find closest settler to building
				const closestSettler = this.findClosestSettler(settlersWithProfession, buildingPosition)
				return {
					settlerId: closestSettler.id,
					needsTool: false
				}
			}

			// c. If not found, find profession-changing tool for this profession
			const toolItemType = this.findToolForProfession(requiredProfession)
			if (toolItemType) {
				// Find tool on map
				const tool = this.findToolOnMap(mapName, toolItemType)
				if (tool) {
					// Find closest settler to tool (any profession, will change)
					const closestSettler = this.findClosestSettler(idleSettlers, tool.position)
					return {
						settlerId: closestSettler.id,
						needsTool: true,
						toolId: tool.id,
						toolPosition: tool.position
					}
				}
			}

			// No settler with profession and no tool available
			return null
		}

		// 3. If no requiredProfession:
		//    a. Find closest idle settler to building (any profession)
		const closestSettler = this.findClosestSettler(idleSettlers, buildingPosition)
		return {
			settlerId: closestSettler.id,
			needsTool: false
		}
	}

	// Find closest settler to a position
	private findClosestSettler(settlers: Settler[], position: Position): Settler {
		let closest = settlers[0]
		let closestDistance = calculateDistance(closest.position, position)

		for (let i = 1; i < settlers.length; i++) {
			const distance = calculateDistance(settlers[i].position, position)
			if (distance < closestDistance) {
				closest = settlers[i]
				closestDistance = distance
			}
		}

		return closest
	}

	// Find tool item type for a profession
	private findToolForProfession(profession: ProfessionType): string | null {
		for (const [itemType, targetProfession] of this.professionTools.entries()) {
			if (targetProfession === profession) {
				return itemType
			}
		}
		return null
	}

	// Find tool on map
	private findToolOnMap(mapName: string, itemType: string): { id: string, position: Position } | null {
		// Get all dropped items on the map
		const droppedItems = this.lootManager.getMapItems(mapName)
		
		// Find tool with matching itemType
		for (const item of droppedItems) {
			if (item.itemType === itemType) {
				return {
					id: item.id,
					position: item.position
				}
			}
		}

		return null
	}

	// Assign worker to transport job (called by JobsManager)
	public assignWorkerToTransportJob(
		settlerId: string,
		jobId: string,
		jobAssignment: JobAssignment
	): void {
		const settler = this.settlers.get(settlerId)
		if (!settler) {
			return
		}

		// Assign job to settler
		settler.currentJob = jobAssignment
		settler.stateContext.jobId = jobId

		// Execute state transition: Idle -> MovingToItem
		// Only jobId needed - transition will look up job details
		this.stateMachine.executeTransition(settler, SettlerState.MovingToItem, {
			jobId: jobAssignment.jobId
		})
	}

	// Assign worker to job (called by JobsManager for construction/production jobs)
	public assignWorkerToJob(
		settlerId: string,
		jobId: string,
		jobAssignment: JobAssignment
	): void {
		const settler = this.settlers.get(settlerId)
		if (!settler) {
			return
		}

		// Assign job to settler
		settler.currentJob = jobAssignment
		settler.stateContext.jobId = jobId

		// Get building to get position
		const building = this.buildingManager.getBuildingInstance(jobAssignment.buildingInstanceId)
		if (!building) {
			return
		}

		// Check if settler needs tool
		if (jobAssignment.requiredProfession && settler.profession !== jobAssignment.requiredProfession) {
			// Find tool for profession
			const toolItemType = this.findToolForProfession(jobAssignment.requiredProfession)
			if (toolItemType) {
				const tool = this.findToolOnMap(building.mapName, toolItemType)
				if (tool) {
					// Execute transition: Idle -> MovingToTool
					// jobId is already set in stateContext, but we still need to pass context for condition/validate checks
					this.stateMachine.executeTransition(settler, SettlerState.MovingToTool, {
						toolId: tool.id,
						toolPosition: tool.position,
						buildingInstanceId: jobAssignment.buildingInstanceId,
						requiredProfession: jobAssignment.requiredProfession!
					})
					return
				}
			}
		}

		// No tool needed or tool not found - go directly to building

		// Execute transition: Idle -> MovingToBuilding
		this.stateMachine.executeTransition(settler, SettlerState.MovingToBuilding, {
			buildingInstanceId: jobAssignment.buildingInstanceId,
			buildingPosition: building.position,
			requiredProfession: jobAssignment.requiredProfession
		})
	}


	// Unassign settler from job
	private unassignWorker(data: UnassignWorkerData, client: EventClient): void {
		const settler = this.settlers.get(data.settlerId)
		if (!settler) {
			this.logger.error(`Settler not found: ${data.settlerId}`)
			return
		}

		// Execute transition: Working -> Idle
		// State machine handles cancellation, unassignment, events
		const success = this.stateMachine.executeTransition(settler, SettlerState.Idle, {})
		
		if (success) {
			// Handle internal state management after transition
			// JobsManager handles job tracking
			if (settler.currentJob && this.jobsManager) {
				this.jobsManager.cancelJob(settler.currentJob.jobId, 'unassigned')
			}
		}

		// 7. Emit sc:population:stats-updated
		this.stats.emitPopulationStatsUpdate(client, settler.mapName)
	}

	// Handle construction completion - complete construction jobs and reassign builders
	private onConstructionCompleted(buildingInstanceId: string, mapName: string, playerId: string): void {
		if (!this.jobsManager) {
			this.logger.warn(`[CONSTRUCTION COMPLETED] JobsManager not available, cannot complete construction jobs`)
			return
		}

		// Get all active construction jobs for this building
		const activeJobs = this.jobsManager.getActiveJobsForBuilding(buildingInstanceId)
		const constructionJobs = activeJobs.filter(job => job.jobType === JobType.Construction)

		this.logger.log(`[CONSTRUCTION COMPLETED] Found ${constructionJobs.length} construction jobs for building ${buildingInstanceId}`)

		// Complete construction jobs and transition builders to Idle
		for (const job of constructionJobs) {
			const settler = this.settlers.get(job.settlerId)
			if (!settler) {
				this.logger.warn(`[CONSTRUCTION COMPLETED] Settler ${job.settlerId} not found for job ${job.jobId}`)
				continue
			}

			// Only transition builders that are currently working on this building
			if (settler.state === SettlerState.Working && settler.currentJob?.jobId === job.jobId) {
				this.logger.log(`[CONSTRUCTION COMPLETED] Completing construction job ${job.jobId} for settler ${settler.id}`)
				
				// Complete the job
				this.jobsManager.completeJob(job.jobId)
				
				// Transition builder to Idle
				const success = this.stateMachine.executeTransition(settler, SettlerState.Idle, {})
				if (success) {
					this.logger.log(`[CONSTRUCTION COMPLETED] Builder ${settler.id} transitioned to Idle`)
					
					// After transitioning to Idle, check for other buildings needing builders
					// Use setTimeout to ensure state transition completes first
					setTimeout(() => {
						this.assignBuilderToNextConstructionJob(settler, mapName, playerId)
					}, 0)
				}
			}
		}
	}

	// Automatically assign idle builder to next construction job
	private assignBuilderToNextConstructionJob(settler: Settler, mapName: string, playerId: string): void {
		if (!this.jobsManager) {
			return
		}

		// Only assign if settler is still Idle and has no job
		if (settler.state !== SettlerState.Idle || settler.currentJob) {
			return
		}

		// Find buildings in Constructing stage that need builders
		const buildings = this.buildingManager.getBuildingsForMap(mapName)
		const buildingsNeedingBuilders = buildings.filter(building => {
			// Only check buildings for the same player
			if (building.playerId !== playerId) {
				return false
			}

			// Building must be in Constructing stage
			if (building.stage !== ConstructionStage.Constructing) {
				return false
			}

			// Building must need workers
			if (!this.buildingManager.getBuildingNeedsWorkers(building.id)) {
				return false
			}

			return true
		})

		if (buildingsNeedingBuilders.length === 0) {
			this.logger.debug(`[AUTO ASSIGN] No buildings needing builders for settler ${settler.id}`)
			return
		}

		// Sort by distance to find the closest building
		buildingsNeedingBuilders.sort((a, b) => {
			const distanceA = calculateDistance(settler.position, a.position)
			const distanceB = calculateDistance(settler.position, b.position)
			return distanceA - distanceB
		})

		// Assign builder to the closest building
		const targetBuilding = buildingsNeedingBuilders[0]
		this.logger.log(`[AUTO ASSIGN] Assigning builder ${settler.id} to building ${targetBuilding.id} (${targetBuilding.buildingId})`)
		
		// Request worker for the building (JobsManager will handle assignment)
		this.jobsManager.requestWorker(targetBuilding.id)
	}

	// Handle house completion - start spawn timer
	public onHouseCompleted(buildingInstanceId: string, buildingId: string): void {
		this.logger.debug(`onHouseCompleted called:`, { buildingInstanceId, buildingId })
		
		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (!building) {
			this.logger.error(`House building instance not found: ${buildingInstanceId}`)
			return
		}

		this.logger.debug(`House building found:`, {
			id: building.id,
			buildingId: building.buildingId,
			playerId: building.playerId,
			mapName: building.mapName,
			stage: building.stage
		})

		const buildingDef = this.buildingManager.getBuildingDefinition(buildingId)
		if (!buildingDef) {
			this.logger.error(`House building definition not found: ${buildingId}`)
			return
		}
		
		if (!buildingDef.spawnsSettlers) {
			this.logger.warn(`Building ${buildingId} does not spawn settlers`)
			return
		}

		// Check if timer already exists (house might complete multiple times)
		if (this.spawnTimers.has(buildingInstanceId)) {
			this.logger.warn(`Spawn timer already exists for house ${buildingInstanceId}, clearing old timer`)
			const oldTimer = this.spawnTimers.get(buildingInstanceId)
			if (oldTimer) {
				clearTimeout(oldTimer)
			}
		}

		// Start spawn timer based on spawnRate
		const spawnRate = buildingDef.spawnRate || 60 // Default 60 seconds
		this.logger.debug(`Starting spawn timer for house ${buildingInstanceId} with spawn rate: ${spawnRate}s`)
		
		// Spawn first settler immediately when house completes (for testing/debugging)
		const firstSpawnDelay = 1000 // 1 second delay for first spawn
		
		const timer = setTimeout(() => {
			this.logger.debug(`Spawn timer fired for house ${buildingInstanceId}`)
			
			// Create fake client for spawning
			const fakeClient: EventClient = {
				id: building.playerId,
				currentGroup: building.mapName,
				emit: (receiver, event, data, target?) => {
					this.event.emit(receiver, event, data, target)
				},
				setGroup: (group: string) => {
					// No-op for fake client
				}
			}
			
			// Spawn settler
			this.spawnSettler({ houseBuildingInstanceId: buildingInstanceId }, fakeClient)

			// Schedule next spawn
			this.scheduleNextSpawn(buildingInstanceId, spawnRate)
		}, firstSpawnDelay)

		this.spawnTimers.set(buildingInstanceId, timer)

		this.logger.log(`✓ Started spawn timer for house ${buildingInstanceId} (first spawn in ${firstSpawnDelay}ms, then every ${spawnRate}s)`)
	}

	// Schedule next spawn for house
	private scheduleNextSpawn(buildingInstanceId: string, spawnRate: number): void {
		const building = this.buildingManager.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return
		}

		const timer = setTimeout(() => {
			// Check if house still exists and is completed
			const currentBuilding = this.buildingManager.getBuildingInstance(buildingInstanceId)
			if (!currentBuilding || currentBuilding.stage !== ConstructionStage.Completed) {
				return
			}

			// Check house capacity
			const buildingDef = this.buildingManager.getBuildingDefinition(currentBuilding.buildingId)
			if (!buildingDef || !buildingDef.spawnsSettlers) {
				return
			}

			const settlersFromHouse = this.houseSettlers.get(buildingInstanceId) || []
			if (buildingDef.maxOccupants && settlersFromHouse.length >= buildingDef.maxOccupants) {
				// At capacity, don't spawn but keep timer running
				this.scheduleNextSpawn(buildingInstanceId, spawnRate)
				return
			}

			// Trigger spawn
			const fakeClient: EventClient = {
				id: building.playerId,
				currentGroup: building.mapName,
				emit: (receiver, event, data, target?) => {
					this.event.emit(receiver, event, data, target)
				},
				setGroup: (group: string) => {
					// No-op for fake client
				}
			}
			this.spawnSettler({ houseBuildingInstanceId: buildingInstanceId }, fakeClient)

			// Schedule next spawn
			this.scheduleNextSpawn(buildingInstanceId, spawnRate)
		}, spawnRate * 1000)

		this.spawnTimers.set(buildingInstanceId, timer)
	}

	// Handle house destruction - stop spawn timer and remove settlers
	public onHouseDestroyed(buildingInstanceId: string): void {
		// 1. Stop spawn timer
		const timer = this.spawnTimers.get(buildingInstanceId)
		if (timer) {
			clearTimeout(timer)
			this.spawnTimers.delete(buildingInstanceId)
		}

		// 2. Find settlers from this house
		const settlersFromHouse = this.houseSettlers.get(buildingInstanceId) || []

		// 3. Unassign from jobs if working
		settlersFromHouse.forEach(settlerId => {
			const settler = this.settlers.get(settlerId)
			if (settler && settler.currentJob) {
				// Cancel job (JobsManager handles job tracking)
				if (this.jobsManager) {
					this.jobsManager.cancelJob(settler.currentJob.jobId, 'house_destroyed')
				}
				
				if (settler.buildingId) {
					this.buildingManager.unassignWorker(settler.buildingId, settlerId)
				}

				settler.currentJob = undefined
				settler.buildingId = undefined
				settler.state = SettlerState.Idle
			}

			// Remove settler
			this.settlers.delete(settlerId)
		})

		// 4. Remove house entry
		this.houseSettlers.delete(buildingInstanceId)

		this.logger.log(`Removed house ${buildingInstanceId} and ${settlersFromHouse.length} settlers`)
	}

	// Start job tick loop
	private startJobTickLoop(): void {
		// Job processing will be handled by BuildingManager construction ticks
		// This can be used for future production jobs in Phase C
	}

	private startIdleTickLoop(): void {
		// Check idle settlers every 3-8 seconds (randomized to avoid all settlers moving at once)
		const IDLE_TICK_INTERVAL = 300 // Base interval: 3 seconds
		const IDLE_TICK_VARIANCE = 1000 // Random variance: 0-5 seconds
		
		const scheduleNextTick = () => {
			const delay = IDLE_TICK_INTERVAL + Math.random() * IDLE_TICK_VARIANCE
			this.idleTickInterval = setTimeout(() => {
				this.processIdleSettlers()
				scheduleNextTick()
			}, delay)
		}
		
		scheduleNextTick()
	}

	private processIdleSettlers(): void {
		const now = Date.now()
		const MIN_IDLE_WANDER_COOLDOWN = 1000 // Minimum 5 seconds between wanders
		const MAX_IDLE_WANDER_COOLDOWN = 5000 // Maximum 15 seconds between wanders
		
		// Get all idle settlers without jobs and not currently moving
		const idleSettlers = Array.from(this.settlers.values()).filter(settler => {
			// Must be in Idle state
			if (settler.state !== SettlerState.Idle) {
				return false
			}
			
			// Must have no job assignment
			if (settler.currentJob || settler.stateContext.jobId) {
				return false
			}
			
			// Must not have a target position (not currently wandering)
			if (settler.stateContext.targetPosition) {
				return false
			}
			
			// Check if MovementManager has an active movement task for this settler
			// This prevents starting a new wander while movement is still in progress
			if (this.movementManager.hasActiveMovement(settler.id)) {
				return false
			}
			
			return true
		})
		
		for (const settler of idleSettlers) {
			const lastWanderTime = settler.stateContext.lastIdleWanderTime || 0
			const timeSinceLastWander = now - lastWanderTime
			
			// Check if cooldown has passed (randomized to avoid synchronized movement)
			const cooldown = MIN_IDLE_WANDER_COOLDOWN + Math.random() * (MAX_IDLE_WANDER_COOLDOWN - MIN_IDLE_WANDER_COOLDOWN)
			if (timeSinceLastWander < cooldown) {
				continue
			}
			
			// Generate random nearby position (2-3 tiles away)
			const wanderPosition = this.generateRandomNearbyPosition(settler)
			if (!wanderPosition) {
				continue // No valid position found
			}
			
			// Try to trigger idle wander transition
			const context = { targetPosition: wanderPosition }
			const success = this.stateMachine.executeTransition(settler, SettlerState.Idle, context)
			
			if (success) {
				this.logger.debug(`[IDLE WANDER] Triggered idle wander for settler ${settler.id}`)
			}
		}
	}

	private generateRandomNearbyPosition(settler: Settler): Position | null {
		const TILE_SIZE = 32
		const MIN_DISTANCE_TILES = 1 // Minimum 2 tiles away
		const MAX_DISTANCE_TILES = 3 // Maximum 3 tiles away
		
		// Try up to 10 random positions
		for (let attempt = 0; attempt < 10; attempt++) {
			// Generate random angle and distance
			const angle = Math.random() * Math.PI * 2
			const distanceTiles = MIN_DISTANCE_TILES + Math.random() * (MAX_DISTANCE_TILES - MIN_DISTANCE_TILES)
			const distancePixels = distanceTiles * TILE_SIZE
			
			// Calculate target position
			const targetPosition: Position = {
				x: settler.position.x + Math.cos(angle) * distancePixels,
				y: settler.position.y + Math.sin(angle) * distancePixels
			}
			
			// Check if path exists and is short enough
			const path = this.mapManager.findPath(settler.mapName, settler.position, targetPosition)
			if (path && path.length > 0 && path.length <= 6) {
				// Use the last position in the path (actual reachable position)
				return path[path.length - 1]
			}
		}
		
		return null // No valid position found after 10 attempts
	}

	// Public getters
	public getSettler(settlerId: string): Settler | undefined {
		return this.settlers.get(settlerId)
	}

	public getSettlersForPlayer(playerId: string, mapName: string): Settler[] {
		return Array.from(this.settlers.values()).filter(
			s => s.playerId === playerId && s.mapName === mapName
		)
	}

	// Note: getJob removed - JobsManager handles job tracking
	// Use jobsManager.getJob() instead
}

