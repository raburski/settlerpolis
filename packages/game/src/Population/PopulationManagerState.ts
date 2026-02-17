import type { ItemType } from '../Items/types'
import type { PopulationSnapshot } from '../state/types'
import type { ProfessionDefinition, ProfessionType, Settler } from './types'

export class PopulationManagerState {
	public settlers = new Map<string, Settler>()
	public houseOccupants = new Map<string, Set<string>>()
	public professionTools = new Map<ProfessionType, ItemType>()
	public professions = new Map<ProfessionType, ProfessionDefinition>()
	public startingPopulation: Array<{ profession: ProfessionType, count: number }> = []
	public houseSpawnSchedule = new Map<string, { nextSpawnAtMs: number, rateMs: number }>()
	public simulationTimeMs = 0

	public serialize(): PopulationSnapshot {
		return {
			settlers: Array.from(this.settlers.values()).map(settler => ({
				...settler,
				position: { ...settler.position },
				stateContext: { ...settler.stateContext },
				needs: settler.needs ? { ...settler.needs } : undefined
			})),
			houseOccupants: Array.from(this.houseOccupants.entries()).map(([houseId, occupants]) => ([
				houseId,
				Array.from(occupants.values())
			])),
			houseSpawnSchedule: Array.from(this.houseSpawnSchedule.entries()),
			simulationTimeMs: this.simulationTimeMs
		}
	}

	public deserialize(state: PopulationSnapshot): Settler[] {
		this.settlers.clear()
		this.houseOccupants.clear()
		this.houseSpawnSchedule.clear()
		this.simulationTimeMs = state.simulationTimeMs

		const restoredSettlers: Settler[] = []
		for (const settler of state.settlers) {
			const restored: Settler = {
				...settler,
				position: { ...settler.position },
				stateContext: { ...settler.stateContext },
				needs: settler.needs ? { ...settler.needs } : undefined,
				health: typeof settler.health === 'number'
					? Math.max(0, Math.min(1, settler.health))
					: 1
			}
			this.settlers.set(restored.id, restored)
			restoredSettlers.push(restored)
		}

		for (const [houseId, occupants] of state.houseOccupants) {
			this.houseOccupants.set(houseId, new Set(occupants))
		}

		for (const [houseId, schedule] of state.houseSpawnSchedule) {
			this.houseSpawnSchedule.set(houseId, { ...schedule })
		}

		return restoredSettlers
	}

	public reset(): void {
		this.settlers.clear()
		this.houseOccupants.clear()
		this.houseSpawnSchedule.clear()
		this.simulationTimeMs = 0
	}
}
