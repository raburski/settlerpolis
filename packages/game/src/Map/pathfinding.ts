import { Position } from '../types'
import { CollisionData, PathData } from './types'
import type { RoadData } from '../Roads/types'
import { ROAD_PATH_PREFERENCE_MULTIPLIER, ROAD_SPEED_MULTIPLIERS, RoadType } from '../Roads/types'

interface Node {
	position: Position
	g: number
	h: number
	f: number
	parent: Node | null
}

interface Neighbor {
	position: Position
	cost: number
}

export class Pathfinder {
	static findPath(
		collision: CollisionData,
		paths: PathData,
		start: Position,
		end: Position,
		options?: { roads?: RoadData, allowDiagonal?: boolean }
	): Position[] {
		const allowDiagonal = options?.allowDiagonal ?? false
		const openSet: Node[] = []
		const closedSet: Set<string> = new Set()
		const startNode: Node = {
			position: start,
			g: 0,
			h: this.heuristic(start, end, allowDiagonal),
			f: this.heuristic(start, end, allowDiagonal),
			parent: null
		}

		openSet.push(startNode)

		while (openSet.length > 0) {
			// Find node with lowest f cost
			let currentIndex = 0
			for (let i = 1; i < openSet.length; i++) {
				if (openSet[i].f < openSet[currentIndex].f) {
					currentIndex = i
				}
			}

			const current = openSet[currentIndex]

			// If we reached the end, reconstruct and return the path
			if (current.position.x === end.x && current.position.y === end.y) {
				return this.reconstructPath(current)
			}

			// Move current from open to closed set
			openSet.splice(currentIndex, 1)
			closedSet.add(`${current.position.x},${current.position.y}`)

			// Check all neighbors
			const neighbors = this.getNeighbors(current.position, collision, allowDiagonal)
			for (const neighbor of neighbors) {
				const neighborKey = `${neighbor.position.x},${neighbor.position.y}`

				// Skip if already evaluated
				if (closedSet.has(neighborKey)) {
					continue
				}

				// Calculate tentative g score with path preference
				const pathCost = this.getPathCost(neighbor.position, paths)
				const roadCostMultiplier = this.getRoadCostMultiplierForSegment(current.position, neighbor.position, options?.roads)
				const tentativeG = current.g + neighbor.cost * roadCostMultiplier + pathCost

				// Check if this path to neighbor is better
				const existingNeighbor = openSet.find(
					n => n.position.x === neighbor.position.x && n.position.y === neighbor.position.y
				)

				if (!existingNeighbor || tentativeG < existingNeighbor.g) {
					const neighborNode: Node = {
						position: neighbor.position,
						g: tentativeG,
						h: this.heuristic(neighbor.position, end, allowDiagonal),
						f: tentativeG + this.heuristic(neighbor.position, end, allowDiagonal),
						parent: current
					}

					if (!existingNeighbor) {
						openSet.push(neighborNode)
					} else {
						existingNeighbor.g = tentativeG
						existingNeighbor.f = tentativeG + existingNeighbor.h
						existingNeighbor.parent = current
					}
				}
			}
		}

		// No path found
		return []
	}

	private static heuristic(a: Position, b: Position, allowDiagonal: boolean): number {
		const dx = Math.abs(a.x - b.x)
		const dy = Math.abs(a.y - b.y)
		if (!allowDiagonal) {
			return dx + dy
		}
		const min = Math.min(dx, dy)
		const max = Math.max(dx, dy)
		return (Math.SQRT2 * min) + (max - min)
	}

	private static getPathCost(position: Position, paths: PathData): number {
		const index = position.y * paths.width + position.x
		if (index >= 0 && index < paths.data.length) {
			// If there's a path tile (non-zero), reduce the cost
			return paths.data[index] === 0 ? 0.5 : -0.5
		}
		return 0
	}

	private static getNeighbors(position: Position, collision: CollisionData, allowDiagonal: boolean): Neighbor[] {
		const neighbors: Neighbor[] = []
		const directions = [
			{ x: 0, y: -1, cost: 1 }, // up
			{ x: 1, y: 0, cost: 1 },  // right
			{ x: 0, y: 1, cost: 1 },  // down
			{ x: -1, y: 0, cost: 1 }  // left
		]

		if (allowDiagonal) {
			directions.push(
				{ x: 1, y: -1, cost: Math.SQRT2 },
				{ x: 1, y: 1, cost: Math.SQRT2 },
				{ x: -1, y: 1, cost: Math.SQRT2 },
				{ x: -1, y: -1, cost: Math.SQRT2 }
			)
		}

		for (const dir of directions) {
			const newX = position.x + dir.x
			const newY = position.y + dir.y

			if (
				newX < 0 || newX >= collision.width ||
				newY < 0 || newY >= collision.height
			) {
				continue
			}

			// Check collision
			const index = newY * collision.width + newX
			if (index < 0 || index >= collision.data.length || collision.data[index] !== 0) {
				continue
			}

			if (allowDiagonal && dir.x !== 0 && dir.y !== 0) {
				const adjacentX = position.x + dir.x
				const adjacentY = position.y
				const adjacentIndex = adjacentY * collision.width + adjacentX
				if (collision.data[adjacentIndex] !== 0) {
					continue
				}
				const adjacentX2 = position.x
				const adjacentY2 = position.y + dir.y
				const adjacentIndex2 = adjacentY2 * collision.width + adjacentX2
				if (collision.data[adjacentIndex2] !== 0) {
					continue
				}
			}

			neighbors.push({ position: { x: newX, y: newY }, cost: dir.cost })
		}

		return neighbors
	}

	private static getRoadCostMultiplierForSegment(from: Position, to: Position, roads?: RoadData): number {
		if (!roads) {
			return 1
		}
		const fromIndex = from.y * roads.width + from.x
		const toIndex = to.y * roads.width + to.x
		if (fromIndex < 0 || toIndex < 0 || fromIndex >= roads.data.length || toIndex >= roads.data.length) {
			return 1
		}
		const fromType = roads.data[fromIndex] ?? RoadType.None
		const toType = roads.data[toIndex] ?? RoadType.None
		if (fromType === RoadType.None || toType === RoadType.None) {
			return 1
		}
		const speedMultiplier = Math.min(
			ROAD_SPEED_MULTIPLIERS[fromType] ?? 1,
			ROAD_SPEED_MULTIPLIERS[toType] ?? 1
		)
		if (speedMultiplier <= 0) {
			return 1
		}
		return 1 / (speedMultiplier * ROAD_PATH_PREFERENCE_MULTIPLIER)
	}

	private static reconstructPath(node: Node): Position[] {
		const path: Position[] = []
		let current: Node | null = node

		while (current) {
			path.unshift(current.position)
			current = current.parent
		}

		return this.simplifyPath(path)
	}

	private static simplifyPath(path: Position[]): Position[] {
		if (path.length <= 2) return path

		const simplified: Position[] = [path[0]]
		let lastDirection = this.getDirection(path[0], path[1])
		let lastPoint = path[1]

		for (let i = 2; i < path.length; i++) {
			const currentDirection = this.getDirection(lastPoint, path[i])
			
			if (currentDirection.x !== lastDirection.x || currentDirection.y !== lastDirection.y) {
				// Direction changed, keep the last point of the previous segment
				simplified.push(lastPoint)
				lastDirection = currentDirection
			}
			
			lastPoint = path[i]
		}

		// Add the final point
		simplified.push(lastPoint)
		return simplified
	}

	private static getDirection(from: Position, to: Position): Position {
		return {
			x: to.x - from.x,
			y: to.y - from.y
		}
	}
} 
