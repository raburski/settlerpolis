import { ItemMetadata, ItemCategory } from '@rugged/game'

export enum ItemType {
	Mozgotrzep = 'mozgotrzep',
	ChainfolkRug = 'chainfolk_rug',
	MysteriousStone = 'mysterious_stone',
	BuildingFoundation = 'building_foundation',
	Logs = 'logs',
	Stone = 'stone',
	Hammer = 'hammer',
	Axe = 'axe'
}

export const items: ItemMetadata[] = [
	{
		id: ItemType.Mozgotrzep,
		name: 'Mózgotrzep',
		emoji: '🍺',
		description: 'A mysterious beverage that makes your brain tingle. The innkeeper\'s specialty.',
		category: ItemCategory.Consumable,
		stackable: true,
		maxStackSize: 5,
	},
	{
		id: ItemType.ChainfolkRug,
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
		id: ItemType.MysteriousStone,
		name: 'Mysterious Stone',
		emoji: '💎',
		description: 'A peculiar stone that seems to pulse with an inner light. It feels warm to the touch.',
		category: ItemCategory.Material,
		stackable: true,
		maxStackSize: 3
	},
	{
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
	},
	{
		id: ItemType.Logs,
		name: 'Logs',
		emoji: '🪵',
		description: 'Wooden logs for construction',
		category: ItemCategory.Material,
		stackable: true,
		maxStackSize: 50
	},
	{
		id: ItemType.Stone,
		name: 'Stone',
		emoji: '🪨',
		description: 'Stone blocks for construction',
		category: ItemCategory.Material,
		stackable: true,
		maxStackSize: 50
	},
	{
		id: ItemType.Hammer,
		name: 'Hammer',
		emoji: '🔨',
		description: 'A hammer that turns settlers into builders',
		category: ItemCategory.Tool,
		stackable: false,
		changesProfession: 'builder'
	},
	{
		id: ItemType.Axe,
		name: 'Axe',
		emoji: '🪓',
		description: 'An axe that turns settlers into woodcutters',
		category: ItemCategory.Tool,
		stackable: false,
		changesProfession: 'woodcutter'
	}
]