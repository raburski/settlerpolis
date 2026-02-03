import type { WorldMapData } from '@rugged/game'
import { WorldMapNodeType } from '@rugged/game'

export { WorldMapNodeType }
export type { WorldMapData } from '@rugged/game'
export type { WorldMapNode, WorldMapNodeTradeOffer, WorldMapLink } from '@rugged/game'

const CONTENT_FOLDER = import.meta.env.VITE_GAME_CONTENT || 'settlerpolis'
let contentWorldMap: WorldMapData | null = null

try {
	const contentModules = import.meta.glob('../../../../../content/*/worldMap.ts', { eager: true })
	const contentPath = `../../../../../content/${CONTENT_FOLDER}/worldMap.ts`
	const module = contentModules[contentPath] as { worldMap?: WorldMapData } | undefined
	contentWorldMap = module?.worldMap || null
} catch (error) {
	console.warn('[WorldMap] Failed to load content world map:', error)
}

const fallbackWorldMap: WorldMapData = {
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
		}
	],
	links: []
}

export const worldMapData: WorldMapData = contentWorldMap || fallbackWorldMap
