import { ItemMetadata, ItemCategory, ProfessionType } from '@rugged/game'
import { ItemType } from './types'

const cartItem: ItemMetadata = {
	id: ItemType.Cart,
	name: 'Cart',
	emoji: '🛒',
	description: 'A small cart that increases carrying capacity',
	category: ItemCategory.Tool,
	stackable: false,
	changesProfession: ProfessionType.Vendor
}

export default cartItem
