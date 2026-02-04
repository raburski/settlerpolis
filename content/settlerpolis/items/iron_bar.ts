import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.IronBar,
	name: 'Iron Bar',
	emoji: '🔩',
	description: 'Refined iron ready for construction',
	category: ItemCategory.Material,
	stackable: true,
	maxStackSize: 8
} as ItemMetadata
