import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.Bread,
	name: 'Bread',
	emoji: '🍞',
	description: 'Freshly baked bread',
	category: ItemCategory.Consumable,
	stackable: true,
	maxStackSize: 50
} as ItemMetadata
