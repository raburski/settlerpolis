import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.Flour,
	name: 'Flour',
	emoji: '🥣',
	description: 'Milled flour for baking',
	category: ItemCategory.Material,
	stackable: true,
	maxStackSize: 50
} as ItemMetadata
