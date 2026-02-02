import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.Grain,
	name: 'Grain',
	emoji: '🌾',
	description: 'Harvested grain ready for milling',
	category: ItemCategory.Material,
	stackable: true,
	maxStackSize: 50,
	spoilage: {
		shelfLifeDays: 30,
		baseRatePerDay: 0.04,
		lossMinPct: 0.05,
		lossMaxPct: 0.2
	}
} as ItemMetadata
