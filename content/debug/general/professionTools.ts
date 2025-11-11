import { ProfessionToolDefinition, ProfessionType } from '@rugged/game'

export const professionTools: ProfessionToolDefinition[] = [
	{
		itemType: 'hammer',
		targetProfession: ProfessionType.Builder,
		name: 'Hammer',
		description: 'Turns settlers into builders'
	},
	{
		itemType: 'axe',
		targetProfession: ProfessionType.Woodcutter,
		name: 'Axe',
		description: 'Turns settlers into woodcutters'
	}
]

