import { EventManager } from '../events'
import { BuildingManager } from '../Buildings'
import { PopulationManager } from '../Population'
import { JobsManager } from '../Jobs'
import { ResourceNodesManager } from '../ResourceNodes'
import { StorageManager } from '../Storage'
import { Logger } from '../Logs'
import { SimulationEvents } from '../Simulation/events'
import { SimulationTickData } from '../Simulation/types'
import { ConstructionStage } from '../Buildings/types'
import { SettlerState } from '../Population/types'
import { calculateDistance } from '../utils'

const HARVEST_TICK_INTERVAL_MS = 1000

export class HarvestManager {
	private tickAccumulatorMs = 0
	private simulationTimeMs = 0

	constructor(
		private event: EventManager,
		private buildingManager: BuildingManager,
		private populationManager: PopulationManager,
		private jobsManager: JobsManager,
		private resourceNodesManager: ResourceNodesManager,
		private storageManager: StorageManager,
		private logger: Logger
	) {
		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		this.event.on(SimulationEvents.SS.Tick, (data: SimulationTickData) => {
			this.handleSimulationTick(data)
		})
	}

	private handleSimulationTick(data: SimulationTickData): void {
		this.simulationTimeMs = data.nowMs
		this.tickAccumulatorMs += data.deltaMs
		if (this.tickAccumulatorMs < HARVEST_TICK_INTERVAL_MS) {
			return
		}
		this.tickAccumulatorMs -= HARVEST_TICK_INTERVAL_MS
		this.tick()
	}

	private tick(): void {
		this.processHarvestingJobs()

		const buildings = this.buildingManager.getAllBuildings()
		if (buildings.length === 0) return

		for (const building of buildings) {
			if (building.stage !== ConstructionStage.Completed) {
				continue
			}

			const definition = this.buildingManager.getBuildingDefinition(building.buildingId)
			if (!definition || !definition.harvest) {
				continue
			}

			const nodeDefinition = this.resourceNodesManager.getDefinition(definition.harvest.nodeType)
			if (!nodeDefinition) {
				continue
			}

			const outputItemType = nodeDefinition.outputItemType
			const harvestQuantity = nodeDefinition.harvestQuantity
			const buildingPriority = definition.priority ?? 1
			const overflowPriority = 20 + buildingPriority

			if (!this.storageManager.acceptsItemType(building.id, outputItemType)) {
				continue
			}

			if (!this.storageManager.hasAvailableStorage(building.id, outputItemType, harvestQuantity)) {
				continue
			}

			if (this.jobsManager.hasActiveHarvestJobForBuilding(building.id)) {
				continue
			}

			const assignedWorkers = this.buildingManager.getBuildingWorkers(building.id)
			if (assignedWorkers.length === 0) {
				continue
			}

			const availableWorkers = assignedWorkers
				.map(workerId => this.populationManager.getSettler(workerId))
				.filter(settler => settler && (settler.state === SettlerState.Idle || settler.state === SettlerState.Working))
				.map(settler => settler!)

			if (availableWorkers.length === 0) {
				continue
			}

			const node = this.resourceNodesManager.findClosestAvailableNode(
				building.mapName,
				definition.harvest.nodeType,
				building.position
			)

			if (!node) {
				continue
			}

			const workerId = availableWorkers[0].id
			const jobId = this.jobsManager.requestHarvestJob(workerId, building.id, node.id)
			if (jobId) {
				this.logger.log(`[HarvestManager] Assigned harvest job ${jobId} for building ${building.id}`)
			}

			this.handleOutputOverflow(
				building.id,
				building.position,
				building.mapName,
				building.playerId,
				outputItemType,
				harvestQuantity,
				overflowPriority
			)
		}
	}

	private handleOutputOverflow(
		buildingInstanceId: string,
		buildingPosition: { x: number, y: number },
		mapName: string,
		playerId: string,
		itemType: string,
		quantity: number,
		priority: number
	): void {
		const capacity = this.storageManager.getStorageCapacity(buildingInstanceId, itemType)
		if (capacity === 0) {
			return
		}

		const current = this.storageManager.getCurrentQuantity(buildingInstanceId, itemType)
		const available = this.storageManager.getAvailableQuantity(buildingInstanceId, itemType)
		if (available === 0 || current === 0) {
			return
		}

		const OVERFLOW_THRESHOLD = 0.8
		if (current / capacity < OVERFLOW_THRESHOLD) {
			return
		}

		if (this.jobsManager.hasActiveJobForBuilding(buildingInstanceId, itemType)) {
			return
		}

		const warehouseId = this.findClosestWarehouse(itemType, quantity, mapName, playerId, buildingPosition)
		if (!warehouseId) {
			return
		}

		const transportQuantity = Math.min(quantity, available)
		this.jobsManager.requestTransport(buildingInstanceId, warehouseId, itemType, transportQuantity, priority)
	}


	private findClosestWarehouse(
		itemType: string,
		quantity: number,
		mapName: string,
		playerId: string,
		position: { x: number, y: number }
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

	private processHarvestingJobs(): void {
		const activeHarvestJobs = this.jobsManager.getActiveHarvestJobs()
		if (activeHarvestJobs.length === 0) {
			return
		}

		for (const job of activeHarvestJobs) {
			const settler = this.populationManager.getSettler(job.settlerId)
			if (!settler || settler.state !== SettlerState.Harvesting) {
				continue
			}

			if (job.status !== 'active') {
				continue
			}

			if (!job.harvestStartedAtMs) {
				job.harvestStartedAtMs = this.simulationTimeMs
				continue
			}

			const harvestDurationMs = job.harvestDurationMs ?? 0
			if (this.simulationTimeMs - job.harvestStartedAtMs < harvestDurationMs) {
				continue
			}

			this.jobsManager.handleHarvestComplete(job.jobId)
		}
	}
}
