import { ConstructionStage } from './types'
import { RoadType } from '../Roads/types'
import type { Position } from '../types'

export type TilePosition = { x: number; y: number }

export interface RoadGridData {
	width: number
	height: number
	data: Array<RoadType | null>
}

interface RoadNetwork {
	tileByKey: Map<string, TilePosition>
	adjacencyByKey: Map<string, TilePosition[]>
}

interface RoadNetworkSegment {
	id: string
	startKey: string
	endKey: string
	tiles: TilePosition[]
}

export interface MarketRoadBlockadeBuilding {
	mapId: string
	playerId: string
	position: Position
	rotation?: number
	stage?: ConstructionStage | string
	buildingId: string
}

export interface MarketRoadBlockadeDefinition {
	footprint: { width: number; height: number }
	marketRoadBlockade?: boolean
}

const tileKey = (tile: TilePosition): string => `${tile.x},${tile.y}`

const isBlockedRoadTile = (
	blockedRoadTiles: ReadonlySet<string> | undefined,
	tile: TilePosition
): boolean => blockedRoadTiles?.has(tileKey(tile)) ?? false

export const toTile = (position: Position, tileSize: number): TilePosition => ({
	x: Math.floor(position.x / tileSize),
	y: Math.floor(position.y / tileSize)
})

export const isRoadTile = (
	roadData: RoadGridData | null,
	tile: TilePosition
): boolean => {
	if (!roadData) {
		return false
	}
	if (tile.x < 0 || tile.y < 0 || tile.x >= roadData.width || tile.y >= roadData.height) {
		return false
	}
	const index = tile.y * roadData.width + tile.x
	const roadType = roadData.data[index] ?? RoadType.None
	return roadType !== RoadType.None
}

export const findClosestRoadTile = (
	roadData: RoadGridData | null,
	origin: TilePosition,
	maxRadius: number,
	blockedRoadTiles?: ReadonlySet<string>
): TilePosition | null => {
	if (!roadData) {
		return null
	}
	if (isRoadTile(roadData, origin) && !isBlockedRoadTile(blockedRoadTiles, origin)) {
		return origin
	}
	for (let radius = 1; radius <= maxRadius; radius += 1) {
		for (let dx = -radius; dx <= radius; dx += 1) {
			const dy = radius - Math.abs(dx)
			const candidates = [
				{ x: origin.x + dx, y: origin.y + dy },
				{ x: origin.x + dx, y: origin.y - dy }
			]
			for (const candidate of candidates) {
				if (isRoadTile(roadData, candidate) && !isBlockedRoadTile(blockedRoadTiles, candidate)) {
					return candidate
				}
			}
		}
	}
	return null
}

const getRoadNeighbors = (
	roadData: RoadGridData,
	tile: TilePosition,
	blockedRoadTiles?: ReadonlySet<string>
): TilePosition[] => {
	if (blockedRoadTiles?.has(tileKey(tile))) {
		return []
	}
	const neighbors = [
		{ x: tile.x, y: tile.y - 1 },
		{ x: tile.x + 1, y: tile.y },
		{ x: tile.x, y: tile.y + 1 },
		{ x: tile.x - 1, y: tile.y }
	]
	return neighbors.filter((neighbor) =>
		isRoadTile(roadData, neighbor) && !isBlockedRoadTile(blockedRoadTiles, neighbor)
	)
}

const sameTile = (a: TilePosition, b: TilePosition): boolean => a.x === b.x && a.y === b.y

