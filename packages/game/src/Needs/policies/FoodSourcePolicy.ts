import type { BuildingManager } from '../../Buildings'
import type { LootManager } from '../../Loot'
import type { StorageManager } from '../../Storage'
import type { PopulationManager } from '../../Population'
import type { ItemsManager } from '../../Items'
import { ItemCategory } from '../../Items/types'
import type { Position } from '../../types'
import { calculateDistance } from '../../utils'

export type FoodSource =
	| { type: 'carried', itemType: string, quantity: number }
	| { type: 'storage', buildingInstanceId: string, itemType: string }
	| { type: 'ground', itemId: string, itemType: string, position: Position }

export interface FoodSourcePolicyDeps {
	buildings: BuildingManager
	loot: LootManager
	storage: StorageManager
	population: PopulationManager
	items: ItemsManager
}

export class FoodSourcePolicy {
	constructor(private managers: FoodSourcePolicyDeps) {}

	findFoodSource(settlerId: string): FoodSource | null {
		const settler = this.managers.population.getSettler(settlerId)
		if (!settler) {
			return null
		}

		const consumables = this.managers.items
			.getItemsByCategory(ItemCategory.Consumable)
			.map(item => item.id)

		if (consumables.length === 0) {
			return null
		}

		const carriedType = settler.stateContext.carryingItemType
		const carriedQuantity = settler.stateContext.carryingQuantity || 1
		if (carriedType && consumables.includes(carriedType)) {
			return { type: 'carried', itemType: carriedType, quantity: carriedQuantity }
		}

		const storageCandidates: Array<{ buildingInstanceId: string, itemType: string, distance: number }> = []
		for (const building of this.managers.buildings.getAllBuildings()) {
			if (building.mapName !== settler.mapName) {
				continue
			}
			for (const itemType of consumables) {
				const available = this.managers.storage.getAvailableQuantity(building.id, itemType)
				if (available <= 0) {
					continue
				}
				storageCandidates.push({
					buildingInstanceId: building.id,
					itemType,
					distance: calculateDistance(settler.position, building.position)
				})
			}
		}

		if (storageCandidates.length > 0) {
			storageCandidates.sort((a, b) => a.distance - b.distance)
			const best = storageCandidates[0]
			return { type: 'storage', buildingInstanceId: best.buildingInstanceId, itemType: best.itemType }
		}

		const groundCandidates: Array<{ itemId: string, itemType: string, position: Position, distance: number }> = []
		for (const itemType of consumables) {
			const item = this.managers.loot.getAvailableItemByType(settler.mapName, itemType)
			if (!item) {
				continue
			}
			groundCandidates.push({
				itemId: item.id,
				itemType: item.itemType,
				position: item.position,
				distance: calculateDistance(settler.position, item.position)
			})
		}

		if (groundCandidates.length === 0) {
			return null
		}

		groundCandidates.sort((a, b) => a.distance - b.distance)
		const best = groundCandidates[0]
		return { type: 'ground', itemId: best.itemId, itemType: best.itemType, position: best.position }
	}
}
