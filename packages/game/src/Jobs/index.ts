import { EventManager } from '../events'
import type { BuildingManager } from '../Buildings'
import type { PopulationManager } from '../Population'
import type { LootManager } from '../Loot'
import type { MapManager } from '../Map'
import type { StorageManager } from '../Storage'
import type { ResourceNodesManager } from '../ResourceNodes'
import type { ItemsManager } from '../Items'
import { Settler, SettlerState } from '../Population/types'
import { JobAssignment, JobPhase, JobReservation, JobStatus, JobType, RoleAssignment, RoleType } from './types'
import { PopulationEvents } from '../Population/events'
import { Receiver } from '../Receiver'
import { Logger } from '../Logs'
import { SimulationEvents } from '../Simulation/events'
import { SimulationTickData } from '../Simulation/types'
import { ReservationService } from './ReservationService'
import { JobStateMachine } from './StateMachine'
import { BaseManager } from '../Managers'
import { TaskRegistry } from './TaskRegistry'
import type { JobEvent, JobTaskContext } from './TaskContext'
import { TransportJobService } from './tasks/Transport'
import { HarvestJobService } from './tasks/Harvest'
import { RoleAssignments } from './RoleAssignments'

export interface JobsDeps {
	buildings: BuildingManager
	population: PopulationManager
	loot: LootManager
	map: MapManager
	storage: StorageManager
	resourceNodes: ResourceNodesManager
	items: ItemsManager
}

export class JobsManager extends BaseManager<JobsDeps> {
	private jobs = new Map<string, JobAssignment>()
	private activeJobsByBuilding = new Map<string, Set<string>>()
	private dispatchAccumulatorMs = 0
	private simulationTimeMs = 0
	private readonly DISPATCH_INTERVAL_MS = 500
	private reservationService: ReservationService
	private taskRegistry: TaskRegistry
	private stateMachine: JobStateMachine
	private roleAssignments: RoleAssignments
	private transportService: TransportJobService
	private harvestService: HarvestJobService

	constructor(
		managers: JobsDeps,
		private event: EventManager,
		private logger: Logger
	) {
		super(managers)
		this.reservationService = new ReservationService(this.managers, this.logger)

		const taskContext: JobTaskContext = {
			managers: this.managers,
			event: this.event,
			reservationService: this.reservationService,
			logger: this.logger,
			getJob: (jobId: string) => this.jobs.get(jobId),
			getSettler: (job: JobAssignment) => this.getSettler(job),
			advanceJobPhase: (job: JobAssignment, jobEvent: JobEvent) => this.advanceJobPhase(job, jobEvent),
			dispatchPhase: () => {},
			cancelJob: (jobId: string, reason?: string) => this.cancelJob(jobId, reason),
			completeJob: (jobId: string) => this.completeJob(jobId),
			assignWorkerToJob: (jobId: string, settlerId: string) => this.assignWorkerToJob(jobId, settlerId),
			getAssignedWorkerCountForBuilding: (buildingInstanceId: string, roleType?: RoleType) =>
				this.roleAssignments?.getAssignedWorkerCountForBuilding(buildingInstanceId, roleType) ?? 0,
			removeReservation: (job: JobAssignment, reservationId: string) => this.removeReservation(job, reservationId),
			getSimulationTimeMs: () => this.simulationTimeMs || Date.now()
		}

		this.taskRegistry = new TaskRegistry(taskContext)
		this.stateMachine = new JobStateMachine(taskContext, this.taskRegistry)
		taskContext.dispatchPhase = (job: JobAssignment, phase: JobPhase) => this.stateMachine.dispatchPhase(job, phase)

		this.roleAssignments = new RoleAssignments({
			managers: this.managers,
			event: this.event,
			logger: this.logger,
			reservationService: this.reservationService,
			registerJob: (job: JobAssignment) => this.registerJob(job),
			startJob: (job: JobAssignment) => this.startJob(job),
			addReservation: (job: JobAssignment, reservation: JobReservation | null) => this.addReservation(job, reservation),
			cancelJob: (jobId: string, reason?: string) => this.cancelJob(jobId, reason)
		})

		this.transportService = new TransportJobService({
			managers: this.managers,
			reservationService: this.reservationService,
			logger: this.logger,
			getSimulationTimeMs: () => this.simulationTimeMs || Date.now(),
			isSettlerAssignedToRole: (settlerId: string) => this.roleAssignments.isSettlerAssignedToRole(settlerId),
			registerJob: (job: JobAssignment) => this.registerJob(job),
			startJob: (job: JobAssignment) => this.startJob(job),
			addReservation: (job: JobAssignment, reservation: JobReservation | null) => this.addReservation(job, reservation),
			trackJobForBuilding: (jobId: string, buildingInstanceId: string) => this.trackJobForBuilding(jobId, buildingInstanceId)
		})

		this.harvestService = new HarvestJobService({
			managers: this.managers,
			reservationService: this.reservationService,
			logger: this.logger,
			registerJob: (job: JobAssignment) => this.registerJob(job),
			startJob: (job: JobAssignment) => this.startJob(job),
			addReservation: (job: JobAssignment, reservation: JobReservation | null) => this.addReservation(job, reservation),
			getJob: (jobId: string) => this.getJob(jobId),
			getJobs: () => this.jobs.values(),
			advanceJobPhase: (job: JobAssignment, jobEvent: JobEvent) => this.advanceJobPhase(job, jobEvent),
			dispatchPhase: (job: JobAssignment, phase: JobPhase) => this.stateMachine.dispatchPhase(job, phase),
			cancelJob: (jobId: string, reason?: string) => this.cancelJob(jobId, reason)
		})

		this.setupEventHandlers()
	}

