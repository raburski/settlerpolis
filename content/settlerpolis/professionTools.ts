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
	}
]

