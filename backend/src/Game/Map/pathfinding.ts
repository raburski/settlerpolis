import { Position } from '../../types'
import { CollisionData, PathData } from './types'

interface Node {
	position: Position
	g: number
	h: number
	f: number
	parent: Node | null
}

export class Pathfinder {
	static findPath(
		collision: CollisionData,
		paths: PathData,
		start: Position,
		end: Position
	): Position[] {
		const openSet: Node[] = []
		const closedSet: Set<string> = new Set()
		const startNode: Node = {
			position: start,
			g: 0,
			h: this.heuristic(start, end),
			f: this.heuristic(start, end),
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
			const neighbors = this.getNeighbors(current.position, collision, paths)
			for (const neighbor of neighbors) {
				const neighborKey = `${neighbor.x},${neighbor.y}`

				// Skip if already evaluated
				if (closedSet.has(neighborKey)) {
					continue
				}

				// Calculate tentative g score with path preference
				const pathCost = this.getPathCost(neighbor, paths)
				const tentativeG = current.g + 1 + pathCost

				// Check if this path to neighbor is better
				const existingNeighbor = openSet.find(
					n => n.position.x === neighbor.x && n.position.y === neighbor.y
				)

				if (!existingNeighbor || tentativeG < existingNeighbor.g) {
					const neighborNode: Node = {
						position: neighbor,
						g: tentativeG,
						h: this.heuristic(neighbor, end),
						f: tentativeG + this.heuristic(neighbor, end),
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

	private static heuristic(a: Position, b: Position): number {
		// Manhattan distance
		return Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
	}

	private static getPathCost(position: Position, paths: PathData): number {
		const index = position.y * paths.width + position.x
		if (index >= 0 && index < paths.data.length) {
			// If there's a path tile (non-zero), reduce the cost
			return paths.data[index] === 0 ? 0.5 : -0.5
		}
		return 0
	}

	private static getNeighbors(position: Position, collision: CollisionData, paths: PathData): Position[] {
		const neighbors: Position[] = []
		const directions = [
			{ x: 0, y: -1 }, // up
			{ x: 1, y: 0 },  // right
			{ x: 0, y: 1 },  // down
			{ x: -1, y: 0 }  // left
		]

		for (const dir of directions) {
			const newX = position.x + dir.x
			const newY = position.y + dir.y

			// Check bounds
			if (
				newX >= 0 && newX < collision.width &&
				newY >= 0 && newY < collision.height
			) {
				// Check collision
				const index = newY * collision.width + newX
				if (index >= 0 && index < collision.data.length && collision.data[index] === 0) {
					neighbors.push({ x: newX, y: newY })
				}
			}
		}

		return neighbors
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