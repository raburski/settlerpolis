import { ItemMetadata, ItemCategory } from '@rugged/game'

export const items: ItemMetadata[] = [
    {
		id: 'mozgotrzep',
		name: 'Mózgotrzep',
		emoji: '🍺',
		description: 'A mysterious beverage that makes your brain tingle. The innkeeper\'s specialty.',
		category: ItemCategory.Consumable,
		stackable: true,
		maxStackSize: 5,
	},
	{
		id: 'chainfolk_rug',
		name: 'Chainfolk Rug',
		emoji: '🧶',
		description: 'A beautifully woven rug with intricate chain patterns. A prized possession among the Chainfolk.',
		category: ItemCategory.Placeable,
		stackable: false,
		placement: {
			size: {
				width: 2,
				height: 3
			},
			blocksMovement: false,
			blocksPlacement: false
		}
	},
	{
		id: 'mysterious_stone',
		name: 'Mysterious Stone',
		emoji: '💎',
		description: 'A peculiar stone that seems to pulse with an inner light. It feels warm to the touch.',
		category: ItemCategory.Material,
		stackable: true,
		maxStackSize: 3
	}
]