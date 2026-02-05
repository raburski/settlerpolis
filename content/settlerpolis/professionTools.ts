import { ProfessionToolDefinition, ProfessionType } from '@rugged/game'
import { ItemType } from './items'

export const professionTools: ProfessionToolDefinition[] = [
	{
		itemType: ItemType.Hammer,
		targetProfession: ProfessionType.Builder,
		name: 'Hammer',
		description: 'Turns settlers into builders'
	},
	{
		itemType: ItemType.Axe,
		targetProfession: ProfessionType.Woodcutter,
		name: 'Axe',
		description: 'Turns settlers into woodcutters'
	},
	{
		itemType: ItemType.FishingRod,
		targetProfession: ProfessionType.Fisher,
		name: 'Fishing Rod',
		description: 'Turns settlers into fishers'
	},
	{
		itemType: ItemType.Crossbow,
		targetProfession: ProfessionType.Hunter,
		name: 'Crossbow',
		description: 'Turns settlers into hunters'
	}
]
