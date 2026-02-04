import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.Coal,
	name: 'Coal',
	emoji: '⚫️',
	description: 'Fuel for smelting and industry',
	category: ItemCategory.Material,
	stackable: true,
	maxStackSize: 8
} as ItemMetadata
