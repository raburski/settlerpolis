import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.Crossbow,
	name: 'Crossbow',
	emoji: '🏹',
	description: 'A ranged weapon for defense',
	category: ItemCategory.Material,
	stackable: false
} as ItemMetadata
