import { BuildingCategory, BuildingDefinition } from '../../src/Buildings/types'

/**
 * Common building definitions for testing
 */
export const house: BuildingDefinition = {
	id: 'house',
	name: 'House',
	description: 'A simple house that spawns settlers',
	category: BuildingCategory.Civil,
	footprint: {
		width: 2,
		height: 2
	},
	constructionTime: 10,
	costs: [
		{ itemType: 'logs', quantity: 10 },
		{ itemType: 'stone', quantity: 5 }
	]
}

export const storehouse: BuildingDefinition = {
	id: 'storehouse',
	name: 'Storehouse',
	description: 'A storage building for resources',
	category: BuildingCategory.Storage,
	footprint: {
		width: 3,
		height: 3
	},
	constructionTime: 15,
	costs: [
		{ itemType: 'logs', quantity: 1 },
		{ itemType: 'stone', quantity: 2 }
	],
	workerSlots: 2,
	storage: {
		capacities: {
			logs: 50,
			stone: 50,
			planks: 50
		}
	}
}

export const woodcutterHut: BuildingDefinition = {
	id: 'woodcutter_hut',
	name: 'Woodcutter Hut',
	description: 'A simple hut where woodcutters can process logs into planks',
	category: BuildingCategory.Industry,
	footprint: {
		width: 2,
		height: 2
	},
	constructionTime: 10,
	costs: [
		{ itemType: 'logs', quantity: 1 },
		{ itemType: 'stone', quantity: 1 }
	],
	requiredProfession: 'woodcutter',
	workerSlots: 1,
	productionRecipe: {
		inputs: [],
		outputs: [
			{ itemType: 'logs', quantity: 1 }
		],
		productionTime: 5
	}
}
