import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.Grain,
	name: 'Grain',
	emoji: '🌾',
	description: 'Harvested grain ready for milling',
	category: ItemCategory.Material,
	stackable: true,
	maxStackSize: 50
} as ItemMetadata
