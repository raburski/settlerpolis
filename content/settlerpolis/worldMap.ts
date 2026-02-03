import { WorldMapNodeType } from '@rugged/game'
import type { WorldMapData } from '@rugged/game'

export const worldMap: WorldMapData = {
	image: '/worldmap-placeholder.svg',
	travelSecondsPerUnit: 30,
	homeNodeId: 'home',
	nodes: [
		{
			id: 'home',
			label: 'Asterfall',
			type: WorldMapNodeType.Home,
			position: { x: 0.22, y: 0.58 },
			description: 'Your frontier capital and supply anchor.'
		},
		{
			id: 'stonewatch',
			label: 'Stonewatch',
			type: WorldMapNodeType.City,
			position: { x: 0.72, y: 0.32 },
			description: 'A fortified trade city in the northern cliffs.',
			tradeOffers: [
				{
					id: 'stonewatch-logs',
					offerItem: 'logs',
					offerQuantity: 10,
					receiveItem: 'stone',
					receiveQuantity: 6,
					reputation: 2,
					cooldownSeconds: 12
				},
				{
					id: 'stonewatch-planks',
					offerItem: 'planks',
					offerQuantity: 6,
					receiveItem: 'grain',
					receiveQuantity: 8,
					reputation: 1,
					cooldownSeconds: 10
				}
			]
		},
		{
			id: 'sunken-ruins',
			label: 'Sunken Ruins',
			type: WorldMapNodeType.Expedition,
			position: { x: 0.52, y: 0.78 },
			description: 'Half-flooded ruins rumored to hide relics.',
			tradeOffers: [
				{
					id: 'sunken-bread',
					offerItem: 'bread',
					offerQuantity: 6,
					receiveItem: 'planks',
					receiveQuantity: 4,
					reputation: 3,
					cooldownSeconds: 14
				},
				{
					id: 'sunken-carrot',
					offerItem: 'carrot',
					offerQuantity: 10,
					receiveItem: 'stone',
					receiveQuantity: 4,
					reputation: 2,
					cooldownSeconds: 12
				}
			]
		},
		{
			id: 'highridge',
			label: 'Highridge',
			type: WorldMapNodeType.City,
			position: { x: 0.84, y: 0.6 },
			description: 'A mountain crossroads known for hardy traders.',
			tradeOffers: [
				{
					id: 'highridge-stone',
					offerItem: 'stone',
					offerQuantity: 8,
					receiveItem: 'planks',
					receiveQuantity: 6,
					reputation: 2,
					cooldownSeconds: 12
				},
				{
					id: 'highridge-grain',
					offerItem: 'grain',
					offerQuantity: 12,
					receiveItem: 'bread',
					receiveQuantity: 6,
					reputation: 2,
					cooldownSeconds: 14
				}
			]
		}
	],
	links: [
		{ fromId: 'home', toId: 'stonewatch', type: 'land' },
		{ fromId: 'home', toId: 'sunken-ruins', type: 'land' },
		{ fromId: 'stonewatch', toId: 'highridge', type: 'land' }
	]
}
