import { BuildingDefinition, ProfessionType } from '@rugged/game'
import { ItemType } from './items'

export const buildings: BuildingDefinition[] = [
	{
		id: 'storehouse',
		name: 'Storehouse',
		description: 'A storage building for resources',
		category: 'storage',
		icon: '📦',
		sprite: {
			foundation: 'building_foundation',
			completed: 'storehouse'
		},
		footprint: {
			width: 3,
			height: 3
		},
		constructionTime: 15, // 15 seconds
		costs: [
			{
				itemType: ItemType.Logs,
				quantity: 1
			},
			{
				itemType: ItemType.Stone,
				quantity: 2
			}
		],
		isWarehouse: true,
		workerSlots: 2, // Storehouse can have 2 workers managing inventory
		// Phase C: Storage capacity
		storage: {
			capacities: {
				[ItemType.Logs]: 50,
				[ItemType.Stone]: 50,
				[ItemType.Planks]: 50
			}
		}
	},
	{
		id: 'house',
		name: 'House',
		description: 'A simple house that spawns settlers',
		category: 'residential',
		icon: '🏠',
		sprite: {
			foundation: 'building_foundation',
			completed: 'house'
		},
		footprint: {
			width: 2,
			height: 2
		},
		constructionTime: 20, // 20 seconds
		costs: [
			{
				itemType: ItemType.Logs,
				quantity: 2
			},
			{
				itemType: ItemType.Stone,
				quantity: 1
			}
		],
		spawnsSettlers: true,
		maxOccupants: 5,
		spawnRate: 30 // Spawn a settler every 30 seconds
	},
	{
		id: 'woodcutter_hut',
		name: 'Woodcutter Hut',
		description: 'A simple hut where woodcutters gather logs',
		category: 'production',
		icon: '🪵',
		sprite: {
			foundation: 'building_foundation',
			completed: 'woodcutter_hut'
		},
		footprint: {
			width: 2,
			height: 2
		},
		constructionTime: 10, // 10 seconds for Phase A testing
		costs: [
			{
				itemType: ItemType.Logs,
				quantity: 1
			},
			{
				itemType: ItemType.Stone,
				quantity: 1
			}
		],
		harvest: {
			nodeType: 'tree'
		},
		requiredProfession: 'woodcutter',
		workerSlots: 1, // Woodcutter hut can have 1 worker
		storage: {
			capacities: {
				[ItemType.Logs]: 10 // Can store up to 10 logs (output)
			}
		}
	},
	{
		id: 'quarry',
		name: 'Quarry',
		description: 'Extracts stone from deposits',
		category: 'production',
		icon: '⛏️',
		sprite: {
			foundation: 'building_foundation',
			completed: 'woodcutter_hut'
		},
		footprint: {
			width: 2,
			height: 2
		},
		constructionTime: 12, // 12 seconds
		costs: [
			{
				itemType: ItemType.Logs,
				quantity: 1
			},
			{
				itemType: ItemType.Stone,
				quantity: 1
			}
		],
		harvest: {
			nodeType: 'stone_deposit'
		},
		requiredProfession: ProfessionType.Miner,
		workerSlots: 1,
		storage: {
			capacities: {
				[ItemType.Stone]: 10 // Can store up to 10 stone (output)
			}
		}
	},
	{
		id: 'sawmill',
		name: 'Sawmill',
		description: 'Converts logs into planks',
		category: 'production',
		icon: '🏭',
		sprite: {
			foundation: 'building_foundation',
			completed: 'sawmill'
		},
		footprint: {
			width: 3,
			height: 3
		},
		constructionTime: 20, // 20 seconds
		costs: [
			{
				itemType: ItemType.Logs,
				quantity: 2
			},
			{
				itemType: ItemType.Stone,
				quantity: 2
			}
		],
		requiredProfession: ProfessionType.Woodcutter,
		workerSlots: 1,
		// Phase C: Production recipe and storage
		productionRecipe: {
			inputs: [
				{ itemType: ItemType.Logs, quantity: 2 }
			],
			outputs: [
				{ itemType: ItemType.Planks, quantity: 1 }
			],
			productionTime: 10 // 10 seconds to produce 1 plank from 2 logs
		},
		storage: {
			capacities: {
				[ItemType.Logs]: 20, // Can store up to 20 logs (input)
				[ItemType.Planks]: 10 // Can store up to 10 planks (output)
			}
		}
	},
	{
		id: 'well',
		name: 'Well',
		description: 'Draws clean water for the settlement',
		category: 'production',
		icon: '🪣',
		sprite: {
			foundation: 'building_foundation',
			completed: 'storehouse'
		},
		footprint: {
			width: 2,
			height: 2
		},
		constructionTime: 10,
		costs: [
			{
				itemType: ItemType.Logs,
				quantity: 1
			},
			{
				itemType: ItemType.Stone,
				quantity: 2
			}
		],
		autoProduction: {
			inputs: [],
			outputs: [
				{ itemType: ItemType.Water, quantity: 1 }
			],
			productionTime: 5
		},
		storage: {
			capacities: {
				[ItemType.Water]: 50
			}
		}
	},
	{
		id: 'windmill',
		name: 'Windmill',
		description: 'Turns grain into flour',
		category: 'production',
		icon: '🌬️',
		sprite: {
			foundation: 'building_foundation',
			completed: 'sawmill'
		},
		footprint: {
			width: 3,
			height: 3
		},
		constructionTime: 20,
		costs: [
			{
				itemType: ItemType.Logs,
				quantity: 2
			},
			{
				itemType: ItemType.Stone,
				quantity: 1
			},
			{
				itemType: ItemType.Planks,
				quantity: 1
			}
		],
		requiredProfession: ProfessionType.Miller,
		workerSlots: 1,
		productionRecipe: {
			inputs: [
				{ itemType: ItemType.Grain, quantity: 1 }
			],
			outputs: [
				{ itemType: ItemType.Flour, quantity: 1 }
			],
			productionTime: 10
		},
		storage: {
			capacities: {
				[ItemType.Grain]: 20,
				[ItemType.Flour]: 20
			}
		}
	},
	{
		id: 'bakery',
		name: 'Bakery',
		description: 'Bakes bread from flour and water',
		category: 'production',
		icon: '🥖',
		sprite: {
			foundation: 'building_foundation',
			completed: 'sawmill'
		},
		footprint: {
			width: 3,
			height: 3
		},
		constructionTime: 22,
		costs: [
			{
				itemType: ItemType.Logs,
				quantity: 2
			},
			{
				itemType: ItemType.Stone,
				quantity: 2
			},
			{
				itemType: ItemType.Planks,
				quantity: 1
			}
		],
		requiredProfession: ProfessionType.Baker,
		workerSlots: 1,
		productionRecipe: {
			inputs: [
				{ itemType: ItemType.Flour, quantity: 1 },
				{ itemType: ItemType.Water, quantity: 1 }
			],
			outputs: [
				{ itemType: ItemType.Bread, quantity: 1 }
			],
			productionTime: 12
		},
		storage: {
			capacities: {
				[ItemType.Flour]: 10,
				[ItemType.Water]: 10,
				[ItemType.Bread]: 20
			}
		}
	},
	{
		id: 'farm',
		name: 'Farm',
		description: 'Plants and harvests wheat',
		category: 'production',
		icon: '🌾',
		sprite: {
			foundation: 'building_foundation',
			completed: 'storehouse'
		},
		footprint: {
			width: 3,
			height: 3
		},
		constructionTime: 18,
		costs: [
			{
				itemType: ItemType.Logs,
				quantity: 2
			},
			{
				itemType: ItemType.Stone,
				quantity: 1
			}
		],
		requiredProfession: ProfessionType.Farmer,
		workerSlots: 1,
		farm: {
			cropNodeType: 'wheat_crop',
			plotRadiusTiles: 6,
			plantTimeMs: 2000,
			growTimeMs: 30000,
			maxPlots: 12,
			spoilTimeMs: 20000,
			despawnTimeMs: 20000
		},
		storage: {
			capacities: {
				[ItemType.Grain]: 20
			}
		}
	},
	{
		id: 'market',
		name: 'Market',
		description: 'A place for settlers to get fresh bread',
		category: 'service',
		icon: '🛒',
		sprite: {
			foundation: 'building_foundation',
			completed: 'storehouse'
		},
		footprint: {
			width: 3,
			height: 3
		},
		constructionTime: 14,
		costs: [
			{
				itemType: ItemType.Logs,
				quantity: 2
			},
			{
				itemType: ItemType.Planks,
				quantity: 1
			}
		],
		consumes: [
			{
				itemType: ItemType.Bread,
				desiredQuantity: 20
			}
		],
		storage: {
			capacities: {
				[ItemType.Bread]: 30
			}
		}
	}
]
