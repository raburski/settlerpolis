import type { BuildingManager } from '../../Buildings'
import type { PopulationManager } from '../../Population'
import type { Position } from '../../types'

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
			return null
		}

		const house = this.managers.buildings.getBuildingInstance(settler.houseId)
		if (!house) {
			return null
		}

		return { buildingInstanceId: house.id, position: house.position }
	}
}
