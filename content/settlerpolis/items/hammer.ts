import { ItemMetadata, ItemCategory, ProfessionType } from '@rugged/game'
import { ItemType } from './types'

export const hammerItem: ItemMetadata = {
	id: ItemType.Hammer,
	name: 'Hammer',
	emoji: '🔨',
	description: 'A hammer used by builders and metallurgists',
	category: ItemCategory.Tool,
	stackable: false,
	changesProfessions: [ProfessionType.Builder, ProfessionType.Metallurgist]
}
