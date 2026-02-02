import { BuildingCategory, BuildingDefinition, ProfessionType } from '@rugged/game'
import { ItemType } from './items'

const createGraveyardSlots = (width: number, height: number) => {
	const slots = []
	for (let y = 1; y < height - 1; y += 1) {
		for (let x = 1; x < width - 1; x += 1) {
			slots.push({
				itemType: ItemType.Tombstone,
				offset: { x, y },
				maxQuantity: 1
			})
		}
	}
	return slots
}

const graveyardFootprint = { width: 5, height: 5 }
const graveyardSlots = createGraveyardSlots(graveyardFootprint.width, graveyardFootprint.height)
const graveyardCapacity = graveyardSlots.length

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
		storagePreservation: {
			spoilageMultiplier: 1
		},
		storageSlots: [
			{ itemType: ItemType.Logs, offset: { x: 3, y: 0 } },
			{ itemType: ItemType.Logs, offset: { x: 3, y: 1 } },
			{ itemType: ItemType.Stone, offset: { x: 4, y: 0 } },
			{ itemType: ItemType.Stone, offset: { x: 4, y: 1 } },
			{ itemType: ItemType.Planks, offset: { x: 3, y: 2 } },
			{ itemType: ItemType.Planks, offset: { x: 4, y: 2 } }
		]
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
		storagePreservation: {
			spoilageMultiplier: 0.4
		},
		storageSlots: [
			{ itemType: ItemType.Wheat, offset: { x: 3, y: 0 } },
			{ itemType: ItemType.Wheat, offset: { x: 3, y: 1 } },
			{ itemType: ItemType.Grain, offset: { x: 4, y: 0 } },
			{ itemType: ItemType.Grain, offset: { x: 4, y: 1 } }
		]
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
		storagePreservation: {
			spoilageMultiplier: 0.2
		},
		storageSlots: [
			{ itemType: ItemType.Bread, offset: { x: 3, y: 0 } },
			{ itemType: ItemType.Bread, offset: { x: 3, y: 1 } },
			{ itemType: ItemType.Carrot, offset: { x: 4, y: 0 } }
		]
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
		render: {
			modelSrc: "/assets/library/cottage.glb"
		},
		spawnsSettlers: true,
		maxOccupants: 5,
		spawnRate: 30, // Spawn a settler every 30 seconds
		storageSlots: [
			{ itemType: ItemType.Bread, offset: { x: 1, y: 1 }, hidden: true, maxQuantity: 3 },
			{ itemType: ItemType.Carrot, offset: { x: 1, y: 0 }, hidden: true, maxQuantity: 3 }
		],
		entryPoint: {
			x: 0.9,
			y: 1.3
		  },
		  centerPoint: {
			x: 1,
			y: 1
		  }
	},
	{
		id: 'graveyard',
		name: 'Graveyard',
		description: 'A fenced field for honoring the fallen',
		category: BuildingCategory.Civil,
		icon: '🪦',
		sprite: {
			foundation: 'building_foundation',
			completed: 'storehouse'
		},
		footprint: graveyardFootprint,
		constructionTime: 12,
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
		consumes: [
			{
				itemType: ItemType.Tombstone,
				desiredQuantity: graveyardCapacity
			}
		],
		storageSlots: graveyardSlots
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
		storageSlots: [
			{ itemType: ItemType.Logs, offset: { x: 2, y: 0 } }
		]
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
		storageSlots: [
			{ itemType: ItemType.Stone, offset: { x: 2, y: 0 } }
		]
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
		storageSlots: [
			{ itemType: ItemType.Logs, offset: { x: 3, y: 0 } },
			{ itemType: ItemType.Planks, offset: { x: 3, y: 1 } }
		]
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
		storageSlots: [
			{ itemType: ItemType.Water, offset: { x: 2, y: 0 } }
		]
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
		render: {
			modelSrc: "/assets/library/windmill.glb",
			transform: {
			  scale: {
				x: 2,
				y: 2,
				z: 2
			  },
			  elevation: -0.23
			}
		  },
		storageSlots: [
			{ itemType: ItemType.Grain, offset: { x: 3, y: 0 } },
			{ itemType: ItemType.Flour, offset: { x: 3, y: 1 } }
		],
		entryPoint: {
			x: 2.5,
			y: 1.5
		  },
		  centerPoint: {
			x: 1.5,
			y: 1.5
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
		storageSlots: [
			{ itemType: ItemType.Flour, offset: { x: 3, y: 0 } },
			{ itemType: ItemType.Water, offset: { x: 3, y: 1 } },
			{ itemType: ItemType.Bread, offset: { x: 3, y: 2 } }
		]
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
		render: {
			modelSrc: "/assets/library/farmhouse.glb",
			transform: {
			  rotation: {
				x: 0,
				y: 1.5707963267948966,
				z: 0
			  },
			  scale: {
				x: 1.8,
				y: 1.8,
				z: 1.8
			  }
			}
		  },
		storageSlots: [
			{ itemType: ItemType.Grain, offset: { x: 3, y: 0 } }
		]
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
		render: {
			modelSrc: '/assets/library/agora.glb',
			transform: {
				rotation: {
					x: 0,
					y: 0,
					z: 0
				},
				scale: {
					x: 1.7,
					y: 1.7,
					z: 1.7
				},
				elevation: 0
			}
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
		storageSlots: [
			{ itemType: ItemType.Bread, offset: { x: 3, y: 0 } },
			{ itemType: ItemType.Carrot, offset: { x: 3, y: 1 } }
		]
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
		storageSlots: [
			{ itemType: ItemType.Bread, offset: { x: 3, y: 0 } }
		]
	}
]