	private setupEventHandlers() {
		this.event.on(SimulationEvents.SS.Tick, (data: SimulationTickData) => {
			this.handleSimulationTick(data)
		})
	}

	private handleSimulationTick(data: SimulationTickData): void {
		this.simulationTimeMs = data.nowMs
		this.dispatchAccumulatorMs += data.deltaMs
		if (this.dispatchAccumulatorMs < this.DISPATCH_INTERVAL_MS) {
			return
		}
		this.dispatchAccumulatorMs -= this.DISPATCH_INTERVAL_MS
		this.transportService.dispatchQueue()
		this.roleAssignments.dispatchRoleAssignments()
	}

	private setJobPhase(job: JobAssignment, phase: JobPhase): void {
		job.phase = phase
		job.phaseStartedAtMs = this.simulationTimeMs || Date.now()
		job.lastProgressAtMs = job.phaseStartedAtMs

		if (phase === JobPhase.Completed) {
			job.status = JobStatus.Completed
			return
		}
		if (phase === JobPhase.Cancelled) {
			job.status = JobStatus.Cancelled
			return
		}

		if (job.jobType === JobType.Construction || job.jobType === JobType.Production) {
			job.status = phase === JobPhase.Working ? JobStatus.Active : JobStatus.Pending
		} else {
			job.status = JobStatus.Active
		}
	}

	private advanceJobPhase(job: JobAssignment, event: JobEvent): JobPhase | null {
		const nextPhase = this.taskRegistry.getNextPhase(job, event)
		if (!nextPhase) {
			return null
		}
		this.setJobPhase(job, nextPhase)
		return nextPhase
	}

	private addReservation(job: JobAssignment, reservation: JobReservation | null): void {
		if (!reservation) {
			return
		}
		if (!job.reservations) {
			job.reservations = []
		}
		job.reservations.push(reservation)
	}

	private removeReservation(job: JobAssignment, reservationId: string): void {
		if (!job.reservations || job.reservations.length === 0) {
			return
		}
		job.reservations = job.reservations.filter(reservation => reservation.id !== reservationId)
	}

	private releaseAllReservations(job: JobAssignment): void {
		if (!job.reservations || job.reservations.length === 0) {
			return
		}
		this.reservationService.releaseAll(job.reservations)
		job.reservations = []
	}

	private getSettler(job: JobAssignment): Settler | null {
		const settler = this.managers.population.getSettler(job.settlerId)
		if (!settler) {
			return null
		}
		return settler
	}

	private startJob(job: JobAssignment): void {
		const definition = this.taskRegistry.getDefinition(job.jobType)
		if (!definition) {
			return
		}

		const phase = definition.initialPhase(job)
		this.setJobPhase(job, phase)
		this.stateMachine.dispatchPhase(job, phase)
	}

	public handleSettlerArrival(settler: Settler): SettlerState | null {
		return this.stateMachine.handleSettlerArrival(settler)
	}

	public handleHarvestComplete(jobId: string): void {
		this.harvestService.handleHarvestComplete(jobId)
	}

	public requestResourceCollection(buildingInstanceId: string, itemType: string, priority: number = 1): void {
		this.logger.log(`[JOBS] Requesting resource collection: building=${buildingInstanceId}, itemType=${itemType}, priority=${priority}`)

		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			this.logger.warn(`[JOBS] Cannot request resource collection: Building ${buildingInstanceId} not found`)
			return
		}

		if (this.hasActiveJobForBuilding(buildingInstanceId, itemType)) {
			this.logger.log(`[JOBS] Building ${buildingInstanceId} already has active or pending job for ${itemType}`)
			return
		}

