export enum WorldMapNodeType {
	Home = 'home',
	City = 'city',
	Expedition = 'expedition'
}

export type WorldMapNode = {
	id: string
	label: string
	type: WorldMapNodeType
	position: { x: number; y: number }
	description: string
}

export type WorldMapData = {
	image: string
	travelDaysPerUnit: number
	nodes: WorldMapNode[]
	homeNodeId: string
}

export const worldMapData: WorldMapData = {
	image: '/worldmap-placeholder.svg',
	travelDaysPerUnit: 10,
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
			description: 'A fortified trade city in the northern cliffs.'
		},
		{
			id: 'sunken-ruins',
			label: 'Sunken Ruins',
			type: WorldMapNodeType.Expedition,
			position: { x: 0.52, y: 0.78 },
			description: 'Half-flooded ruins rumored to hide relics.'
		}
	]
}
