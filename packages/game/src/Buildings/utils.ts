import type { BuildingDefinition, BuildingInstance } from './types'
import type { Position } from '../types'
import type { MapData } from '../Map/types'

export const DEFAULT_TILE_SIZE = 32

export const getRotatedFootprint = (definition: BuildingDefinition, rotation: number = 0): { width: number; height: number } => {
	const turns = ((rotation % 4) + 4) % 4
	if (turns % 2 === 1) {
		return { width: definition.footprint.height, height: definition.footprint.width }
	}
	return { width: definition.footprint.width, height: definition.footprint.height }
}

export const getBuildingFootprintBounds = (
	building: BuildingInstance,
	definition: BuildingDefinition,
	tileSize: number = DEFAULT_TILE_SIZE
): { minX: number; minY: number; maxX: number; maxY: number; footprint: { width: number; height: number } } => {
	const rotation = typeof building.rotation === 'number' ? building.rotation : 0
	const footprint = getRotatedFootprint(definition, rotation)
	return {
		minX: building.position.x,
		minY: building.position.y,
		maxX: building.position.x + footprint.width * tileSize,
		maxY: building.position.y + footprint.height * tileSize,
		footprint
	}
}

export const isWithinBuildingFootprint = (
	position: Position,
	building: BuildingInstance,
	definition: BuildingDefinition,
	tileSize: number = DEFAULT_TILE_SIZE
): boolean => {
	const bounds = getBuildingFootprintBounds(building, definition, tileSize)
	return position.x >= bounds.minX && position.x <= bounds.maxX && position.y >= bounds.minY && position.y <= bounds.maxY
}

export const getRandomPositionInBuildingFootprint = (
	building: BuildingInstance,
	definition: BuildingDefinition,
	map?: MapData | null
): Position => {
	const tileSize = map?.tiledMap?.tilewidth || DEFAULT_TILE_SIZE
	const bounds = getBuildingFootprintBounds(building, definition, tileSize)
	const originTileX = Math.floor(bounds.minX / tileSize)
	const originTileY = Math.floor(bounds.minY / tileSize)
	const tileX = originTileX + Math.floor(Math.random() * bounds.footprint.width)
	const tileY = originTileY + Math.floor(Math.random() * bounds.footprint.height)
	return {
		x: tileX * tileSize + tileSize / 2,
		y: tileY * tileSize + tileSize / 2
	}
}

export const findNearestWalkableTileOutsideFootprint = (
	building: BuildingInstance,
	definition: BuildingDefinition,
	map: MapData,
	reference: Position,
	maxRadiusTiles: number
): Position | null => {
	const tileSize = map.tiledMap?.tilewidth || DEFAULT_TILE_SIZE
	const bounds = getBuildingFootprintBounds(building, definition, tileSize)
	const originTileX = Math.floor(bounds.minX / tileSize)
	const originTileY = Math.floor(bounds.minY / tileSize)
	const maxTileX = Math.floor((bounds.maxX - 1) / tileSize)
	const maxTileY = Math.floor((bounds.maxY - 1) / tileSize)
	const width = map.collision.width
	const height = map.collision.height

	const isWalkable = (tileX: number, tileY: number): boolean => {
		if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) {
			return false
		}
		const index = tileY * width + tileX
		return map.collision.data[index] === 0
	}

	let bestX: number | null = null
	let bestY: number | null = null
	let bestDist = 0

	for (let radius = 1; radius <= maxRadiusTiles; radius += 1) {
		const startX = originTileX - radius
		const endX = maxTileX + radius
		const startY = originTileY - radius
		const endY = maxTileY + radius

		for (let tileX = startX; tileX <= endX; tileX += 1) {
			for (let tileY = startY; tileY <= endY; tileY += 1) {
				const onBoundary = tileX === startX || tileX === endX || tileY === startY || tileY === endY
				if (!onBoundary) {
					continue
				}
				const insideFootprint = tileX >= originTileX && tileX <= maxTileX && tileY >= originTileY && tileY <= maxTileY
				if (insideFootprint) {
					continue
				}
				if (!isWalkable(tileX, tileY)) {
					continue
				}
				const candidate = {
					x: tileX * tileSize + tileSize / 2,
					y: tileY * tileSize + tileSize / 2
				}
				const dx = reference.x - candidate.x
				const dy = reference.y - candidate.y
				const dist = Math.sqrt(dx * dx + dy * dy)
				if (bestX === null || dist < bestDist) {
					bestX = candidate.x
					bestY = candidate.y
					bestDist = dist
				}
			}
		}

		if (bestX !== null && bestY !== null) {
			return { x: bestX, y: bestY }
		}
	}

	return null
}
