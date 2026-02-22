import { describe, expect, it } from 'vitest'
import { RoadType } from '../../src/Roads/types'
import { buildRoadNetworkWalk } from '../../src/Buildings/marketRoadReach'

type TilePosition = { x: number, y: number }

const buildRoadData = (width: number, height: number, roadTiles: TilePosition[]) => {
	const data: Array<RoadType | null> = Array.from({ length: width * height }, () => null)
	for (const tile of roadTiles) {
		data[tile.y * width + tile.x] = RoadType.Dirt
	}
	return { width, height, data }
}

const containsTile = (route: TilePosition[], target: TilePosition): boolean => {
	return route.some(tile => tile.x === target.x && tile.y === target.y)
}

describe('buildRoadNetworkWalk', () => {
	it('walks a straight road as one full line without artificial splits', () => {
		const roadData = buildRoadData(6, 3, [
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
			{ x: 2, y: 1 },
			{ x: 3, y: 1 },
			{ x: 4, y: 1 }
		])
		const route = buildRoadNetworkWalk(roadData, { x: 0, y: 1 }, 4)

		expect(route).toEqual([
			{ x: 0, y: 1 },
			{ x: 1, y: 1 },
			{ x: 2, y: 1 },
			{ x: 3, y: 1 },
			{ x: 4, y: 1 }
		])
	})

	it('discovers nearby branches via breadth-first network discovery and traverses them deterministically', () => {
		const roadData = buildRoadData(8, 8, [
			{ x: 1, y: 3 }, { x: 2, y: 3 }, { x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 }, { x: 6, y: 3 },
			{ x: 5, y: 2 }, { x: 5, y: 1 },
			{ x: 2, y: 4 }
		])
		const start = { x: 3, y: 3 }
		const route = buildRoadNetworkWalk(roadData, start, 4)
		const routeSecondRun = buildRoadNetworkWalk(roadData, start, 4)

		expect(route).toEqual(routeSecondRun)
		expect(containsTile(route, { x: 5, y: 1 })).toBe(true)
		expect(containsTile(route, { x: 2, y: 4 })).toBe(true)
	})

	it('creates a contiguous tile-by-tile walk across the generated network path', () => {
		const roadData = buildRoadData(7, 7, [
			{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 5, y: 3 },
			{ x: 4, y: 2 }, { x: 4, y: 1 },
			{ x: 2, y: 3 }, { x: 1, y: 3 },
			{ x: 2, y: 4 }
		])
		const route = buildRoadNetworkWalk(roadData, { x: 3, y: 3 }, 4)

		for (let index = 1; index < route.length; index += 1) {
			const prev = route[index - 1]
			const current = route[index]
			const manhattan = Math.abs(current.x - prev.x) + Math.abs(current.y - prev.y)
			expect(manhattan).toBe(1)
		}
	})

	it('treats blocked road tiles as non-traversable for vendor patrol expansion', () => {
		const roadData = buildRoadData(7, 3, [
			{ x: 1, y: 1 },
			{ x: 2, y: 1 },
			{ x: 3, y: 1 },
			{ x: 4, y: 1 },
			{ x: 5, y: 1 }
		])
		const blockedRoadTiles = new Set<string>(['3,1'])
		const route = buildRoadNetworkWalk(roadData, { x: 1, y: 1 }, 5, blockedRoadTiles)

		expect(route).toContainEqual({ x: 1, y: 1 })
		expect(route).toContainEqual({ x: 2, y: 1 })
		expect(route).not.toContainEqual({ x: 3, y: 1 })
		expect(route).not.toContainEqual({ x: 4, y: 1 })
		expect(route).not.toContainEqual({ x: 5, y: 1 })
	})
})
