import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.Flour,
	name: 'Flour',
	emoji: '🥣',
	description: 'Milled flour for baking',
	category: ItemCategory.Material,
	stackable: true,
	maxStackSize: 50,
	spoilage: {
		shelfLifeDays: 14,
		baseRatePerDay: 0.08,
		lossMinPct: 0.1,
		lossMaxPct: 0.3
	}
} as ItemMetadata
