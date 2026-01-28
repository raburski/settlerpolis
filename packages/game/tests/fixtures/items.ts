import { ItemMetadata, ItemCategory } from '../../src/Items/types'

/**
 * Common item definitions for testing
 */
export const logs: ItemMetadata = {
	id: 'logs',
	name: 'Logs',
	emoji: '🪵',
	description: 'Wood logs',
	category: ItemCategory.Material,
	stackable: true
}

export const stone: ItemMetadata = {
	id: 'stone',
	name: 'Stone',
	emoji: '🪨',
	description: 'Stone',
	category: ItemCategory.Material,
	stackable: true
}

export const planks: ItemMetadata = {
	id: 'planks',
	name: 'Planks',
	emoji: '📦',
	description: 'Wooden planks',
	category: ItemCategory.Material,
	stackable: true
}

export const carrot: ItemMetadata = {
	id: 'carrot',
	name: 'Carrot',
	emoji: '🥕',
	description: 'A fresh carrot',
	category: ItemCategory.Consumable,
	stackable: true
}

export const hammer: ItemMetadata = {
	id: 'hammer',
	name: 'Hammer',
	emoji: '🔨',
	description: 'A builder\'s hammer',
	category: ItemCategory.Tool,
	stackable: false,
	changesProfession: 'builder'
}

export const axe: ItemMetadata = {
	id: 'axe',
	name: 'Axe',
	emoji: '🪓',
	description: 'A woodcutter\'s axe',
	category: ItemCategory.Tool,
	stackable: false,
	changesProfession: 'woodcutter'
}

export const buildingFoundation: ItemMetadata = {
	id: 'building_foundation',
	name: 'Building Foundation',
	emoji: '🏗️',
	description: 'A building foundation',
	category: ItemCategory.Placeable,
	stackable: false
}

