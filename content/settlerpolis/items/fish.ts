import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

const fishItem: ItemMetadata = {
	id: ItemType.Fish,
	name: 'Fish',
	emoji: '🐟',
	description: 'Fresh fish from the lakes.',
	category: ItemCategory.Consumable,
	stackable: true,
	maxStackSize: 20
}

export default fishItem
