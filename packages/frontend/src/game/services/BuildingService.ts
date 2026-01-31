import { EventBus } from '../EventBus'
import { Event, BuildingInstance, BuildingDefinition } from '@rugged/game'

class BuildingServiceClass {
	private buildingInstances = new Map<string, BuildingInstance>()
	private buildingDefinitions = new Map<string, BuildingDefinition>()

	constructor() {
		// Listen for building catalog
		EventBus.on(Event.Buildings.SC.Catalog, (data: { buildings: BuildingDefinition[] }) => {
			if (data.buildings) {
				this.buildingDefinitions.clear()
				data.buildings.forEach(def => {
					this.buildingDefinitions.set(def.id, def)
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
				EventBus.emit('ui:building:updated', {
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
				EventBus.emit('ui:building:updated', {
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
				EventBus.emit('ui:building:updated', {
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

		// Listen for building clicks
		EventBus.on('ui:building:click', (data: { buildingInstanceId?: string, buildingId?: string }) => {
			if (data.buildingInstanceId) {
				const instance = this.buildingInstances.get(data.buildingInstanceId)
				const definition = instance ? this.buildingDefinitions.get(instance.buildingId) : null
				
				if (instance && definition) {
					EventBus.emit('ui:building:select', {
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

	public getAllBuildingDefinitions(): BuildingDefinition[] {
		return Array.from(this.buildingDefinitions.values())
	}

	public setProductionPaused(buildingInstanceId: string, paused: boolean): void {
		EventBus.emit(Event.Buildings.CS.SetProductionPaused, {
			buildingInstanceId,
			paused
		})
	}
}

export const buildingService = new BuildingServiceClass()
