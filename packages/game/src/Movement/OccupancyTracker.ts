import type { MapId } from '../ids'
import type { MapManager } from '../Map'
import type { Position } from '../types'
import type { MovementEntity } from './types'

const NO_HEADING = -128
const STATIC_HEADING = -1

interface TileOccupancyGrid {
	width: number
	height: number
	tileWidth: number
	tileHeight: number
	count: Uint8Array
	headingA: Int8Array
	headingB: Int8Array
}

interface StaticOccupancyRef {
	mapId: MapId
	tileIndex: number
}

export class OccupancyTracker {
	private readonly occupancyByMap = new Map<MapId, TileOccupancyGrid>()
	private readonly staticOccupancyByEntity = new Map<string, StaticOccupancyRef>()
	private readonly staticEntitiesByTileByMap = new Map<MapId, Map<number, Set<string>>>()

	constructor(private readonly mapManager: Pick<MapManager, 'getMap'>) {}

	public clear(): void {
		this.occupancyByMap.clear()
		this.staticOccupancyByEntity.clear()
		this.staticEntitiesByTileByMap.clear()
	}

	public getTileIndexForPosition(mapId: MapId, position: Position): number {
		const grid = this.getOrCreateGrid(mapId)
		if (!grid) {
			return -1
		}
		const tileX = Math.floor(position.x / grid.tileWidth)
		const tileY = Math.floor(position.y / grid.tileHeight)
		if (tileX < 0 || tileY < 0 || tileX >= grid.width || tileY >= grid.height) {
			return -1
		}
		return tileY * grid.width + tileX
	}

	public getTileCoordsForPosition(mapId: MapId, position: Position): { x: number, y: number } | null {
		const grid = this.getOrCreateGrid(mapId)
		if (!grid) {
			return null
		}
		const tileX = Math.floor(position.x / grid.tileWidth)
		const tileY = Math.floor(position.y / grid.tileHeight)
		if (tileX < 0 || tileY < 0 || tileX >= grid.width || tileY >= grid.height) {
			return null
		}
		return { x: tileX, y: tileY }
	}

	public getTileCoordsFromIndex(mapId: MapId, tileIndex: number): { x: number, y: number } | null {
		const grid = this.getOrCreateGrid(mapId)
		if (!grid || tileIndex < 0) {
			return null
		}
		const tileY = Math.floor(tileIndex / grid.width)
		const tileX = tileIndex - tileY * grid.width
		if (tileX < 0 || tileY < 0 || tileX >= grid.width || tileY >= grid.height) {
			return null
		}
		return { x: tileX, y: tileY }
	}

	public isSingleStaticOccupancy(mapId: MapId, tileIndex: number): boolean {
		const grid = this.getOrCreateGrid(mapId)
		if (!grid || tileIndex < 0 || tileIndex >= grid.count.length) {
			return false
		}
		return grid.count[tileIndex] === 1 && grid.headingA[tileIndex] === STATIC_HEADING
	}

	public getTileOccupancyCount(mapId: MapId, tileIndex: number): number {
		const grid = this.getOrCreateGrid(mapId)
		if (!grid || tileIndex < 0 || tileIndex >= grid.count.length) {
			return 0
		}
		return grid.count[tileIndex]
	}

	public canEnterTile(mapId: MapId, tileIndex: number, heading: number): boolean {
		const grid = this.getOrCreateGrid(mapId)
		if (!grid || tileIndex < 0 || tileIndex >= grid.count.length) {
			return true
		}
		const count = grid.count[tileIndex]
		if (count === 0) {
			return true
		}
		if (count >= 2) {
			return false
		}

		const existingHeading = grid.headingA[tileIndex]
		if (existingHeading === STATIC_HEADING || existingHeading === NO_HEADING) {
			return false
		}
		return this.areOppositeDirections(existingHeading, heading)
	}

	public addTileOccupancy(mapId: MapId, tileIndex: number, heading: number): boolean {
		const grid = this.getOrCreateGrid(mapId)
		if (!grid || tileIndex < 0 || tileIndex >= grid.count.length) {
			return false
		}
		const count = grid.count[tileIndex]
		if (count === 0) {
			grid.headingA[tileIndex] = heading
			grid.headingB[tileIndex] = NO_HEADING
			grid.count[tileIndex] = 1
			return true
		}
		if (count === 1) {
			grid.headingB[tileIndex] = heading
			grid.count[tileIndex] = 2
			return true
		}
		grid.count[tileIndex] = Math.min(255, count + 1)
		return true
	}

	public removeTileOccupancy(mapId: MapId, tileIndex: number, heading: number): void {
		const grid = this.getOrCreateGrid(mapId)
		if (!grid || tileIndex < 0 || tileIndex >= grid.count.length) {
			return
		}
		const count = grid.count[tileIndex]
		if (count === 0) {
			return
		}
		if (count === 1) {
			grid.count[tileIndex] = 0
			grid.headingA[tileIndex] = NO_HEADING
			grid.headingB[tileIndex] = NO_HEADING
			return
		}

		const a = grid.headingA[tileIndex]
		const b = grid.headingB[tileIndex]
		if (a === heading) {
			grid.headingA[tileIndex] = b
			grid.headingB[tileIndex] = NO_HEADING
			grid.count[tileIndex] = count - 1
			return
		}
		if (b === heading) {
			grid.headingB[tileIndex] = NO_HEADING
			grid.count[tileIndex] = count - 1
			return
		}

		grid.count[tileIndex] = count - 1
		if (grid.count[tileIndex] <= 1) {
			grid.headingB[tileIndex] = NO_HEADING
		}
	}

