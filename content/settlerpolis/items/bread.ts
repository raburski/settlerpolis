import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.Bread,
	name: 'Bread',
	emoji: '🍞',
	description: 'Freshly baked bread',
	category: ItemCategory.Consumable,
	stackable: true,
	maxStackSize: 50,
	spoilage: {
		shelfLifeDays: 3,
		baseRatePerDay: 0.18,
		lossMinPct: 0.2,
		lossMaxPct: 0.6
	}
} as ItemMetadata
