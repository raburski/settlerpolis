import { EventManager } from '../events'
import type { BuildingManager } from '../Buildings'
import type { PopulationManager } from '../Population'
import type { JobsManager } from '../Jobs'
import type { ResourceNodesManager } from '../ResourceNodes'
import type { StorageManager } from '../Storage'
import { Logger } from '../Logs'
import { SimulationEvents } from '../Simulation/events'
import { SimulationTickData } from '../Simulation/types'
import { ConstructionStage } from '../Buildings/types'
import { RoleType } from '../Jobs/types'
import { SettlerState } from '../Population/types'
import { JobStatus } from '../Jobs/types'
import { BaseManager } from '../Managers'

const HARVEST_TICK_INTERVAL_MS = 1000

export interface HarvestDeps {
	buildings: BuildingManager
	population: PopulationManager
	jobs: JobsManager
	resourceNodes: ResourceNodesManager
	storage: StorageManager
}

export class HarvestManager extends BaseManager<HarvestDeps> {
	private tickAccumulatorMs = 0
	private simulationTimeMs = 0

	constructor(
		managers: HarvestDeps,
		private event: EventManager,
		private logger: Logger
	) {
		super(managers)
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

		const buildings = this.managers.buildings.getAllBuildings()
		if (buildings.length === 0) return

		for (const building of buildings) {
			if (building.stage !== ConstructionStage.Completed) {
				continue
			}

			const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
			if (!definition || !definition.harvest) {
				continue
			}

			const nodeDefinition = this.managers.resourceNodes.getDefinition(definition.harvest.nodeType)
			if (!nodeDefinition) {
				continue
			}

			const outputItemType = nodeDefinition.outputItemType
			const harvestQuantity = nodeDefinition.harvestQuantity

			if (!this.managers.storage.acceptsItemType(building.id, outputItemType)) {
				continue
			}

			if (!this.managers.storage.hasAvailableStorage(building.id, outputItemType, harvestQuantity)) {
				continue
			}

			if (this.managers.jobs.hasActiveHarvestJobForBuilding(building.id)) {
				continue
			}

			const assignedWorkers = this.managers.jobs.getAssignedWorkerIdsForBuilding(building.id, RoleType.Production)
			if (assignedWorkers.length === 0) {
				continue
			}

			const availableWorkers = assignedWorkers
				.map(workerId => this.managers.population.getSettler(workerId))
				.filter(settler => settler && settler.state === SettlerState.Idle && !settler.stateContext.jobId)
				.map(settler => settler!)

			if (availableWorkers.length === 0) {
				continue
			}

			const node = this.managers.resourceNodes.findClosestAvailableNode(
				building.mapName,
				definition.harvest.nodeType,
				building.position
			)

			if (!node) {
				continue
			}

			const workerId = availableWorkers[0].id
			const jobId = this.managers.jobs.requestHarvestJob(workerId, building.id, node.id)
			if (jobId) {
				this.logger.log(`[HarvestManager] Assigned harvest job ${jobId} for building ${building.id}`)
			}
		}
	}

	private processHarvestingJobs(): void {
		const activeHarvestJobs = this.managers.jobs.getActiveHarvestJobs()
		if (activeHarvestJobs.length === 0) {
			return
		}

		for (const job of activeHarvestJobs) {
			const settler = this.managers.population.getSettler(job.settlerId)
			if (!settler || settler.state !== SettlerState.Harvesting) {
				continue
			}

			if (job.status !== JobStatus.Active) {
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

			this.managers.jobs.handleHarvestComplete(job.jobId)
		}
	}
}
