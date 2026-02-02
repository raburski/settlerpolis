import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.Tombstone,
	name: 'Tombstone',
	emoji: '🪦',
	description: 'A somber marker for a fallen settler',
	category: ItemCategory.Placeable,
	stackable: false
} as ItemMetadata
