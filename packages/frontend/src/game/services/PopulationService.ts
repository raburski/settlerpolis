import { EventBus } from '../EventBus'
import { Event } from '@rugged/game'
import { Settler, PopulationListData, PopulationStatsData, ProfessionType, SettlerPatch, SettlerState, ConstructionStage, WorkerRequestFailureReason } from '@rugged/game'
import { buildingService } from './BuildingService'
import type { WorkAssignment } from '@rugged/game/Settlers/WorkProvider/types'
import { UiEvents } from '../uiEvents'

class PopulationServiceClass {
	private settlers = new Map<string, Settler>() // settlerId -> Settler
	private assignments = new Map<string, WorkAssignment>() // assignmentId -> WorkAssignment
	private statsRefreshTimer: ReturnType<typeof setTimeout> | null = null
	private readonly STATS_REFRESH_INTERVAL_MS = 120
	private housingCapacityDirty = true
	private housingCapacityCache = 0
	private stats: PopulationStatsData = {
		totalCount: 0,
		byProfession: {
			[ProfessionType.Carrier]: 0,
			[ProfessionType.Builder]: 0,
			[ProfessionType.Woodcutter]: 0,
			[ProfessionType.Miner]: 0,
			[ProfessionType.Metallurgist]: 0,
			[ProfessionType.Farmer]: 0,
			[ProfessionType.Fisher]: 0,
			[ProfessionType.Miller]: 0,
			[ProfessionType.Baker]: 0,
			[ProfessionType.Vendor]: 0,
			[ProfessionType.Hunter]: 0
		},
		byProfessionActive: {
			[ProfessionType.Carrier]: 0,
			[ProfessionType.Builder]: 0,
			[ProfessionType.Woodcutter]: 0,
			[ProfessionType.Miner]: 0,
			[ProfessionType.Metallurgist]: 0,
			[ProfessionType.Farmer]: 0,
			[ProfessionType.Fisher]: 0,
			[ProfessionType.Miller]: 0,
			[ProfessionType.Baker]: 0,
			[ProfessionType.Vendor]: 0,
			[ProfessionType.Hunter]: 0
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
				this.housingCapacityCache = normalized.housingCapacity || 0
				this.housingCapacityDirty = false
				this.stats = normalized
				EventBus.emit(UiEvents.Population.StatsUpdated, this.stats)
			})

		// Handle settler spawned
			EventBus.on(Event.Population.SC.SettlerSpawned, (data: { settler: Settler }) => {
				console.log('[PopulationService] Settler spawned:', data.settler)
				this.settlers.set(data.settler.id, data.settler)
				EventBus.emit(UiEvents.Population.SettlerSpawned, data.settler)
				this.scheduleStatsRefresh()
			})

		// Note: Position updates are now handled directly by SettlerController via MovementEvents.SC.MoveToPosition
		// PopulationService doesn't need to track position updates anymore

		// Handle profession changed
			EventBus.on(Event.Population.SC.ProfessionChanged, (data: { settlerId: string, oldProfession: ProfessionType, newProfession: ProfessionType }) => {
				const settler = this.settlers.get(data.settlerId)
				if (settler) {
					settler.profession = data.newProfession
					EventBus.emit(UiEvents.Population.ProfessionChanged, data)
					EventBus.emit(UiEvents.Population.SettlerUpdated, { settlerId: data.settlerId, settler })
					this.scheduleStatsRefresh()
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
					EventBus.emit(UiEvents.Population.WorkerAssigned, data)
					EventBus.emit(UiEvents.Population.SettlerUpdated, { settlerId: data.settlerId, settler })
				}
			})

		// Handle settler updated (state, target, etc.)
			EventBus.on(Event.Population.SC.SettlerUpdated, (data: { settler: Settler }) => {
				const settler = data.settler
				this.settlers.set(settler.id, settler)
				EventBus.emit(UiEvents.Population.SettlerUpdated, { settlerId: settler.id, settler })
				this.scheduleStatsRefresh()
			})

			// Handle settler patched (delta updates: state/needs/target/context)
			EventBus.on(Event.Population.SC.SettlerPatched, (data: { settlerId: string, patch: SettlerPatch }) => {
				const updatedSettler = this.applySettlerPatch(data.settlerId, data.patch)
				if (!updatedSettler) {
					return
				}
				EventBus.emit(UiEvents.Population.SettlerUpdated, {
					settlerId: data.settlerId,
					settler: updatedSettler,
					patch: data.patch
				})
				if (this.doesPatchAffectStats(data.patch)) {
					this.scheduleStatsRefresh()
				}
			})

