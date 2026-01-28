import { ItemMetadata, ItemCategory } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.BuildingFoundation,
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

