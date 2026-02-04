import { EventBus } from '../EventBus'
import { Event, BuildingInstance, BuildingDefinition } from '@rugged/game'
import type { ProductionPlan } from '@rugged/game'
import { UiEvents } from '../uiEvents'

class BuildingServiceClass {
	private buildingInstances = new Map<string, BuildingInstance>()
	private buildingDefinitions = new Map<string, BuildingDefinition>()
	private globalProductionPlans = new Map<string, ProductionPlan>()

	constructor() {
		// Listen for building catalog
		EventBus.on(Event.Buildings.SC.Catalog, (data: { buildings: BuildingDefinition[], globalProductionPlans?: Record<string, ProductionPlan> }) => {
			if (data.buildings) {
				this.buildingDefinitions.clear()
				data.buildings.forEach(def => {
					this.buildingDefinitions.set(def.id, def)
				})
			}
			this.globalProductionPlans.clear()
			if (data.globalProductionPlans) {
				Object.entries(data.globalProductionPlans).forEach(([buildingId, plan]) => {
					this.globalProductionPlans.set(buildingId, plan)
				})
			}
		})

		// Listen for building placed - initialize collectedResources as empty object if not provided
		EventBus.on(Event.Buildings.SC.Placed, (data: { building: BuildingInstance }) => {
			const building = {
				...data.building,
				collectedResources: (data.building.collectedResources as Record<string, number>) || {}
			}
			this.buildingInstances.set(building.id, building as BuildingInstance)
		})

		// Listen for building progress
		EventBus.on(Event.Buildings.SC.Progress, (data: { buildingInstanceId: string, progress: number, stage: string }) => {
			const building = this.buildingInstances.get(data.buildingInstanceId)
			if (building) {
				// Create a new object with updated progress (immutability for React)
				const updatedBuilding = {
					...building,
					progress: data.progress,
					stage: data.stage as any
				}
				this.buildingInstances.set(data.buildingInstanceId, updatedBuilding)
				
				// Emit UI event to notify components that building was updated
				EventBus.emit(UiEvents.Building.Updated, {
					buildingInstanceId: data.buildingInstanceId,
					building: updatedBuilding
				})
			}
		})

		// Listen for resources changed - update collected resources
		EventBus.on(Event.Buildings.SC.ResourcesChanged, (data: { buildingInstanceId: string, itemType: string, quantity: number, requiredQuantity: number }) => {
			const building = this.buildingInstances.get(data.buildingInstanceId)
			if (building) {
				// Create a new object with updated collected resources (immutability for React)
				const collectedResources = { ...((building.collectedResources as Record<string, number>) || {}) }
				collectedResources[data.itemType] = data.quantity
				const updatedBuilding = {
					...building,
					collectedResources
				}
				this.buildingInstances.set(data.buildingInstanceId, updatedBuilding)
				
				// Emit UI event to notify components that building was updated
				EventBus.emit(UiEvents.Building.Updated, {
					buildingInstanceId: data.buildingInstanceId,
					building: updatedBuilding
				})
			}
		})

		// Listen for stage changed
		EventBus.on(Event.Buildings.SC.StageChanged, (data: { buildingInstanceId: string, stage: string }) => {
			const building = this.buildingInstances.get(data.buildingInstanceId)
			if (building) {
				// Create a new object with updated stage (immutability for React)
				const updatedBuilding = {
					...building,
					stage: data.stage as any
				}
				this.buildingInstances.set(data.buildingInstanceId, updatedBuilding)
				
				// Emit UI event to notify components that building was updated
				EventBus.emit(UiEvents.Building.Updated, {
					buildingInstanceId: data.buildingInstanceId,
					building: updatedBuilding
				})
			}
		})

		// Listen for building completed - ensure collectedResources is a Record
		EventBus.on(Event.Buildings.SC.Completed, (data: { building: BuildingInstance }) => {
			const building = {
				...data.building,
				collectedResources: (data.building.collectedResources as Record<string, number>) || {}
			}
			this.buildingInstances.set(building.id, building as BuildingInstance)
		})

		// Listen for building cancelled
		EventBus.on(Event.Buildings.SC.Cancelled, (data: { buildingInstanceId: string }) => {
			this.buildingInstances.delete(data.buildingInstanceId)
		})

		// Listen for work area updates
		EventBus.on(Event.Buildings.SC.WorkAreaUpdated, (data: { buildingInstanceId: string, center: { x: number, y: number } }) => {
			const building = this.buildingInstances.get(data.buildingInstanceId)
			if (building) {
				const updatedBuilding = {
					...building,
					workAreaCenter: { x: data.center.x, y: data.center.y }
				}
				this.buildingInstances.set(data.buildingInstanceId, updatedBuilding)
				EventBus.emit(UiEvents.Building.Updated, {
					buildingInstanceId: data.buildingInstanceId,
					building: updatedBuilding
				})
			}
		})

		// Listen for storage request updates
		EventBus.on(Event.Buildings.SC.StorageRequestsUpdated, (data: { buildingInstanceId: string, itemTypes: string[] }) => {
			const building = this.buildingInstances.get(data.buildingInstanceId)
			if (building) {
				const updatedBuilding = {
					...building,
					storageRequests: data.itemTypes
				}
				this.buildingInstances.set(data.buildingInstanceId, updatedBuilding)
				EventBus.emit(UiEvents.Building.Updated, {
					buildingInstanceId: data.buildingInstanceId,
					building: updatedBuilding
				})
			}
		})

		// Listen for worker queue updates
		EventBus.on(Event.Buildings.SC.WorkerQueueUpdated, (data: { buildingInstanceId: string, queuedCount: number }) => {
			const building = this.buildingInstances.get(data.buildingInstanceId)
			if (building) {
				const updatedBuilding = {
					...building,
					pendingWorkers: data.queuedCount
				}
				this.buildingInstances.set(data.buildingInstanceId, updatedBuilding)
				EventBus.emit(UiEvents.Building.Updated, {
					buildingInstanceId: data.buildingInstanceId,
					building: updatedBuilding
				})
			}
		})

		EventBus.on(Event.Buildings.SC.ProductionPlanUpdated, (data: { buildingInstanceId: string, plan?: ProductionPlan, useGlobal: boolean }) => {
			const building = this.buildingInstances.get(data.buildingInstanceId)
			if (building) {
				const updatedBuilding = {
					...building,
					productionPlan: data.plan,
					useGlobalProductionPlan: data.useGlobal
				}
				this.buildingInstances.set(data.buildingInstanceId, updatedBuilding)
				EventBus.emit(UiEvents.Building.Updated, {
					buildingInstanceId: data.buildingInstanceId,
					building: updatedBuilding
				})
			}
		})

		EventBus.on(Event.Buildings.SC.GlobalProductionPlanUpdated, (data: { buildingId: string, plan: ProductionPlan }) => {
			this.globalProductionPlans.set(data.buildingId, data.plan)
			for (const instance of this.buildingInstances.values()) {
				if (instance.buildingId !== data.buildingId) {
					continue
				}
				const updatedBuilding = { ...instance }
				this.buildingInstances.set(instance.id, updatedBuilding)
				EventBus.emit(UiEvents.Building.Updated, {
					buildingInstanceId: instance.id,
					building: updatedBuilding
				})
			}
		})

		// Listen for building clicks
		EventBus.on(UiEvents.Building.Click, (data: { buildingInstanceId?: string, buildingId?: string }) => {
			if (data.buildingInstanceId) {
				const instance = this.buildingInstances.get(data.buildingInstanceId)
				const definition = instance ? this.buildingDefinitions.get(instance.buildingId) : null
				
				if (instance && definition) {
					EventBus.emit(UiEvents.Building.Select, {
						buildingInstance: instance,
						buildingDefinition: definition
					})
				}
			}
		})
	}

