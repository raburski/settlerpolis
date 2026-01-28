import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.Pickaxe,
	name: 'Pickaxe',
	emoji: '⛏️',
	description: 'A sturdy pickaxe for mining',
	category: ItemCategory.Tool,
	stackable: false,
	changesProfession: 'miner'
} as ItemMetadata