		this.transportService.requestResourceCollection(buildingInstanceId, itemType, priority)
	}

	public requestHarvestJob(settlerId: string, buildingInstanceId: string, resourceNodeId: string): string | null {
		return this.harvestService.requestHarvestJob(settlerId, buildingInstanceId, resourceNodeId)
	}

	public getActiveHarvestJobs(): JobAssignment[] {
		return this.harvestService.getActiveHarvestJobs()
	}

	public requestTransport(
		sourceBuildingInstanceId: string,
		targetBuildingInstanceId: string,
		itemType: string,
		quantity: number,
		priority: number = 1
	): string | null {
		this.logger.log(`[JOBS] Requesting transport: source=${sourceBuildingInstanceId}, target=${targetBuildingInstanceId}, itemType=${itemType}, quantity=${quantity}, priority=${priority}`)
		this.transportService.requestTransport(sourceBuildingInstanceId, targetBuildingInstanceId, itemType, quantity, priority)
		return null
	}

	public requestWorker(buildingInstanceId: string): void {
		this.roleAssignments.requestWorker(buildingInstanceId)
	}

	public unassignWorker(settlerId: string, reason: string = 'unassigned'): void {
		this.roleAssignments.unassignWorker(settlerId, reason)
	}

	public clearRoleAssignmentsForBuilding(
		buildingInstanceId: string,
		roleType?: RoleType,
		options?: { skipJobCancel?: boolean }
	): void {
		this.roleAssignments.clearRoleAssignmentsForBuilding(buildingInstanceId, roleType, options)
	}

	public getRoleAssignmentForSettler(settlerId: string): RoleAssignment | undefined {
		return this.roleAssignments.getRoleAssignmentForSettler(settlerId)
	}

	public getAssignedWorkerIdsForBuilding(buildingInstanceId: string, roleType?: RoleType): string[] {
		return this.roleAssignments.getAssignedWorkerIdsForBuilding(buildingInstanceId, roleType)
	}

	public getAssignedWorkerCountForBuilding(buildingInstanceId: string, roleType?: RoleType): number {
		return this.roleAssignments.getAssignedWorkerCountForBuilding(buildingInstanceId, roleType)
	}

	// Job Tracking
	public getJob(jobId: string): JobAssignment | undefined {
		return this.jobs.get(jobId)
	}

	public getActiveJobsForBuilding(buildingInstanceId: string): JobAssignment[] {
		const jobIds = this.activeJobsByBuilding.get(buildingInstanceId) || new Set()
		return Array.from(jobIds)
			.map(jobId => this.jobs.get(jobId))
			.filter(job => job !== undefined && job.status !== JobStatus.Completed && job.status !== JobStatus.Cancelled) as JobAssignment[]
	}

	public hasActiveJobForBuilding(buildingInstanceId: string, itemType?: string): boolean {
		const jobs = this.getActiveJobsForBuilding(buildingInstanceId)
		if (itemType) {
			const activeMatch = jobs.some(job =>
				job.jobType === JobType.Transport && job.itemType === itemType
			)
			if (activeMatch) {
				return true
			}
			return this.transportService.hasPendingRequestForBuilding(buildingInstanceId, itemType)
		}
		if (jobs.length > 0) {
			return true
		}
		return this.transportService.hasPendingRequestForBuilding(buildingInstanceId)
	}

	public hasActiveHarvestJobForBuilding(buildingInstanceId: string): boolean {
		const jobs = this.getActiveJobsForBuilding(buildingInstanceId)
		return jobs.some(job => job.jobType === JobType.Harvest)
	}

	public getActiveWorkerIdsForBuilding(buildingInstanceId: string, jobType?: JobType): string[] {
		const workerIds = new Set<string>()
		for (const job of this.jobs.values()) {
			if (job.buildingInstanceId !== buildingInstanceId) {
				continue
			}
			if (job.status === JobStatus.Completed || job.status === JobStatus.Cancelled) {
				continue
			}
			if (job.phase !== JobPhase.Working) {
				continue
			}
			if (jobType && job.jobType !== jobType) {
				continue
			}
			workerIds.add(job.settlerId)
		}
		return Array.from(workerIds)
	}

	public getActiveWorkerCountForBuilding(buildingInstanceId: string, jobType?: JobType): number {
		return this.getActiveWorkerIdsForBuilding(buildingInstanceId, jobType).length
	}

	public completeJob(jobId: string): void {
		const job = this.jobs.get(jobId)
		if (!job) {
			this.logger.warn(`[JOBS] Cannot complete job: Job ${jobId} not found`)
			return
		}

		this.logger.log(`[JOBS] Completing job ${jobId}: building=${job.buildingInstanceId}, type=${job.jobType}, itemType=${job.itemType || 'none'}`)
		this.setJobPhase(job, JobPhase.Completed)
		this.releaseAllReservations(job)

		if (job.jobType === JobType.Construction || job.jobType === JobType.Production) {
			const building = this.managers.buildings.getBuildingInstance(job.buildingInstanceId)
			if (building) {
				this.event.emit(Receiver.Group, PopulationEvents.SC.WorkerUnassigned, {
					settlerId: job.settlerId,
					buildingInstanceId: job.buildingInstanceId,
					jobId: job.jobId
				}, building.mapName)
			}
		}

		const buildingJobs = this.activeJobsByBuilding.get(job.buildingInstanceId)
		if (buildingJobs) {
			buildingJobs.delete(jobId)
			this.logger.log(`[JOBS] Removed job ${jobId} from building ${job.buildingInstanceId}. Remaining active jobs: ${buildingJobs.size}`)
			if (buildingJobs.size === 0) {
				this.activeJobsByBuilding.delete(job.buildingInstanceId)
				this.logger.log(`[JOBS] No more active jobs for building ${job.buildingInstanceId}`)
			}
		}

		if (job.resourceNodeId) {
			this.managers.resourceNodes.releaseReservation(job.resourceNodeId, jobId)
		}
	}

	public cancelJob(jobId: string, reason?: string, options?: { skipSettlerReset?: boolean }): void {
		const job = this.jobs.get(jobId)
		if (!job) {
			return
		}

		this.setJobPhase(job, JobPhase.Cancelled)
		this.releaseAllReservations(job)

		if (job.resourceNodeId) {
			this.managers.resourceNodes.releaseReservation(job.resourceNodeId, jobId)
		}

		const settler = this.managers.population.getSettler(job.settlerId)
		if (settler && job.carriedItemId && job.itemType) {
			if (job.sourceBuildingInstanceId && this.managers.storage && job.quantity) {
				const returned = this.managers.storage.addToStorage(job.sourceBuildingInstanceId, job.itemType, job.quantity)
				if (!returned) {
					this.dropCarriedItem(job, settler)
				}
			} else {
				this.dropCarriedItem(job, settler)
			}
		}

		if (job.jobType === JobType.Construction || job.jobType === JobType.Production) {
			const building = this.managers.buildings.getBuildingInstance(job.buildingInstanceId)
			if (building) {
				this.event.emit(Receiver.Group, PopulationEvents.SC.WorkerUnassigned, {
					settlerId: job.settlerId,
					buildingInstanceId: job.buildingInstanceId,
					jobId: job.jobId
				}, building.mapName)
			}
		}

		const buildingJobs = this.activeJobsByBuilding.get(job.buildingInstanceId)
		if (buildingJobs) {
			buildingJobs.delete(jobId)
			if (buildingJobs.size === 0) {
				this.activeJobsByBuilding.delete(job.buildingInstanceId)
			}
		}

		if (job.sourceBuildingInstanceId) {
			const sourceBuildingJobs = this.activeJobsByBuilding.get(job.sourceBuildingInstanceId)
			if (sourceBuildingJobs) {
				sourceBuildingJobs.delete(jobId)
				if (sourceBuildingJobs.size === 0) {
					this.activeJobsByBuilding.delete(job.sourceBuildingInstanceId)
				}
			}
		}

		if (!options?.skipSettlerReset) {
			this.managers.population.resetSettlerFromJob(jobId, reason || 'job_cancelled')
		}
	}

	private dropCarriedItem(job: JobAssignment, settler: Settler): void {
		if (!job.carriedItemId || !job.itemType) {
			return
		}

		const fakeClient: any = {
			id: settler.playerId,
			currentGroup: settler.mapName,
			emit: (receiver: any, event: string, data: any, target?: any) => {
				this.event.emit(receiver, event, data, target)
			},
			setGroup: () => {}
		}

		this.managers.loot.dropItem({ id: job.carriedItemId, itemType: job.itemType }, settler.position, fakeClient, job.quantity || 1)
		this.logger.log(`[JOBS] Dropped carried item ${job.carriedItemId} for cancelled job ${job.jobId}`)
	}

	public assignWorkerToJob(jobId: string, settlerId: string): void {
		const job = this.jobs.get(jobId)
		if (!job) {
			return
		}

		if (job.jobType === JobType.Construction || job.jobType === JobType.Production) {
			const building = this.managers.buildings.getBuildingInstance(job.buildingInstanceId)
			if (building) {
				this.event.emit(Receiver.Group, PopulationEvents.SC.WorkerAssigned, {
					jobAssignment: job,
					settlerId,
					buildingInstanceId: job.buildingInstanceId
				}, building.mapName)
			}
		}
	}

	private registerJob(job: JobAssignment): void {
		this.jobs.set(job.jobId, job)
		this.trackJobForBuilding(job.jobId, job.buildingInstanceId)
	}

	private trackJobForBuilding(jobId: string, buildingInstanceId: string): void {
		if (!this.activeJobsByBuilding.has(buildingInstanceId)) {
			this.activeJobsByBuilding.set(buildingInstanceId, new Set())
		}
		this.activeJobsByBuilding.get(buildingInstanceId)!.add(jobId)
	}
}
