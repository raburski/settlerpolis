import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

const deerItem: ItemMetadata = {
	id: ItemType.Deer,
	name: 'Deer',
	emoji: '🦌',
	description: 'A wild deer harvested from the forest.',
	category: ItemCategory.Material,
	stackable: true,
	maxStackSize: 10
}

export default deerItem
