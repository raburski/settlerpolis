import { BuildingCategory, BuildingDefinition, ProfessionType } from '@rugged/game'
import { ItemType } from './items'

export const buildings: BuildingDefinition[] = [
	{
		id: 'storehouse',
		name: 'Storehouse',
		description: 'A storage building for resources',
		category: BuildingCategory.Storage,
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
				[ItemType.Logs]: 100,
				[ItemType.Stone]: 16,
				[ItemType.Planks]: 100
			},
			preservation: {
				spoilageMultiplier: 1
			},
			slots: [
				{ itemType: ItemType.Logs, offset: { x: 3, y: 0 } },
				{ itemType: ItemType.Logs, offset: { x: 3, y: 1 } },
				{ itemType: ItemType.Stone, offset: { x: 4, y: 0 } },
				{ itemType: ItemType.Stone, offset: { x: 4, y: 1 } },
				{ itemType: ItemType.Planks, offset: { x: 3, y: 2 } },
				{ itemType: ItemType.Planks, offset: { x: 4, y: 2 } }
			]
		}
	},
	{
		id: 'granary',
		name: 'Granary',
		description: 'Stores wheat and grain',
		category: BuildingCategory.Storage,
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
			},
			{
				itemType: ItemType.Planks,
				quantity: 1
			}
		],
		isWarehouse: true,
		workerSlots: 1,
		storage: {
			capacities: {
				[ItemType.Wheat]: 100,
				[ItemType.Grain]: 100
			},
			preservation: {
				spoilageMultiplier: 0.4
			},
			slots: [
				{ itemType: ItemType.Wheat, offset: { x: 3, y: 0 } },
				{ itemType: ItemType.Wheat, offset: { x: 3, y: 1 } },
				{ itemType: ItemType.Grain, offset: { x: 4, y: 0 } },
				{ itemType: ItemType.Grain, offset: { x: 4, y: 1 } }
			]
		}
	},
	{
		id: 'food_cellar',
		name: 'Food Cellar',
		description: 'Stores preserved food',
		category: BuildingCategory.Storage,
		icon: '🥕',
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
				quantity: 2
			},
			{
				itemType: ItemType.Planks,
				quantity: 1
			}
		],
		isWarehouse: true,
		workerSlots: 1,
		storage: {
			capacities: {
				[ItemType.Bread]: 100,
				[ItemType.Carrot]: 16
			},
			preservation: {
				spoilageMultiplier: 0.2
			},
			slots: [
				{ itemType: ItemType.Bread, offset: { x: 3, y: 0 } },
				{ itemType: ItemType.Bread, offset: { x: 3, y: 1 } },
				{ itemType: ItemType.Carrot, offset: { x: 4, y: 0 } }
			]
		}
	},
	{
		id: 'house',
		name: 'House',
		description: 'A simple house that spawns settlers',
		category: BuildingCategory.Civil,
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
		spawnRate: 30, // Spawn a settler every 30 seconds
		storage: {
			capacities: {
				[ItemType.Bread]: 3,
				[ItemType.Carrot]: 3
			},
			slots: [
				{ itemType: ItemType.Bread, offset: { x: 1, y: 1 }, hidden: true, maxQuantity: 3 },
				{ itemType: ItemType.Carrot, offset: { x: 1, y: 0 }, hidden: true, maxQuantity: 3 }
			]
		}
	},
	{
		id: 'woodcutter_hut',
		name: 'Woodcutter Hut',
		description: 'A simple hut where woodcutters gather logs',
		category: BuildingCategory.Industry,
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
			}
		],
		harvest: {
			nodeType: 'tree',
			radiusTiles: 8
		},
		requiredProfession: ProfessionType.Woodcutter,
		workerSlots: 1, // Woodcutter hut can have 1 worker
		storage: {
			capacities: {
				[ItemType.Logs]: 50 // 1 pile slot
			},
			slots: [
				{ itemType: ItemType.Logs, offset: { x: 2, y: 0 } }
			]
		}
	},
	{
		id: 'forester_hut',
		name: 'Forester Hut',
		description: 'Plants new trees to sustain nearby forests',
		category: BuildingCategory.Industry,
		icon: '🌲',
		sprite: {
			foundation: 'building_foundation',
			completed: 'woodcutter_hut'
		},
		footprint: {
			width: 2,
			height: 2
		},
		constructionTime: 12,
		costs: [
			{
				itemType: ItemType.Logs,
				quantity: 1
			}
		],
		requiredProfession: ProfessionType.Woodcutter,
		workerSlots: 1,
		farm: {
			cropNodeType: 'tree',
			plotRadiusTiles: 8,
			plantTimeMs: 2000,
			growTimeMs: 45000,
			maxPlots: 18,
			allowHarvest: false,
			minSpacingTiles: 1,
			postPlantReturnWaitMs: 2000
		}
	},
	{
		id: 'quarry',
		name: 'Quarry',
		description: 'Extracts stone from deposits',
		category: BuildingCategory.Industry,
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
			nodeType: 'stone_deposit',
			radiusTiles: 8
		},
		requiredProfession: ProfessionType.Miner,
		workerSlots: 1,
		storage: {
			capacities: {
				[ItemType.Stone]: 8 // 1 pile slot
			},
			slots: [
				{ itemType: ItemType.Stone, offset: { x: 2, y: 0 } }
			]
		}
	},
	{
		id: 'sawmill',
		name: 'Sawmill',
		description: 'Converts logs into planks',
		category: BuildingCategory.Industry,
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
				[ItemType.Logs]: 50, // 1 pile slot
				[ItemType.Planks]: 50 // 1 pile slot
			},
			slots: [
				{ itemType: ItemType.Logs, offset: { x: 3, y: 0 } },
				{ itemType: ItemType.Planks, offset: { x: 3, y: 1 } }
			]
		}
	},
	{
		id: 'well',
		name: 'Well',
		description: 'Draws clean water for the settlement',
		category: BuildingCategory.Civil,
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
			},
			slots: [
				{ itemType: ItemType.Water, offset: { x: 2, y: 0 } }
			]
		}
	},
	{
		id: 'windmill',
		name: 'Windmill',
		description: 'Turns grain into flour',
		category: BuildingCategory.Food,
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
				[ItemType.Grain]: 50,
				[ItemType.Flour]: 50
			},
			slots: [
				{ itemType: ItemType.Grain, offset: { x: 3, y: 0 } },
				{ itemType: ItemType.Flour, offset: { x: 3, y: 1 } }
			]
		}
	},
	{
		id: 'bakery',
		name: 'Bakery',
		description: 'Bakes bread from flour and water',
		category: BuildingCategory.Food,
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
				[ItemType.Flour]: 50,
				[ItemType.Water]: 50,
				[ItemType.Bread]: 50
			},
			slots: [
				{ itemType: ItemType.Flour, offset: { x: 3, y: 0 } },
				{ itemType: ItemType.Water, offset: { x: 3, y: 1 } },
				{ itemType: ItemType.Bread, offset: { x: 3, y: 2 } }
			]
		}
	},
	{
		id: 'farm',
		name: 'Farm',
		description: 'Plants and harvests wheat',
		category: BuildingCategory.Food,
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
				[ItemType.Grain]: 50
			},
			slots: [
				{ itemType: ItemType.Grain, offset: { x: 3, y: 0 } }
			]
		}
	},
	{
		id: 'market',
		name: 'Market',
		description: 'A place for settlers to get fresh bread',
		category: BuildingCategory.Food,
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
			},
			{
				itemType: ItemType.Carrot,
				desiredQuantity: 12
			}
		],
		requiredProfession: ProfessionType.Vendor,
		workerSlots: 1,
		marketDistribution: {
			maxDistanceTiles: 24,
			maxStops: 8,
			roadSearchRadiusTiles: 8,
			houseSearchRadiusTiles: 3,
			carryQuantity: 8,
			deliveryQuantity: 2
		},
		amenitySlots: {
			count: 3
		},
		storage: {
			capacities: {
				[ItemType.Bread]: 50,
				[ItemType.Carrot]: 16
			},
			slots: [
				{ itemType: ItemType.Bread, offset: { x: 3, y: 0 } },
				{ itemType: ItemType.Carrot, offset: { x: 3, y: 1 } }
			]
		}
	},
	{
		id: 'inn',
		name: 'Inn',
		description: 'A modest inn offering a quick rest and meal',
		category: BuildingCategory.Civil,
		icon: '🏨',
		sprite: {
			foundation: 'building_foundation',
			completed: 'storehouse'
		},
		footprint: {
			width: 3,
			height: 3
		},
		constructionTime: 16,
		costs: [
			{
				itemType: ItemType.Logs,
				quantity: 2
			},
			{
				itemType: ItemType.Planks,
				quantity: 2
			},
			{
				itemType: ItemType.Stone,
				quantity: 1
			}
		],
		amenitySlots: {
			count: 3
		},
		amenityNeeds: {
			hunger: 0.6,
			fatigue: 0.6
		},
		consumes: [
			{
				itemType: ItemType.Bread,
				desiredQuantity: 10
			}
		],
		storage: {
			capacities: {
				[ItemType.Bread]: 20
			},
			slots: [
				{ itemType: ItemType.Bread, offset: { x: 3, y: 0 } }
			]
		}
	}
]
