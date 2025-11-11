import { StartingItem } from '@rugged/game'
import { ItemType } from './items'

export const startingItems: StartingItem[] = [
	{
		itemType: ItemType.Hammer,
		offset: {
			x: 2, // 2 tiles to the right
			y: 0,
			tileBased: true
		}
	},
	{
		itemType: ItemType.Axe,
		offset: {
			x: 0,
			y: 2, // 2 tiles below
			tileBased: true
		}
	}
]

