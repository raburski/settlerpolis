import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.Wheat,
	name: 'Wheat',
	emoji: '🌾',
	description: 'A crop growing in the fields',
	category: ItemCategory.Placeable,
	stackable: true,
	maxStackSize: 50,
	spoilage: {
		shelfLifeDays: 20,
		baseRatePerDay: 0.05,
		lossMinPct: 0.05,
		lossMaxPct: 0.25
	},
	placement: {
		size: {
			width: 1,
			height: 1
		},
		blocksMovement: false,
		blocksPlacement: true
	}
} as ItemMetadata
