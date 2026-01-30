import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.Water,
	name: 'Water',
	emoji: '💧',
	description: 'Clean water for production',
	category: ItemCategory.Material,
	stackable: true,
	maxStackSize: 50
} as ItemMetadata
