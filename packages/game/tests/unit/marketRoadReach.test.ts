import { describe, expect, it } from 'vitest'
import { ConstructionStage } from '../../src/Buildings/types'
import {
	buildMarketRoadBlockadeTiles,
	buildRoadNetworkWalk,
	findClosestRoadTile,
	type RoadGridData
} from '../../src/Buildings/marketRoadReach'
import { RoadType } from '../../src/Roads/types'

const buildLineRoadData = (length: number): RoadGridData => ({
	width: length,
	height: 1,
	data: Array.from({ length }, () => RoadType.Dirt)
})

describe('market road reach', () => {
	it('builds blockade tiles from completed market road blockade buildings', () => {
		const blocked = buildMarketRoadBlockadeTiles(
			[
				{
					mapId: 'map-1',
					playerId: 'player-1',
					position: { x: 64, y: 0 },
					rotation: 0,
					stage: ConstructionStage.Completed,
					buildingId: 'road_bollard'
				}
			],
			() => ({
				footprint: { width: 1, height: 1 },
				marketRoadBlockade: true
			}),
			'map-1',
			'player-1',
			32
		)

		expect(blocked.has('2,0')).toBe(true)
	})

	it('does not traverse through blocked road tiles', () => {
		const roadData = buildLineRoadData(5)
		const blockedRoadTiles = new Set<string>(['2,0'])
		const start = findClosestRoadTile(roadData, { x: 0, y: 0 }, 0, blockedRoadTiles)
		const route = buildRoadNetworkWalk(roadData, start, 10, blockedRoadTiles)
		const visited = new Set(route.map((tile) => `${tile.x},${tile.y}`))

		expect(start).toEqual({ x: 0, y: 0 })
		expect(visited.has('2,0')).toBe(false)
		expect(visited.has('1,0')).toBe(true)
		expect(visited.has('3,0')).toBe(false)
		expect(visited.has('4,0')).toBe(false)
	})
})
