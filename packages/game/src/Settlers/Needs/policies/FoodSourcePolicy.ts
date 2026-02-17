import type { BuildingManager } from '../../../Buildings'
import type { LootManager } from '../../../Loot'
import type { StorageManager } from '../../../Storage'
import type { PopulationManager } from '../../../Population'
import type { ItemsManager } from '../../../Items'
import { ItemCategory } from '../../../Items/types'
import type { Position } from '../../../types'

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

		if (!settler.houseId) {
			return null
		}

		const consumables = this.managers.items
			.getItemsByCategory(ItemCategory.Consumable)
			.map(item => item.id)

		if (consumables.length === 0) {
			return null
		}

		for (const itemType of consumables) {
			const available = this.managers.storage.getAvailableQuantity(settler.houseId, itemType)
			if (available > 0) {
				return { type: 'storage', buildingInstanceId: settler.houseId, itemType }
			}
		}

		return null
	}
}
