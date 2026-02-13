import { ResourceNodeDefinition, ResourceNodeSpawn } from '@rugged/game'
import { ItemType } from './items'

export const resourceNodeDefinitions: ResourceNodeDefinition[] = [
	{
		id: 'tree',
		name: 'Tree',
		nodeItemType: ItemType.Tree,
		outputItemType: ItemType.Logs,
		harvestQuantity: 1,
		maxHarvests: 1,
		blocksMovement: true
	},
	{
		id: 'fish',
		name: 'Fish',
		nodeItemType: ItemType.Fish,
		outputItemType: ItemType.Fish,
		harvestQuantity: 1,
		maxHarvests: 4,
		regenTimeMs: 60000
	},
	{
		id: 'deer',
		name: 'Deer',
		nodeItemType: ItemType.Deer,
		outputItemType: ItemType.Deer,
		harvestQuantity: 1,
		maxHarvests: 1
	},
	{
		id: 'stone_deposit',
		name: 'Stone Deposit',
		nodeItemType: ItemType.Stone,
		outputItemType: ItemType.Stone,
		harvestQuantity: 1,
		maxHarvests: 6,
		blocksMovement: true
	},
	{
		id: 'resource_deposit',
		name: 'Resource Deposit',
		nodeItemType: ItemType.Stone,
		outputItemType: ItemType.Stone,
		harvestQuantity: 1,
		maxHarvests: 1,
		blocksMovement: true,
		footprint: {
			width: 2,
			height: 2
		}
	},
	{
		id: 'wheat_crop',
		name: 'Wheat',
		nodeItemType: ItemType.Wheat,
		outputItemType: ItemType.Grain,
		harvestQuantity: 1,
		maxHarvests: 1
	}
]

export const resourceNodes: ResourceNodeSpawn[] = [
	{ nodeType: 'tree', mapId: 'map1', position: { x: 48, y: 31 }, tileBased: true },
	{ nodeType: 'tree', mapId: 'map1', position: { x: 51, y: 30 }, tileBased: true },
	{ nodeType: 'tree', mapId: 'map1', position: { x: 46, y: 33 }, tileBased: true },
	{ nodeType: 'tree', mapId: 'map1', position: { x: 53, y: 32 }, tileBased: true },
	{ nodeType: 'stone_deposit', mapId: 'map1', position: { x: 44, y: 29 }, tileBased: true, quantity: 30 },
	{ nodeType: 'stone_deposit', mapId: 'map1', position: { x: 55, y: 34 }, tileBased: true, quantity: 40 },
	{ nodeType: 'fish', mapId: 'map1', position: { x: 2, y: 334 }, tileBased: true },
	{ nodeType: 'fish', mapId: 'map1', position: { x: 4, y: 334 }, tileBased: true },
	{ nodeType: 'fish', mapId: 'map1', position: { x: 1, y: 340 }, tileBased: true },
	{ nodeType: 'fish', mapId: 'map1', position: { x: 5, y: 342 }, tileBased: true },
	{ nodeType: 'fish', mapId: 'map1', position: { x: 3, y: 350 }, tileBased: true },
	{ nodeType: 'fish', mapId: 'map1', position: { x: 2, y: 360 }, tileBased: true }
]
