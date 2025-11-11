import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'
import { Settler, PopulationListData, PopulationStatsData, ProfessionType, SettlerState } from '@rugged/game'

class PopulationServiceClass {
	private settlers = new Map<string, Settler>() // settlerId -> Settler
	private stats: PopulationStatsData = {
		totalCount: 0,
		byProfession: {
			[ProfessionType.Carrier]: 0,
			[ProfessionType.Builder]: 0,
			[ProfessionType.Woodcutter]: 0,
			[ProfessionType.Miner]: 0
		},
		idleCount: 0,
		workingCount: 0
	}

	constructor() {
		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		// Handle population list (full state on join)
		EventBus.on(Event.Population.SC.List, (data: PopulationListData) => {
			console.log('[PopulationService] Received population list:', data)
			this.handlePopulationList(data)
		})

		// Handle statistics updates
		EventBus.on(Event.Population.SC.StatsUpdated, (data: PopulationStatsData) => {
			console.log('[PopulationService] Received population stats update:', data)
			this.stats = data
			EventBus.emit('ui:population:stats-updated', data)
		})

		// Handle settler spawned
		EventBus.on(Event.Population.SC.SettlerSpawned, (data: { settler: Settler }) => {
			console.log('[PopulationService] Settler spawned:', data.settler)
			this.settlers.set(data.settler.id, data.settler)
			EventBus.emit('ui:population:settler-spawned', data.settler)
		})

		// Note: Position updates are now handled directly by SettlerController via MovementEvents.SC.MoveToPosition
		// PopulationService doesn't need to track position updates anymore

		// Handle profession changed
		EventBus.on(Event.Population.SC.ProfessionChanged, (data: { settlerId: string, oldProfession: ProfessionType, newProfession: ProfessionType }) => {
			const settler = this.settlers.get(data.settlerId)
			if (settler) {
				settler.profession = data.newProfession
				EventBus.emit('ui:population:profession-changed', data)
				EventBus.emit('ui:population:settler-updated', { settlerId: data.settlerId })
			}
		})

		// Handle worker assigned
		EventBus.on(Event.Population.SC.WorkerAssigned, (data: { jobAssignment: any, settlerId: string, buildingInstanceId: string }) => {
			const settler = this.settlers.get(data.settlerId)
			if (settler) {
				settler.currentJob = data.jobAssignment
				settler.buildingId = data.buildingInstanceId
				settler.state = SettlerState.Working
				EventBus.emit('ui:population:worker-assigned', data)
				EventBus.emit('ui:population:settler-updated', { settlerId: data.settlerId })
			}
		})

		// Handle settler updated (state, target, etc.)
		EventBus.on(Event.Population.SC.SettlerUpdated, (data: { settler: Settler }) => {
			const settler = data.settler
			this.settlers.set(settler.id, settler)
			EventBus.emit('ui:population:settler-updated', { settlerId: settler.id })
		})

		// Handle worker unassigned
		EventBus.on(Event.Population.SC.WorkerUnassigned, (data: { settlerId: string }) => {
			const settler = this.settlers.get(data.settlerId)
			if (settler) {
				settler.currentJob = undefined
				settler.buildingId = undefined
				settler.state = SettlerState.Idle
				EventBus.emit('ui:population:worker-unassigned', data)
				EventBus.emit('ui:population:settler-updated', { settlerId: data.settlerId })
			}
		})

		// Handle worker request failed
		EventBus.on(Event.Population.SC.WorkerRequestFailed, (data: { reason: string, buildingInstanceId: string }) => {
			console.warn('[PopulationService] Worker request failed:', data)
			EventBus.emit('ui:population:worker-request-failed', data)
		})
	}

	private handlePopulationList(data: PopulationListData): void {
		// Clear existing settlers
		this.settlers.clear()

		// Add all settlers from list
		data.settlers.forEach(settler => {
			this.settlers.set(settler.id, settler)
		})

		// Update stats
		this.stats = {
			totalCount: data.totalCount,
			byProfession: data.byProfession,
			idleCount: data.idleCount,
			workingCount: data.workingCount
		}

		// Emit UI event
		EventBus.emit('ui:population:list-loaded', data)
	}

	// Public getters
	public getSettler(settlerId: string): Settler | undefined {
		return this.settlers.get(settlerId)
	}

	public getSettlers(): Settler[] {
		return Array.from(this.settlers.values())
	}

	public getStats(): PopulationStatsData {
		return this.stats
	}

	// Request worker for building
	public requestWorker(buildingInstanceId: string): void {
		EventBus.emit(Event.Population.CS.RequestWorker, {
			buildingInstanceId
		})
	}

	// Unassign worker
	public unassignWorker(settlerId: string): void {
		EventBus.emit(Event.Population.CS.UnassignWorker, {
			settlerId
		})
	}

	// Request population list
	public requestList(): void {
		EventBus.emit(Event.Population.CS.RequestList, {})
	}

	// Get workers assigned to a building
	public getBuildingWorkers(buildingInstanceId: string): Settler[] {
		return Array.from(this.settlers.values()).filter(
			settler => settler.buildingId === buildingInstanceId && settler.state === SettlerState.Working
		)
	}
}

export const populationService = new PopulationServiceClass()
