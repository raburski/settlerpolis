import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.Logs,
	name: 'Logs',
	emoji: '🪵',
	description: 'Wooden logs for construction',
	category: ItemCategory.Material,
	stackable: true,
	maxStackSize: 50
} as ItemMetadata

