import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export const axeItem: ItemMetadata = {
	id: ItemType.Axe,
	name: 'Axe',
	emoji: '🪓',
	description: 'An axe that turns settlers into woodcutters',
	category: ItemCategory.Tool,
	stackable: false,
	changesProfession: 'woodcutter'
}

