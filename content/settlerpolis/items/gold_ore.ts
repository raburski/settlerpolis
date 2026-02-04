import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.GoldOre,
	name: 'Gold Ore',
	emoji: '🟡',
	description: 'Ore ready for smelting into gold bars',
	category: ItemCategory.Material,
	stackable: true,
	maxStackSize: 8
} as ItemMetadata
