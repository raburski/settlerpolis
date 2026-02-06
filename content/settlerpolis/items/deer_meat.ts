import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

const deerMeatItem: ItemMetadata = {
	id: ItemType.DeerMeat,
	name: 'Deer Meat',
	emoji: '🥩',
	description: 'Fresh venison from a successful hunt.',
	category: ItemCategory.Consumable,
	stackable: true,
	maxStackSize: 20
}

export default deerMeatItem
