import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.Helmet,
	name: 'Helmet',
	emoji: '⛑️',
	description: 'Protective headgear for defense',
	category: ItemCategory.Material,
	stackable: false
} as ItemMetadata
