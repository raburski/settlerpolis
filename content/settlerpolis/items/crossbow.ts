import { ItemMetadata, ItemCategory, ProfessionType } from '@rugged/game'
import { ItemType } from './types'

export default {
	id: ItemType.Crossbow,
	name: 'Crossbow',
	emoji: '🏹',
	description: 'A ranged weapon for defense',
	category: ItemCategory.Tool,
	stackable: false,
	changesProfession: ProfessionType.Hunter
} as ItemMetadata
