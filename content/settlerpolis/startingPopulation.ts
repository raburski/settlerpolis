import { StartingPopulation } from '@rugged/game'
import { ProfessionType } from '@rugged/game'

export const startingPopulation: StartingPopulation[] = [
	{
		profession: ProfessionType.Builder,
		count: 1
	},
	{
		profession: ProfessionType.Carrier,
		count: 6
	}
]
