import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.Tree,
	name: 'Tree',
	emoji: '🌲',
	description: 'A mature tree ready for harvesting',
	category: ItemCategory.Material,
	stackable: false
} as ItemMetadata