	public getBuildingInstance(buildingInstanceId: string): BuildingInstance | undefined {
		return this.buildingInstances.get(buildingInstanceId)
	}

	public getBuildingDefinition(buildingId: string): BuildingDefinition | undefined {
		return this.buildingDefinitions.get(buildingId)
	}

	public getAllBuildingInstances(): BuildingInstance[] {
		return Array.from(this.buildingInstances.values())
	}

	public getAllBuildingDefinitions(): BuildingDefinition[] {
		return Array.from(this.buildingDefinitions.values())
	}

	public getGlobalProductionPlan(buildingId: string): ProductionPlan | undefined {
		return this.globalProductionPlans.get(buildingId)
	}

	public setProductionPaused(buildingInstanceId: string, paused: boolean): void {
		EventBus.emit(Event.Buildings.CS.SetProductionPaused, {
			buildingInstanceId,
			paused
		})
	}

	public setProductionPlan(buildingInstanceId: string, plan?: ProductionPlan, useGlobal?: boolean): void {
		EventBus.emit(Event.Buildings.CS.SetProductionPlan, {
			buildingInstanceId,
			plan,
			useGlobal
		})
	}

	public setGlobalProductionPlan(buildingId: string, plan: ProductionPlan): void {
		EventBus.emit(Event.Buildings.CS.SetGlobalProductionPlan, {
			buildingId,
			plan
		})
	}

	public setStorageRequests(buildingInstanceId: string, itemTypes: string[]): void {
		EventBus.emit(Event.Buildings.CS.SetStorageRequests, {
			buildingInstanceId,
			itemTypes
		})
	}
}

export const buildingService = new BuildingServiceClass()
