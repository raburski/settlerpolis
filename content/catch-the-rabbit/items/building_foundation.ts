import { ItemMetadata, ItemCategory } from '@rugged/game'

export default {
	id: 'building_foundation',
	name: 'Building Foundation',
	emoji: '🏗️',
	description: 'A building foundation placeholder',
	category: ItemCategory.Placeable,
	stackable: false,
	placement: {
		size: {
			width: 1,
			height: 1
		},
		blocksMovement: true,
		blocksPlacement: true
	}
} as ItemMetadata

