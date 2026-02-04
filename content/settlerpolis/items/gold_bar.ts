import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.GoldBar,
	name: 'Gold Bar',
	emoji: '🪙',
	description: 'Refined gold ready for trade',
	category: ItemCategory.Material,
	stackable: true,
	maxStackSize: 8
} as ItemMetadata
