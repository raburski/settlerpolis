import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.Spear,
	name: 'Spear',
	emoji: '🗡️',
	description: 'A crafted weapon for defense',
	category: ItemCategory.Material,
	stackable: false
} as ItemMetadata
