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
	}
]
