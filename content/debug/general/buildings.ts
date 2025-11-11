import { BuildingDefinition } from '@rugged/game'

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
				itemType: 'logs',
				quantity: 10
			},
			{
				itemType: 'stone',
				quantity: 5
			}
		],
		workerSlots: 2 // Storehouse can have 2 workers managing inventory
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
				itemType: 'logs',
				quantity: 8
			},
			{
				itemType: 'stone',
				quantity: 4
			}
		],
		spawnsSettlers: true,
		maxOccupants: 5,
		spawnRate: 30 // Spawn a settler every 30 seconds
	},
	{
		id: 'woodcutter_hut',
		name: 'Woodcutter Hut',
		description: 'A simple hut where woodcutters can process logs',
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
				itemType: 'logs',
				quantity: 5
			},
			{
				itemType: 'stone',
				quantity: 2
			}
		],
		requiredProfession: 'woodcutter',
		workerSlots: 1 // Woodcutter hut can have 1 worker
	}
]

