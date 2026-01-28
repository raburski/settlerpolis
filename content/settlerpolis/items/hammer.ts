import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export const hammerItem: ItemMetadata = {
	id: ItemType.Hammer,
	name: 'Hammer',
	emoji: '🔨',
	description: 'A hammer that turns settlers into builders',
	category: ItemCategory.Tool,
	stackable: false,
	changesProfession: 'builder'
}

