import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.Planks,
	name: 'Planks',
	emoji: '🪵',
	description: 'Wooden planks for construction',
	category: ItemCategory.Material,
	stackable: true,
	maxStackSize: 50
} as ItemMetadata

