import { ItemMetadata, ItemCategory, ProfessionType } from '@rugged/game'
import { ItemType } from './types'

const fishingRodItem: ItemMetadata = {
	id: ItemType.FishingRod,
	name: 'Fishing Rod',
	emoji: '🎣',
	description: 'A rod that turns settlers into fishers',
	category: ItemCategory.Tool,
	stackable: false,
	changesProfession: ProfessionType.Fisher
}

export default fishingRodItem