	public markEntityStatic(entity: MovementEntity): void {
		const tileIndex = this.getTileIndexForPosition(entity.mapId, entity.position)
		if (tileIndex < 0) {
			this.clearEntityStatic(entity.id)
			return
		}

		const existing = this.staticOccupancyByEntity.get(entity.id)
		if (existing && existing.mapId === entity.mapId && existing.tileIndex === tileIndex) {
			return
		}

		if (existing) {
			this.removeTileOccupancy(existing.mapId, existing.tileIndex, STATIC_HEADING)
			this.removeEntityFromStaticTileIndex(existing.mapId, existing.tileIndex, entity.id)
		}

		if (!this.addTileOccupancy(entity.mapId, tileIndex, STATIC_HEADING)) {
			return
		}
		this.addEntityToStaticTileIndex(entity.mapId, tileIndex, entity.id)
		this.staticOccupancyByEntity.set(entity.id, { mapId: entity.mapId, tileIndex })
	}

	public clearEntityStatic(entityId: string): void {
		const existing = this.staticOccupancyByEntity.get(entityId)
		if (!existing) {
			return
		}
		this.removeTileOccupancy(existing.mapId, existing.tileIndex, STATIC_HEADING)
		this.removeEntityFromStaticTileIndex(existing.mapId, existing.tileIndex, entityId)
		this.staticOccupancyByEntity.delete(entityId)
	}

	public findEntityOnTile(
		mapId: MapId,
		tileIndex: number,
		excludeEntityId?: string
	): string | null {
		const entitiesOnTile = this.staticEntitiesByTileByMap.get(mapId)?.get(tileIndex)
		if (!entitiesOnTile || entitiesOnTile.size === 0) {
			return null
		}
		for (const entityId of entitiesOnTile) {
			if (excludeEntityId && entityId === excludeEntityId) {
				continue
			}
			return entityId
		}
		return null
	}

	public findIdleBlockingEntity(
		mapId: MapId,
		tileIndex: number,
		requesterEntityId: string,
		hasActiveMovement: (entityId: string) => boolean
	): string | null {
		const entitiesOnTile = this.staticEntitiesByTileByMap.get(mapId)?.get(tileIndex)
		if (!entitiesOnTile || entitiesOnTile.size === 0) {
			return null
		}
		for (const entityId of entitiesOnTile) {
			if (entityId === requesterEntityId) {
				continue
			}
			if (hasActiveMovement(entityId)) {
				continue
			}
			return entityId
		}
		return null
	}

	public isTileFreeForYield(mapId: MapId, tileX: number, tileY: number, ignoreEntityId?: string): boolean {
		const map = this.mapManager.getMap(mapId)
		if (!map) {
			return false
		}
		if (tileX < 0 || tileY < 0 || tileX >= map.collision.width || tileY >= map.collision.height) {
			return false
		}
		const tileIndex = tileY * map.collision.width + tileX
		if (map.collision.data[tileIndex] !== 0) {
			return false
		}

		const count = this.getTileOccupancyCount(mapId, tileIndex)
		if (count === 0) {
			return true
		}
		if (!ignoreEntityId) {
			return false
		}

		const ignored = this.staticOccupancyByEntity.get(ignoreEntityId)
		if (!ignored || ignored.mapId !== mapId || ignored.tileIndex !== tileIndex) {
			return false
		}
		return count === 1
	}

	private getOrCreateGrid(mapId: MapId): TileOccupancyGrid | null {
		const existing = this.occupancyByMap.get(mapId)
		if (existing) {
			return existing
		}

		const map = this.mapManager.getMap(mapId)
		if (!map) {
			return null
		}

		const width = map.collision.width
		const height = map.collision.height
		if (width <= 0 || height <= 0) {
			return null
		}
		const tileWidth = map.tiledMap?.tilewidth || 32
		const tileHeight = map.tiledMap?.tileheight || 32
		const size = width * height
		const grid: TileOccupancyGrid = {
			width,
			height,
			tileWidth,
			tileHeight,
			count: new Uint8Array(size),
			headingA: new Int8Array(size),
			headingB: new Int8Array(size)
		}
		grid.headingA.fill(NO_HEADING)
		grid.headingB.fill(NO_HEADING)
		this.occupancyByMap.set(mapId, grid)
		return grid
	}

	private addEntityToStaticTileIndex(mapId: MapId, tileIndex: number, entityId: string): void {
		let byTile = this.staticEntitiesByTileByMap.get(mapId)
		if (!byTile) {
			byTile = new Map()
			this.staticEntitiesByTileByMap.set(mapId, byTile)
		}
		let entityIds = byTile.get(tileIndex)
		if (!entityIds) {
			entityIds = new Set()
			byTile.set(tileIndex, entityIds)
		}
		entityIds.add(entityId)
	}

	private removeEntityFromStaticTileIndex(mapId: MapId, tileIndex: number, entityId: string): void {
		const byTile = this.staticEntitiesByTileByMap.get(mapId)
		if (!byTile) {
			return
		}
		const entityIds = byTile.get(tileIndex)
		if (!entityIds) {
			return
		}
		entityIds.delete(entityId)
		if (entityIds.size === 0) {
			byTile.delete(tileIndex)
		}
		if (byTile.size === 0) {
			this.staticEntitiesByTileByMap.delete(mapId)
		}
	}

	private areOppositeDirections(a: number, b: number): boolean {
		if (a < 0 || b < 0) {
			return false
		}
		return ((a + 4) % 8) === b
	}
}
