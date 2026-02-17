import { getProductionRecipes } from './work'
import type {
	BuildingDefinition,
	BuildingId,
	BuildingInstance,
	ProductionPlan,
	ProductionStatus
} from './types'
import type { BuildingsSnapshot, BuildingInstanceSnapshot } from '../state/types'

export class BuildingManagerState {
	public buildings = new Map<string, BuildingInstance>()
	public definitions = new Map<BuildingId, BuildingDefinition>()
	public buildingToMapObject = new Map<string, string>()
	public resourceRequests: Map<string, Set<string>> = new Map()
	public assignedWorkers: Map<string, Set<string>> = new Map()
	public activeConstructionWorkers: Map<string, Set<string>> = new Map()
	public simulationTimeMs = 0
	public tickAccumulatorMs = 0
	public autoProductionState = new Map<string, { status: ProductionStatus, progressMs: number, progress: number }>()
	public unlockedFlagsByPlayerMap = new Map<string, Set<string>>()
	public globalProductionPlansByPlayer = new Map<string, Map<BuildingId, ProductionPlan>>()
	public defaultProductionPlans = new Map<BuildingId, ProductionPlan>()
	public productionCountsByBuilding = new Map<string, Map<string, number>>()

	public serialize(): BuildingsSnapshot {
		const buildings: BuildingInstanceSnapshot[] = Array.from(this.buildings.values()).map(building => ({
			...building,
			position: { ...building.position },
			workAreaCenter: building.workAreaCenter ? { ...building.workAreaCenter } : undefined,
			collectedResources: Array.from(building.collectedResources.entries())
		}))

		return {
			buildings,
			resourceRequests: Array.from(this.resourceRequests.entries()).map(([buildingId, needed]) => ([
				buildingId,
				Array.from(needed.values())
			])),
			assignedWorkers: Array.from(this.assignedWorkers.entries()).map(([buildingId, workers]) => ([
				buildingId,
				Array.from(workers.values())
			])),
			activeConstructionWorkers: Array.from(this.activeConstructionWorkers.entries()).map(([buildingId, workers]) => ([
				buildingId,
				Array.from(workers.values())
			])),
			autoProductionState: Array.from(this.autoProductionState.entries()),
			buildingToMapObject: Array.from(this.buildingToMapObject.entries()),
			productionCountsByBuilding: Array.from(this.productionCountsByBuilding.entries()).map(([buildingId, counts]) => ([
				buildingId,
				Array.from(counts.entries())
			])),
			globalProductionPlans: Array.from(this.globalProductionPlansByPlayer.entries()).map(([playerId, plans]) => ([
				playerId,
				Array.from(plans.entries())
			])),
			simulationTimeMs: this.simulationTimeMs,
			tickAccumulatorMs: this.tickAccumulatorMs
		}
	}

	public deserialize(state: BuildingsSnapshot): void {
		this.buildings.clear()
		for (const building of state.buildings) {
			const collectedResources = new Map(building.collectedResources)
			const restored: BuildingInstance = {
				...building,
				position: { ...building.position },
				workAreaCenter: building.workAreaCenter ? { ...building.workAreaCenter } : undefined,
				collectedResources
			}
			if (typeof restored.useGlobalProductionPlan !== 'boolean') {
				const definition = this.definitions.get(restored.buildingId)
				if (definition && getProductionRecipes(definition).length > 0) {
					const hasLocalPlan = restored.productionPlan && Object.keys(restored.productionPlan).length > 0
					restored.useGlobalProductionPlan = !hasLocalPlan
				}
			}
			this.buildings.set(restored.id, restored)
		}

		this.resourceRequests.clear()
		for (const [buildingId, needed] of state.resourceRequests) {
			this.resourceRequests.set(buildingId, new Set(needed))
		}

		this.assignedWorkers.clear()
		for (const [buildingId, workers] of state.assignedWorkers) {
			this.assignedWorkers.set(buildingId, new Set(workers))
		}

		this.activeConstructionWorkers.clear()
		for (const [buildingId, workers] of state.activeConstructionWorkers) {
			this.activeConstructionWorkers.set(buildingId, new Set(workers))
		}

		this.autoProductionState = new Map(state.autoProductionState)
		this.buildingToMapObject = new Map(state.buildingToMapObject)
		this.productionCountsByBuilding.clear()
		for (const [buildingId, counts] of state.productionCountsByBuilding ?? []) {
			this.productionCountsByBuilding.set(buildingId, new Map(counts))
		}
		this.globalProductionPlansByPlayer.clear()
		for (const [playerId, plans] of state.globalProductionPlans ?? []) {
			this.globalProductionPlansByPlayer.set(playerId, new Map(plans))
		}
		this.simulationTimeMs = state.simulationTimeMs
		this.tickAccumulatorMs = state.tickAccumulatorMs
	}

	public reset(): void {
		this.buildings.clear()
		this.resourceRequests.clear()
		this.assignedWorkers.clear()
		this.activeConstructionWorkers.clear()
		this.autoProductionState.clear()
		this.buildingToMapObject.clear()
		this.unlockedFlagsByPlayerMap.clear()
		this.simulationTimeMs = 0
		this.tickAccumulatorMs = 0
	}
}