const undirectedEdgeKey = (a: TilePosition, b: TilePosition): string => {
	const aKey = tileKey(a)
	const bKey = tileKey(b)
	return aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`
}

const directionRank = (from: TilePosition, to: TilePosition): number => {
	const dx = to.x - from.x
	const dy = to.y - from.y
	if (dx === 0 && dy === -1) {
		return 0
	}
	if (dx === 1 && dy === 0) {
		return 1
	}
	if (dx === 0 && dy === 1) {
		return 2
	}
	if (dx === -1 && dy === 0) {
		return 3
	}
	return 4
}

const isStraightThrough = (tile: TilePosition, neighbors: TilePosition[]): boolean => {
	if (neighbors.length !== 2) {
		return false
	}
	const a = neighbors[0]
	const b = neighbors[1]
	const ax = a.x - tile.x
	const ay = a.y - tile.y
	const bx = b.x - tile.x
	const by = b.y - tile.y
	return ax === -bx && ay === -by
}

const discoverRoadNetwork = (
	roadData: RoadGridData,
	start: TilePosition,
	maxSteps: number,
	blockedRoadTiles?: ReadonlySet<string>
): RoadNetwork => {
	const startKey = tileKey(start)
	const queue: TilePosition[] = [start]
	let head = 0
	const distanceByKey = new Map<string, number>([[startKey, 0]])
	const tileByKey = new Map<string, TilePosition>([[startKey, start]])

	while (head < queue.length) {
		const current = queue[head]
		head += 1
		const currentKey = tileKey(current)
		const currentDistance = distanceByKey.get(currentKey) ?? 0
		if (currentDistance >= maxSteps) {
			continue
		}
		const neighbors = getRoadNeighbors(roadData, current, blockedRoadTiles).sort((a, b) => {
			const rankDelta = directionRank(current, a) - directionRank(current, b)
			if (rankDelta !== 0) {
				return rankDelta
			}
			if (a.y !== b.y) {
				return a.y - b.y
			}
			return a.x - b.x
		})
		for (const neighbor of neighbors) {
			const neighborKey = tileKey(neighbor)
			if (distanceByKey.has(neighborKey)) {
				continue
			}
			distanceByKey.set(neighborKey, currentDistance + 1)
			tileByKey.set(neighborKey, neighbor)
			queue.push(neighbor)
		}
	}

	const adjacencyByKey = new Map<string, TilePosition[]>()
	for (const [key, tile] of tileByKey.entries()) {
		const neighbors = getRoadNeighbors(roadData, tile, blockedRoadTiles)
			.filter((neighbor) => tileByKey.has(tileKey(neighbor)))
			.sort((a, b) => {
				const rankDelta = directionRank(tile, a) - directionRank(tile, b)
				if (rankDelta !== 0) {
					return rankDelta
				}
				if (a.y !== b.y) {
					return a.y - b.y
				}
				return a.x - b.x
			})
		adjacencyByKey.set(key, neighbors)
	}

	return { tileByKey, adjacencyByKey }
}

const buildRoadSegments = (
	network: RoadNetwork,
	start: TilePosition
): Map<string, RoadNetworkSegment[]> => {
	const nodeKeys = new Set<string>()
	const startKey = tileKey(start)

	for (const [key, tile] of network.tileByKey.entries()) {
		const neighbors = network.adjacencyByKey.get(key) ?? []
		if (key === startKey || neighbors.length !== 2 || !isStraightThrough(tile, neighbors)) {
			nodeKeys.add(key)
		}
	}

	const orderedNodeKeys = Array.from(nodeKeys.values()).sort((a, b) => {
		const aTile = network.tileByKey.get(a)
		const bTile = network.tileByKey.get(b)
		if (!aTile || !bTile) {
			return a.localeCompare(b)
		}
		const da = Math.abs(aTile.x - start.x) + Math.abs(aTile.y - start.y)
		const db = Math.abs(bTile.x - start.x) + Math.abs(bTile.y - start.y)
		if (da !== db) {
			return da - db
		}
		if (aTile.y !== bTile.y) {
			return aTile.y - bTile.y
		}
		return aTile.x - bTile.x
	})

	const traversedEdges = new Set<string>()
	const segmentsByNode = new Map<string, RoadNetworkSegment[]>()
	let segmentCounter = 0

	for (const nodeKey of orderedNodeKeys) {
		const nodeTile = network.tileByKey.get(nodeKey)
		if (!nodeTile) {
			continue
		}
		const neighbors = network.adjacencyByKey.get(nodeKey) ?? []
		for (const neighbor of neighbors) {
			const firstEdgeKey = undirectedEdgeKey(nodeTile, neighbor)
			if (traversedEdges.has(firstEdgeKey)) {
				continue
			}

			const tiles: TilePosition[] = [nodeTile]
			let previous = nodeTile
			let current = neighbor
			traversedEdges.add(firstEdgeKey)

			while (true) {
				tiles.push(current)
				const currentKey = tileKey(current)
				if (nodeKeys.has(currentKey)) {
					break
				}

				const nextCandidates = (network.adjacencyByKey.get(currentKey) ?? []).filter(
					(candidate) => !sameTile(candidate, previous)
				)
				if (nextCandidates.length === 0) {
					break
				}
				const next = nextCandidates.sort((a, b) => {
					const rankDelta = directionRank(current, a) - directionRank(current, b)
					if (rankDelta !== 0) {
						return rankDelta
					}
					if (a.y !== b.y) {
						return a.y - b.y
					}
					return a.x - b.x
				})[0]
				traversedEdges.add(undirectedEdgeKey(current, next))
				previous = current
				current = next
			}

			const endKey = tileKey(current)
			if (tiles.length <= 1) {
				continue
			}

			const segment: RoadNetworkSegment = {
				id: `seg-${segmentCounter}`,
				startKey: nodeKey,
				endKey,
				tiles
			}
			segmentCounter += 1

			segmentsByNode.set(nodeKey, [...(segmentsByNode.get(nodeKey) ?? []), segment])
			if (endKey !== nodeKey) {
				segmentsByNode.set(endKey, [...(segmentsByNode.get(endKey) ?? []), segment])
			}
		}
	}

	for (const [nodeKey, segments] of segmentsByNode.entries()) {
		const nodeTile = network.tileByKey.get(nodeKey)
		if (!nodeTile) {
			continue
		}
		segments.sort((a, b) => {
			const aRef = a.startKey === nodeKey ? a.tiles[1] : a.tiles[a.tiles.length - 2]
			const bRef = b.startKey === nodeKey ? b.tiles[1] : b.tiles[b.tiles.length - 2]
			const aRank = aRef ? directionRank(nodeTile, aRef) : 99
			const bRank = bRef ? directionRank(nodeTile, bRef) : 99
			if (aRank !== bRank) {
				return aRank - bRank
			}
			if (a.tiles.length !== b.tiles.length) {
				return b.tiles.length - a.tiles.length
			}
			return a.id.localeCompare(b.id)
		})
	}

	return segmentsByNode
}

export const buildRoadNetworkWalk = (
	roadData: RoadGridData | null,
	start: TilePosition | null,
	maxSteps: number,
	blockedRoadTiles?: ReadonlySet<string>
): TilePosition[] => {
	if (!roadData || !start || maxSteps <= 0) {
		return []
	}
	if (isBlockedRoadTile(blockedRoadTiles, start)) {
		return []
	}

	const network = discoverRoadNetwork(roadData, start, maxSteps, blockedRoadTiles)
	const startKey = tileKey(start)
	const segmentsByNode = buildRoadSegments(network, start)
	const route: TilePosition[] = [start]
	const visitedSegments = new Set<string>()

	const appendSegment = (segment: RoadNetworkSegment, fromNodeKey: string) => {
		const orientedTiles = fromNodeKey === segment.startKey ? segment.tiles : [...segment.tiles].reverse()
		for (const tile of orientedTiles) {
			const last = route[route.length - 1]
			if (last && sameTile(last, tile)) {
				continue
			}
			route.push(tile)
		}
	}

	const traverse = (nodeKey: string, mustReturnToNode: boolean) => {
		const connected = segmentsByNode.get(nodeKey) ?? []
		for (const segment of connected) {
			if (visitedSegments.has(segment.id)) {
				continue
			}
			visitedSegments.add(segment.id)

			const nextNodeKey = segment.startKey === nodeKey ? segment.endKey : segment.startKey
			appendSegment(segment, nodeKey)

			if (nextNodeKey !== nodeKey) {
				traverse(nextNodeKey, true)
			}

			const hasMoreAtNode = (segmentsByNode.get(nodeKey) ?? []).some(
				(candidate) => !visitedSegments.has(candidate.id)
			)
			if (mustReturnToNode || hasMoreAtNode) {
				appendSegment(segment, nextNodeKey)
			}
		}
	}

	traverse(startKey, false)
	return route
}

const getRotationStep = (rotation: number | undefined): number => {
	if (typeof rotation !== 'number' || !Number.isFinite(rotation)) {
		return 0
	}
	const halfPi = Math.PI / 2
	const normalized = Math.round(rotation / halfPi)
	return ((normalized % 4) + 4) % 4
}

const getRotatedFootprint = (
	footprint: { width: number; height: number },
	rotation: number | undefined
): { width: number; height: number } => {
	const step = getRotationStep(rotation)
	if (step % 2 === 0) {
		return footprint
	}
	return { width: footprint.height, height: footprint.width }
}

export const buildMarketRoadBlockadeTiles = (
	buildings: MarketRoadBlockadeBuilding[],
	getDefinition: (buildingId: string) => MarketRoadBlockadeDefinition | undefined,
	mapId: string,
	playerId: string,
	tileSize: number
): Set<string> => {
	const blockedRoadTiles = new Set<string>()
	for (const building of buildings) {
		if (building.mapId !== mapId || building.playerId !== playerId) {
			continue
		}
		if (building.stage !== ConstructionStage.Completed) {
			continue
		}
		const buildingDefinition = getDefinition(building.buildingId)
		if (!buildingDefinition?.marketRoadBlockade) {
			continue
		}
		const footprint = getRotatedFootprint(buildingDefinition.footprint, building.rotation)
		const origin = toTile(building.position, tileSize)
		for (let tileY = 0; tileY < footprint.height; tileY += 1) {
			for (let tileX = 0; tileX < footprint.width; tileX += 1) {
				blockedRoadTiles.add(`${origin.x + tileX},${origin.y + tileY}`)
			}
		}
	}
	return blockedRoadTiles
}
