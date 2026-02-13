import { describe, expect, it } from 'vitest'
import { Pathfinder } from '../../src/Map/pathfinding'

const buildCollision = (width: number, height: number, blocked: Array<{ x: number, y: number }> = []) => {
	const data = Array.from({ length: width * height }, () => 0)
	for (const tile of blocked) {
		data[tile.y * width + tile.x] = 1
	}
	return { width, height, data }
}

const buildPaths = (width: number, height: number, value: number = 0) => {
	return {
		width,
		height,
		data: Array.from({ length: width * height }, () => value)
	}
}

describe('Pathfinder heap-backed search', () => {
	it('returns a simplified straight path on an empty line', () => {
		const collision = buildCollision(5, 1)
		const paths = buildPaths(5, 1)
		const path = Pathfinder.findPath(collision, paths, { x: 0, y: 0 }, { x: 4, y: 0 })

		expect(path).toEqual([
			{ x: 0, y: 0 },
			{ x: 4, y: 0 }
		])
	})

	it('finds a valid detour around blocking tiles', () => {
		const collision = buildCollision(5, 5, [
			{ x: 2, y: 0 },
			{ x: 2, y: 1 },
			{ x: 2, y: 2 },
			{ x: 2, y: 3 }
		])
		const paths = buildPaths(5, 5)
		const path = Pathfinder.findPath(collision, paths, { x: 0, y: 0 }, { x: 4, y: 0 })

		expect(path.length).toBeGreaterThan(0)
		expect(path[0]).toEqual({ x: 0, y: 0 })
		expect(path[path.length - 1]).toEqual({ x: 4, y: 0 })
		for (const point of path) {
			const index = point.y * collision.width + point.x
			expect(collision.data[index]).toBe(0)
		}
	})

	it('blocks diagonal corner cutting through two adjacent obstacles', () => {
		const collision = buildCollision(2, 2, [
			{ x: 1, y: 0 },
			{ x: 0, y: 1 }
		])
		const paths = buildPaths(2, 2)
		const path = Pathfinder.findPath(collision, paths, { x: 0, y: 0 }, { x: 1, y: 1 }, { allowDiagonal: true })

		expect(path).toEqual([])
	})
})
