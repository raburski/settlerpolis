import type { BuildingManager } from '../../../Buildings'
import { ConstructionStage } from '../../../Buildings/types'
import type { PopulationManager } from '../../../Population'
import type { Position } from '../../../types'
import { calculateDistance } from '../../../utils'

export interface BedLocation {
	buildingInstanceId: string
	position: Position
}

export interface BedPolicyDeps {
	buildings: BuildingManager
	population: PopulationManager
}

export class BedPolicy {
	constructor(private managers: BedPolicyDeps) {}

	findBed(settlerId: string): BedLocation | null {
		const settler = this.managers.population.getSettler(settlerId)
		if (!settler) {
			return null
		}

		if (!settler.houseId) {
			return this.findInnBed(settlerId)
		}

		const house = this.managers.buildings.getBuildingInstance(settler.houseId)
		if (!house) {
			return this.findInnBed(settlerId)
		}

		return { buildingInstanceId: house.id, position: house.position }
	}

	private findInnBed(settlerId: string): BedLocation | null {
		const settler = this.managers.population.getSettler(settlerId)
		if (!settler) {
			return null
		}

		const candidates = this.managers.buildings.getAllBuildings()
			.filter(building => building.mapId === settler.mapId && building.stage === ConstructionStage.Completed)
			.map(building => {
				const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
				if (typeof definition?.amenityNeeds?.fatigue !== 'number') {
					return null
				}
				if (!definition.amenitySlots || definition.amenitySlots.count <= 0) {
					return null
				}
				return {
					buildingInstanceId: building.id,
					position: building.position,
					distance: calculateDistance(settler.position, building.position)
				}
			})
			.filter(Boolean) as Array<{ buildingInstanceId: string, position: Position, distance: number }>

		if (candidates.length === 0) {
			return null
		}

		candidates.sort((a, b) => a.distance - b.distance)
		const best = candidates[0]
		return { buildingInstanceId: best.buildingInstanceId, position: best.position }
	}
}
