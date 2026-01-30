import { ResourceNodeDefinition, ResourceNodeSpawn } from '@rugged/game'
import { ItemType } from './items'

export const resourceNodeDefinitions: ResourceNodeDefinition[] = [
	{
		id: 'tree',
		name: 'Tree',
		nodeItemType: ItemType.Logs,
		outputItemType: ItemType.Logs,
		harvestQuantity: 1,
		harvestTimeMs: 2500,
		maxHarvests: 6
	},
	{
		id: 'stone_deposit',
		name: 'Stone Deposit',
		nodeItemType: ItemType.Stone,
		outputItemType: ItemType.Stone,
		harvestQuantity: 1,
		harvestTimeMs: 3500,
		maxHarvests: 6
	},
	{
		id: 'wheat_crop',
		name: 'Wheat',
		nodeItemType: ItemType.Wheat,
		outputItemType: ItemType.Grain,
		harvestQuantity: 1,
		harvestTimeMs: 3000,
		maxHarvests: 1
	}
]

export const resourceNodes: ResourceNodeSpawn[] = [
	{ nodeType: 'tree', mapName: 'map1', position: { x: 48, y: 31 }, tileBased: true },
	{ nodeType: 'tree', mapName: 'map1', position: { x: 51, y: 30 }, tileBased: true },
	{ nodeType: 'tree', mapName: 'map1', position: { x: 46, y: 33 }, tileBased: true },
	{ nodeType: 'tree', mapName: 'map1', position: { x: 53, y: 32 }, tileBased: true },
	{ nodeType: 'stone_deposit', mapName: 'map1', position: { x: 44, y: 29 }, tileBased: true },
	{ nodeType: 'stone_deposit', mapName: 'map1', position: { x: 55, y: 34 }, tileBased: true }
]
