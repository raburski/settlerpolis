import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.GoldCoin,
	name: 'Gold Coin',
	emoji: '🪙',
	description: 'Minted currency for trade',
	category: ItemCategory.Material,
	stackable: true,
	maxStackSize: 20
} as ItemMetadata