		// Handle settler death/removal
			EventBus.on(Event.Population.SC.SettlerDied, (data: { settlerId: string }) => {
				if (this.settlers.has(data.settlerId)) {
					this.settlers.delete(data.settlerId)
				for (const [assignmentId, assignment] of this.assignments.entries()) {
					if (assignment.settlerId === data.settlerId) {
						this.assignments.delete(assignmentId)
					}
				}
				}
				EventBus.emit(UiEvents.Population.SettlerDied, data)
				this.scheduleStatsRefresh()
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
					EventBus.emit(UiEvents.Population.WorkerUnassigned, data)
					EventBus.emit(UiEvents.Population.SettlerUpdated, { settlerId: data.settlerId, settler })
				}
			})

		// Handle worker request failed
		EventBus.on(Event.Population.SC.WorkerRequestFailed, (data: { reason: WorkerRequestFailureReason, buildingInstanceId: string }) => {
			console.warn('[PopulationService] Worker request failed:', data)
			EventBus.emit(UiEvents.Population.WorkerRequestFailed, data)
		})

		// Recalculate housing capacity when houses change
			EventBus.on(Event.Buildings.SC.Catalog, () => {
				this.housingCapacityDirty = true
				this.scheduleStatsRefresh(true)
			})
			EventBus.on(Event.Buildings.SC.Completed, () => {
				this.housingCapacityDirty = true
				this.scheduleStatsRefresh(true)
			})
			EventBus.on(Event.Buildings.SC.Cancelled, () => {
				this.housingCapacityDirty = true
				this.scheduleStatsRefresh(true)
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
		this.housingCapacityDirty = true
		this.scheduleStatsRefresh(true)

		// Emit UI event
		EventBus.emit(UiEvents.Population.ListLoaded, data)
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
		const mapId = settlers[0].mapId
		const playerId = settlers[0].playerId
		const buildings = buildingService.getAllBuildingInstances()
		let capacity = 0

		for (const building of buildings) {
			if (building.mapId !== mapId || building.playerId !== playerId) {
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

	private getCachedHousingCapacity(): number {
		if (!this.housingCapacityDirty) {
			return this.housingCapacityCache
		}
		this.housingCapacityCache = this.getHousingCapacityForSettlers(Array.from(this.settlers.values()))
		this.housingCapacityDirty = false
		return this.housingCapacityCache
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
			housingCapacity: this.getCachedHousingCapacity()
		}
	}

	private flushStatsRefresh(): void {
		this.stats = this.calculateStatsFromSettlers()
		EventBus.emit(UiEvents.Population.StatsUpdated, this.stats)
	}

	private scheduleStatsRefresh(immediate: boolean = false): void {
		if (immediate) {
			if (this.statsRefreshTimer) {
				clearTimeout(this.statsRefreshTimer)
				this.statsRefreshTimer = null
			}
			this.flushStatsRefresh()
			return
		}
		if (this.statsRefreshTimer) {
			return
		}
		this.statsRefreshTimer = setTimeout(() => {
			this.statsRefreshTimer = null
			this.flushStatsRefresh()
		}, this.STATS_REFRESH_INTERVAL_MS)
	}

	private applySettlerPatch(settlerId: string, patch: SettlerPatch): Settler | null {
		const current = this.settlers.get(settlerId)
		if (!current) {
			return null
		}

		const updated: Settler = {
			...current,
			position: patch.position ? { ...patch.position } : current.position
		}

		if (patch.state !== undefined) {
			updated.state = patch.state
		}
		if (patch.profession !== undefined) {
			updated.profession = patch.profession
		}
		if (patch.health !== undefined) {
			updated.health = patch.health
		}
		if (patch.needs !== undefined) {
			updated.needs = {
				hunger: patch.needs.hunger,
				fatigue: patch.needs.fatigue
			}
		}
		if (patch.stateContext !== undefined) {
			updated.stateContext = {
				...current.stateContext,
				...patch.stateContext
			}
		}
		if ('buildingId' in patch) {
			updated.buildingId = patch.buildingId
		}
		if ('houseId' in patch) {
			updated.houseId = patch.houseId
		}

		this.settlers.set(settlerId, updated)
		return updated
	}

	private doesPatchAffectStats(patch: SettlerPatch): boolean {
		return patch.state !== undefined || patch.profession !== undefined
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
