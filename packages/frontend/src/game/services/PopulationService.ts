import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'
import { Settler, PopulationListData, PopulationStatsData, ProfessionType, SettlerState, ConstructionStage, WorkerRequestFailureReason } from '@rugged/game'
import { buildingService } from './BuildingService'
import type { WorkAssignment } from '@rugged/game/Settlers/WorkProvider/types'

class PopulationServiceClass {
	private settlers = new Map<string, Settler>() // settlerId -> Settler
private assignments = new Map<string, WorkAssignment>() // assignmentId -> WorkAssignment
	private stats: PopulationStatsData = {
		totalCount: 0,
		byProfession: {
			[ProfessionType.Carrier]: 0,
			[ProfessionType.Builder]: 0,
			[ProfessionType.Woodcutter]: 0,
			[ProfessionType.Miner]: 0,
			[ProfessionType.Farmer]: 0,
			[ProfessionType.Miller]: 0,
			[ProfessionType.Baker]: 0,
			[ProfessionType.Vendor]: 0
		},
		byProfessionActive: {
			[ProfessionType.Carrier]: 0,
			[ProfessionType.Builder]: 0,
			[ProfessionType.Woodcutter]: 0,
			[ProfessionType.Miner]: 0,
			[ProfessionType.Farmer]: 0,
			[ProfessionType.Miller]: 0,
			[ProfessionType.Baker]: 0,
			[ProfessionType.Vendor]: 0
		},
		idleCount: 0,
		workingCount: 0,
		housingCapacity: 0
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
			const normalized = this.normalizeStats(data)
			this.stats = {
				...normalized,
				housingCapacity: this.getHousingCapacityForSettlers(Array.from(this.settlers.values()))
			}
			EventBus.emit('ui:population:stats-updated', this.stats)
		})

		// Handle settler spawned
		EventBus.on(Event.Population.SC.SettlerSpawned, (data: { settler: Settler }) => {
			console.log('[PopulationService] Settler spawned:', data.settler)
			this.settlers.set(data.settler.id, data.settler)
			EventBus.emit('ui:population:settler-spawned', data.settler)
			this.updateStatsFromSettlers()
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
				this.updateStatsFromSettlers()
			}
		})

		// Handle worker assigned
		EventBus.on(Event.Population.SC.WorkerAssigned, (data: { assignment: WorkAssignment, settlerId: string, buildingInstanceId: string }) => {
			const settler = this.settlers.get(data.settlerId)
			if (settler) {
				this.assignments.set(data.assignment.assignmentId, data.assignment)
				settler.stateContext = {
					...settler.stateContext,
					assignmentId: data.assignment.assignmentId
				}
				settler.buildingId = data.buildingInstanceId
				EventBus.emit('ui:population:worker-assigned', data)
				EventBus.emit('ui:population:settler-updated', { settlerId: data.settlerId })
				this.updateStatsFromSettlers()
			}
		})

		// Handle settler updated (state, target, etc.)
		EventBus.on(Event.Population.SC.SettlerUpdated, (data: { settler: Settler }) => {
			const settler = data.settler
			this.settlers.set(settler.id, settler)
			EventBus.emit('ui:population:settler-updated', { settlerId: settler.id })
			this.updateStatsFromSettlers()
		})

		// Handle worker unassigned
		EventBus.on(Event.Population.SC.WorkerUnassigned, (data: { settlerId: string, assignmentId: string }) => {
			const settler = this.settlers.get(data.settlerId)
			if (settler) {
				this.assignments.delete(data.assignmentId)
				settler.stateContext = {
					...settler.stateContext,
					assignmentId: undefined
				}
				settler.buildingId = undefined
				settler.state = SettlerState.Idle
				EventBus.emit('ui:population:worker-unassigned', data)
				EventBus.emit('ui:population:settler-updated', { settlerId: data.settlerId })
				this.updateStatsFromSettlers()
			}
		})

		// Handle worker request failed
		EventBus.on(Event.Population.SC.WorkerRequestFailed, (data: { reason: WorkerRequestFailureReason, buildingInstanceId: string }) => {
			console.warn('[PopulationService] Worker request failed:', data)
			EventBus.emit('ui:population:worker-request-failed', data)
		})

		// Recalculate housing capacity when houses change
		EventBus.on(Event.Buildings.SC.Catalog, () => {
			this.updateStatsFromSettlers()
		})
		EventBus.on(Event.Buildings.SC.Completed, () => {
			this.updateStatsFromSettlers()
		})
		EventBus.on(Event.Buildings.SC.Cancelled, () => {
			this.updateStatsFromSettlers()
		})
	}

	private handlePopulationList(data: PopulationListData): void {
		// Clear existing settlers
		this.settlers.clear()
		this.assignments.clear()

		// Add all settlers from list
		data.settlers.forEach(settler => {
			this.settlers.set(settler.id, settler)
		})

		// Update stats from current settlers to keep professions in sync
		this.updateStatsFromSettlers()

		// Emit UI event
		EventBus.emit('ui:population:list-loaded', data)
	}

	private getEmptyByProfession(): Record<ProfessionType, number> {
		const byProfession = {} as Record<ProfessionType, number>
		Object.values(ProfessionType).forEach(profession => {
			byProfession[profession] = 0
		})
		return byProfession
	}

	private normalizeStats(data: PopulationStatsData): PopulationStatsData {
		const byProfession = this.getEmptyByProfession()
		const byProfessionActive = this.getEmptyByProfession()
		Object.entries(data.byProfession).forEach(([profession, count]) => {
			byProfession[profession as ProfessionType] = count
		})
		Object.entries(data.byProfessionActive).forEach(([profession, count]) => {
			byProfessionActive[profession as ProfessionType] = count
		})
		return {
			totalCount: data.totalCount,
			byProfession,
			byProfessionActive,
			idleCount: data.idleCount,
			workingCount: data.workingCount,
			housingCapacity: data.housingCapacity ?? 0
		}
	}

	private getHousingCapacityForSettlers(settlers: Settler[]): number {
		if (settlers.length === 0) {
			return 0
		}
		const mapName = settlers[0].mapName
		const playerId = settlers[0].playerId
		const buildings = buildingService.getAllBuildingInstances()
		let capacity = 0

		for (const building of buildings) {
			if (building.mapName !== mapName || building.playerId !== playerId) {
				continue
			}
			if (building.stage !== ConstructionStage.Completed) {
				continue
			}
			const definition = buildingService.getBuildingDefinition(building.buildingId)
			if (!definition?.spawnsSettlers) {
				continue
			}
			capacity += definition.maxOccupants ?? 0
		}

		return capacity
	}

	private calculateStatsFromSettlers(): PopulationStatsData {
		const byProfession = this.getEmptyByProfession()
		const byProfessionActive = this.getEmptyByProfession()
		let idleCount = 0
		let workingCount = 0

		this.settlers.forEach(settler => {
			byProfession[settler.profession] = (byProfession[settler.profession] || 0) + 1
			if (settler.state !== SettlerState.Idle) {
				byProfessionActive[settler.profession] = (byProfessionActive[settler.profession] || 0) + 1
			}
			if (settler.state === SettlerState.Idle) {
				idleCount += 1
				return
			}
			if (settler.state === SettlerState.Working || settler.state === SettlerState.Harvesting) {
				workingCount += 1
			}
		})

		return {
			totalCount: this.settlers.size,
			byProfession,
			byProfessionActive,
			idleCount,
			workingCount,
			housingCapacity: this.getHousingCapacityForSettlers(Array.from(this.settlers.values()))
		}
	}

	private updateStatsFromSettlers(): void {
		this.stats = this.calculateStatsFromSettlers()
		EventBus.emit('ui:population:stats-updated', this.stats)
	}

	// Public getters
	public getSettler(settlerId: string): Settler | undefined {
		return this.settlers.get(settlerId)
	}

	public getSettlers(): Settler[] {
		return Array.from(this.settlers.values())
	}

	public getAssignment(assignmentId?: string): WorkAssignment | undefined {
		if (!assignmentId) {
			return undefined
		}
		return this.assignments.get(assignmentId)
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

	// Request a carrier to pick up a profession tool
	public requestProfessionToolPickup(profession: ProfessionType): void {
		EventBus.emit(Event.Population.CS.RequestProfessionToolPickup, {
			profession
		})
	}

	// Request an idle worker to revert to carrier
	public requestRevertToCarrier(profession: ProfessionType): void {
		EventBus.emit(Event.Population.CS.RequestRevertToCarrier, {
			profession
		})
	}

	// Get workers assigned to a building
	public getBuildingWorkers(buildingInstanceId: string): Settler[] {
		return Array.from(this.settlers.values()).filter(
			settler => settler.buildingId === buildingInstanceId && settler.state === SettlerState.Working
		)
	}
}

export const populationService = new PopulationServiceClass()
