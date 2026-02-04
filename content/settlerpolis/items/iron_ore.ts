import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.IronOre,
	name: 'Iron Ore',
	emoji: '⛓️',
	description: 'Ore ready for smelting into iron bars',
	category: ItemCategory.Material,
	stackable: true,
	maxStackSize: 8
} as ItemMetadata
