import { StartingItem } from '@rugged/game'
import { ItemType } from './items'

// Helper function to generate items in a grid pattern
const generateItems = (itemType: ItemType, count: number, startX: number, startY: number, columns: number): StartingItem[] => {
	return Array.from({ length: count }, (_, index) => {
		const col = index % columns
		const row = Math.floor(index / columns)
		return {
			itemType,
			offset: {
				x: startX + col,
				y: startY + row,
				tileBased: true
			}
		}
	})
}

// Helper function to generate piles with explicit quantities
const generatePiles = (itemType: ItemType, quantities: number[], startX: number, startY: number, columns: number): StartingItem[] => {
	return quantities.map((quantity, index) => {
		const col = index % columns
		const row = Math.floor(index / columns)
		return {
			itemType,
			quantity,
			offset: {
				x: startX + col,
				y: startY + row,
				tileBased: true
			}
		}
	})
}

export const startingItems: StartingItem[] = [
	// Tools
	{
		itemType: ItemType.Hammer,
		offset: {
			x: 2, // 2 tiles to the right
			y: 0,
			tileBased: true
		}
	},
	{
		itemType: ItemType.Axe,
		offset: {
			x: 0,
			y: 2, // 2 tiles below
			tileBased: true
		}
	},
	{
		itemType: ItemType.Axe,
		offset: {
			x: -1,
			y: 2, // 2 tiles below
			tileBased: true
		}
	},
	{
		itemType: ItemType.Axe,
		offset: {
			x: 1,
			y: 2, // 2 tiles below
			tileBased: true
		}
	},
	{
		itemType: ItemType.Pickaxe,
		offset: {
			x: 3,
			y: 0,
			tileBased: true
		}
	},
	// 20 logs below (positive y) as piles of up to 8
	...generatePiles(ItemType.Logs, [8, 8, 4], -2, 3, 4),
	// 20 stones above (negative y) as piles of up to 8
	...generatePiles(ItemType.Stone, [8, 8, 4], -2, -5, 4)
]
