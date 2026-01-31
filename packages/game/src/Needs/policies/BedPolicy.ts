import type { BuildingManager } from '../../Buildings'
import type { PopulationManager } from '../../Population'
import type { Position } from '../../types'
import { calculateDistance } from '../../utils'

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

		if (settler.houseId) {
			const house = this.managers.buildings.getBuildingInstance(settler.houseId)
			if (house) {
				return { buildingInstanceId: house.id, position: house.position }
			}
		}

		const candidates: Array<{ buildingInstanceId: string, position: Position, distance: number }> = []
		for (const building of this.managers.buildings.getAllBuildings()) {
			if (building.mapName !== settler.mapName) {
				continue
			}
			const def = this.managers.buildings.getBuildingDefinition(building.buildingId)
			if (!def?.spawnsSettlers) {
				continue
			}
			candidates.push({
				buildingInstanceId: building.id,
				position: building.position,
				distance: calculateDistance(settler.position, building.position)
			})
		}

		if (candidates.length === 0) {
			return null
		}

		candidates.sort((a, b) => a.distance - b.distance)
		const best = candidates[0]
		return { buildingInstanceId: best.buildingInstanceId, position: best.position }
	}
}
