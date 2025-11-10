import { ItemMetadata, ItemCategory } from '@rugged/game'

export default {
	id: 'stone',
	name: 'Stone',
	emoji: '🪨',
	description: 'Stone blocks for construction',
	category: ItemCategory.Material,
	stackable: true,
	maxStackSize: 50
} as ItemMetadata

