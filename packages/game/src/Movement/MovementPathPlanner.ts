import type { MapId } from '../ids'
import type { MapManager } from '../Map'
import type { RoadData } from '../Roads/types'
import type { Position } from '../types'
import { calculateDistance } from '../utils'
import { buildSimulationPath, type SimulationPathData } from './SimulationPathBuilder'
import { OccupancyTracker } from './OccupancyTracker'
import { OCCUPIED_TILE_PATH_PENALTY } from './MovementConfig'

interface PathFinderOptions {
	allowDiagonal: boolean
	roadData?: RoadData
}

type RoadDataProvider = (mapId: MapId) => RoadData | null | undefined

export class MovementPathPlanner {
	constructor(
		private readonly mapManager: Pick<MapManager, 'getMap' | 'findPath' | 'findNearestWalkablePosition'>,
		private readonly getRoadData: RoadDataProvider
	) {}

	public findPrimaryPath(mapId: MapId, from: Position, to: Position): Position[] {
		const options: PathFinderOptions = {
			roadData: this.getRoadData(mapId) || undefined,
			allowDiagonal: true
		}
		return this.mapManager.findPath(mapId, from, to, options)
	}

	public findFallbackPath(mapId: MapId, from: Position, to: Position): Position[] {
		const fallback = this.mapManager.findNearestWalkablePosition(mapId, to, 2)
		if (!fallback) {
			return []
		}
		const options: PathFinderOptions = {
			roadData: this.getRoadData(mapId) || undefined,
			allowDiagonal: true
		}
		return this.mapManager.findPath(mapId, from, fallback, options)
	}

	public toSimulationPathData(mapId: MapId, path: Position[]): SimulationPathData {
		const map = this.mapManager.getMap(mapId)
		const tileWidth = map?.tiledMap?.tilewidth || 32
		const tileHeight = map?.tiledMap?.tileheight || 32
		return buildSimulationPath(path, tileWidth, tileHeight)
	}

	public calculatePathDistance(path: Position[]): number {
		if (path.length <= 1) {
			return 0
		}
		let total = 0
		for (let i = 1; i < path.length; i += 1) {
			total += calculateDistance(path[i - 1], path[i])
		}
		return total
	}

	public findReroutePath(
		mapId: MapId,
		currentPosition: Position,
		finalTarget: Position,
		blockedTileIndex: number,
		occupancy: OccupancyTracker
	): Position[] | null {
		const map = this.mapManager.getMap(mapId)
		if (!map) {
			return null
		}
		const roadData = this.getRoadData(mapId) || undefined

		const direct = this.mapManager.findPath(mapId, currentPosition, finalTarget, {
			roadData,
			allowDiagonal: true
		})
		if (direct.length > 1) {
			const firstDirectStep = direct[1]
			const firstDirectStepIndex = occupancy.getTileIndexForPosition(mapId, firstDirectStep)
			const heading = this.getSegmentHeading(mapId, currentPosition, firstDirectStep, occupancy)
			if (firstDirectStepIndex >= 0 && firstDirectStepIndex !== blockedTileIndex && occupancy.canEnterTile(mapId, firstDirectStepIndex, heading)) {
				return direct
			}
		}

		const tileWidth = map.tiledMap?.tilewidth || 32
		const tileHeight = map.tiledMap?.tileheight || 32
		const currentTileX = Math.floor(currentPosition.x / tileWidth)
		const currentTileY = Math.floor(currentPosition.y / tileHeight)
		const directions = [
			{ x: 0, y: -1 },
			{ x: 1, y: 0 },
			{ x: 0, y: 1 },
			{ x: -1, y: 0 },
			{ x: 1, y: -1 },
			{ x: 1, y: 1 },
			{ x: -1, y: 1 },
			{ x: -1, y: -1 }
		]

		let best: { path: Position[], score: number } | null = null
		for (const direction of directions) {
			const tileX = currentTileX + direction.x
			const tileY = currentTileY + direction.y
			if (tileX < 0 || tileY < 0 || tileX >= map.collision.width || tileY >= map.collision.height) {
				continue
			}
			const tileIndex = tileY * map.collision.width + tileX
			if (tileIndex === blockedTileIndex) {
				continue
			}
			if (map.collision.data[tileIndex] !== 0) {
				continue
			}

			const neighbor = {
				x: tileX * tileWidth + tileWidth / 2,
				y: tileY * tileHeight + tileHeight / 2
			}
			const heading = this.getSegmentHeading(mapId, currentPosition, neighbor, occupancy)
			if (!occupancy.canEnterTile(mapId, tileIndex, heading)) {
				continue
			}

			const nextPath = this.mapManager.findPath(mapId, neighbor, finalTarget, {
				roadData,
				allowDiagonal: true
			})
			if (nextPath.length === 0) {
				continue
			}

			const candidatePath: Position[] = [{ ...currentPosition }, ...nextPath]
			const score = this.scorePathWithOccupancy(mapId, candidatePath, occupancy)
			if (!best || score < best.score) {
				best = { path: candidatePath, score }
			}
		}

		return best?.path ?? null
	}

	private scorePathWithOccupancy(mapId: MapId, path: Position[], occupancy: OccupancyTracker): number {
		let score = this.calculatePathDistance(path)
		for (let i = 1; i < path.length; i += 1) {
			const tileIndex = occupancy.getTileIndexForPosition(mapId, path[i])
			if (tileIndex < 0) {
				continue
			}
			const count = occupancy.getTileOccupancyCount(mapId, tileIndex)
			if (count > 0) {
				score += OCCUPIED_TILE_PATH_PENALTY * count
			}
		}
		return score
	}

	private getSegmentHeading(mapId: MapId, from: Position, to: Position, occupancy: OccupancyTracker): number {
		const directionToCode: Record<string, number> = {
			'0,-1': 0,
			'1,-1': 1,
			'1,0': 2,
			'1,1': 3,
			'0,1': 4,
			'-1,1': 5,
			'-1,0': 6,
			'-1,-1': 7
		}
		const fromTile = occupancy.getTileCoordsForPosition(mapId, from)
		const toTile = occupancy.getTileCoordsForPosition(mapId, to)
		if (!fromTile || !toTile) {
			return 0
		}
		const dx = Math.sign(toTile.x - fromTile.x)
		const dy = Math.sign(toTile.y - fromTile.y)
		const key = `${dx},${dy}`
		return directionToCode[key] ?? 0
	}
}
