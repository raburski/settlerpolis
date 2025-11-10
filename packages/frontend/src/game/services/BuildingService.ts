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

		// Listen for building placed
		EventBus.on(Event.Buildings.SC.Placed, (data: { building: BuildingInstance }) => {
			this.buildingInstances.set(data.building.id, data.building)
		})

		// Listen for building progress
		EventBus.on(Event.Buildings.SC.Progress, (data: { buildingInstanceId: string, progress: number, stage: string }) => {
			const building = this.buildingInstances.get(data.buildingInstanceId)
			if (building) {
				building.progress = data.progress
				building.stage = data.stage as any
				this.buildingInstances.set(data.buildingInstanceId, building)
			}
		})

		// Listen for building completed
		EventBus.on(Event.Buildings.SC.Completed, (data: { building: BuildingInstance }) => {
			this.buildingInstances.set(data.building.id, data.building)
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
}

export const buildingService = new BuildingServiceClass()

