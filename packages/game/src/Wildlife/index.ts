import { BaseManager } from '../Managers'
import type { MapManager } from '../Map'
import type { MapData } from '../Map/types'
import type { MapObjectsManager } from '../MapObjects'
import type { ResourceNodesManager } from '../ResourceNodes'
import { EventManager } from '../events'
import { Logger } from '../Logs'
import { SimulationEvents } from '../Simulation/events'
import { Position } from '../types'
import type { SimulationTickData } from '../Simulation/types'

interface ForestMask {
	width: number
	height: number
	mask: Uint8Array
}

interface ForestDensityData {
	width: number
	height: number
	prefixSum: Int32Array
	radius: number
	windowSize: number
}

export interface ForestSpawnPoint {
	position: Position
	tileX: number
	tileY: number
	density: number
}

export interface ForestSpawnConfig {
	nodeTypes: string[]
	densityRadiusTiles: number
	minDensity: number
	minDistanceTiles: number
	maxSpawnPoints: number
	verifyIntervalMs: number
	requireFullWindow: boolean
}

export interface WildlifeDeps {
	map: MapManager
	mapObjects: MapObjectsManager
	resourceNodes: ResourceNodesManager
}

const DEFAULT_FOREST_CONFIG: ForestSpawnConfig = {
	nodeTypes: ['tree'],
	densityRadiusTiles: 3,
	minDensity: 0.08,
	minDistanceTiles: 6,
	maxSpawnPoints: 4,
	verifyIntervalMs: 60000,
	requireFullWindow: true
}

export class WildlifeManager extends BaseManager<WildlifeDeps> {
	private forestConfig: ForestSpawnConfig
	private forestMasks = new Map<string, ForestMask>()
	private forestDensity = new Map<string, ForestDensityData>()
	private deerSpawnPoints = new Map<string, ForestSpawnPoint[]>()
	private verifyElapsedMs = 0

	constructor(
		managers: WildlifeDeps,
		private event: EventManager,
		private logger: Logger,
		config: Partial<ForestSpawnConfig> = {}
	) {
		super(managers)
		this.forestConfig = { ...DEFAULT_FOREST_CONFIG, ...config }
		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		this.event.on(SimulationEvents.SS.Tick, (data: SimulationTickData) => {
			if (this.forestConfig.verifyIntervalMs <= 0) return
			this.verifyElapsedMs += data.deltaMs
			if (this.verifyElapsedMs < this.forestConfig.verifyIntervalMs) return
			this.verifyElapsedMs = 0
			this.verifyForestSpawnPoints()
		})
	}

	public initializeForestSpawns(): void {
		const mapIds = this.managers.map.getMapIds()
		if (mapIds.length === 0) {
			this.logger.debug('[WildlifeManager] No maps available for forest spawn generation')
			return
		}

		for (const mapId of mapIds) {
			this.generateForestSpawnsForMap(mapId)
		}
	}

	public getDeerSpawnPoints(mapId: string): Position[] {
		return (this.deerSpawnPoints.get(mapId) || []).map(spawn => spawn.position)
	}

	public getDeerSpawnDetails(mapId: string): ForestSpawnPoint[] {
		return this.deerSpawnPoints.get(mapId) || []
	}

	private verifyForestSpawnPoints(): void {
		for (const [mapId, spawns] of this.deerSpawnPoints.entries()) {
			if (spawns.length === 0) continue

			const mapData = this.managers.map.getMap(mapId)
			if (!mapData) continue

			const mask = this.buildForestMask(mapId, mapData)
			if (!mask) {
				this.forestMasks.delete(mapId)
				this.forestDensity.delete(mapId)
				this.deerSpawnPoints.set(mapId, [])
				continue
			}

			this.forestMasks.set(mapId, mask)
			const density = this.buildForestDensity(mask)
			this.forestDensity.set(mapId, density)
			const invalid = spawns.some(spawn => !this.isSpawnPointValid(mapId, mapData, mask, density, spawn))
			if (!invalid) continue

			this.logger.debug(`[WildlifeManager] Regenerating deer spawns for ${mapId} (forest changed)`) 
			this.generateForestSpawnsForMap(mapId)
		}
	}

	private generateForestSpawnsForMap(mapId: string): void {
		const mapData = this.managers.map.getMap(mapId)
		if (!mapData) return

		const mask = this.buildForestMask(mapId, mapData)
		if (!mask) {
			this.logger.debug(`[WildlifeManager] No forest nodes found for ${mapId}`)
			this.forestMasks.delete(mapId)
			this.forestDensity.delete(mapId)
			this.deerSpawnPoints.set(mapId, [])
			return
		}

		this.forestMasks.set(mapId, mask)
		const density = this.buildForestDensity(mask)
		this.forestDensity.set(mapId, density)

		const spawns = this.selectSpawnPoints(mapId, mapData, mask, density)
		this.deerSpawnPoints.set(mapId, spawns)

		this.logger.log(`[WildlifeManager] Generated ${spawns.length} deer spawn points for ${mapId}`)
	}

	private buildForestMask(mapId: string, mapData: MapData): ForestMask | null {
		const width = mapData.tiledMap.width
		const height = mapData.tiledMap.height
		const mask = new Uint8Array(width * height)

		const nodeTypes = this.forestConfig.nodeTypes.length > 0 ? this.forestConfig.nodeTypes : ['tree']
		let hasNodes = false

		for (const nodeType of nodeTypes) {
			const nodes = this.managers.resourceNodes.getNodes(mapId, nodeType)
			if (nodes.length === 0) continue
			hasNodes = true

			for (const node of nodes) {
				const tileX = Math.floor(node.position.x / mapData.tiledMap.tilewidth)
				const tileY = Math.floor(node.position.y / mapData.tiledMap.tileheight)
				if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) continue
				mask[tileY * width + tileX] = 1
			}
		}

		if (!hasNodes) return null

		return { width, height, mask }
	}

	private buildForestDensity(mask: ForestMask): ForestDensityData {
		const { width, height } = mask
		const prefixSum = new Int32Array((width + 1) * (height + 1))

		for (let y = 1; y <= height; y++) {
			const rowOffset = y * (width + 1)
			const prevOffset = (y - 1) * (width + 1)
			for (let x = 1; x <= width; x++) {
				const maskIndex = (y - 1) * width + (x - 1)
				prefixSum[rowOffset + x] =
					prefixSum[rowOffset + x - 1] +
					prefixSum[prevOffset + x] -
					prefixSum[prevOffset + x - 1] +
					(mask.mask[maskIndex] || 0)
			}
		}

		const radius = this.forestConfig.densityRadiusTiles
		const windowSize = (radius * 2 + 1) ** 2
		return { width, height, prefixSum, radius, windowSize }
	}

	private selectSpawnPoints(mapId: string, mapData: MapData, mask: ForestMask, density: ForestDensityData): ForestSpawnPoint[] {
		if (this.forestConfig.maxSpawnPoints <= 0) {
			return []
		}

		const candidates: Array<{ x: number, y: number, density: number }> = []
		const radius = density.radius
		const minDensity = this.forestConfig.minDensity
		const requireFullWindow = this.forestConfig.requireFullWindow

		const startX = requireFullWindow ? radius : 0
		const startY = requireFullWindow ? radius : 0
		const endX = requireFullWindow ? mask.width - radius : mask.width
		const endY = requireFullWindow ? mask.height - radius : mask.height

		for (let y = startY; y < endY; y++) {
			for (let x = startX; x < endX; x++) {
				const index = y * mask.width + x
				if (mask.mask[index] === 0) continue
				if (this.isCollisionTile(mapData, x, y)) continue
				if (!this.canSpawnAt(mapId, mapData, x, y)) continue

				const tileDensity = this.getDensityAt(x, y, density)
				if (tileDensity < minDensity) continue

				candidates.push({ x, y, density: tileDensity })
			}
		}

		candidates.sort((a, b) => {
			if (b.density !== a.density) return b.density - a.density
			if (a.y !== b.y) return a.y - b.y
			return a.x - b.x
		})

		const selected: ForestSpawnPoint[] = []
		const minDistance = Math.max(0, this.forestConfig.minDistanceTiles)
		const minDistanceSq = minDistance * minDistance
		const tileWidth = mapData.tiledMap.tilewidth
		const tileHeight = mapData.tiledMap.tileheight

		for (const candidate of candidates) {
			let tooClose = false
			for (const existing of selected) {
				const dx = existing.tileX - candidate.x
				const dy = existing.tileY - candidate.y
				if ((dx * dx + dy * dy) < minDistanceSq) {
					tooClose = true
					break
				}
			}

			if (tooClose) continue

			selected.push({
				position: {
					x: candidate.x * tileWidth + tileWidth / 2,
					y: candidate.y * tileHeight + tileHeight / 2
				},
				tileX: candidate.x,
				tileY: candidate.y,
				density: candidate.density
			})

			if (selected.length >= this.forestConfig.maxSpawnPoints) break
		}

		return selected
	}

	private getDensityAt(x: number, y: number, density: ForestDensityData): number {
		const radius = density.radius
		const width = density.width
		const height = density.height

		let x0 = x - radius
		let y0 = y - radius
		let x1 = x + radius
		let y1 = y + radius

		if (!this.forestConfig.requireFullWindow) {
			if (x0 < 0) x0 = 0
			if (y0 < 0) y0 = 0
			if (x1 >= width) x1 = width - 1
			if (y1 >= height) y1 = height - 1
		}

		if (x0 < 0 || y0 < 0 || x1 >= width || y1 >= height) {
			return 0
		}

		const prefix = density.prefixSum
		const rowSize = width + 1
		const sum =
			prefix[(y1 + 1) * rowSize + (x1 + 1)] -
			prefix[y0 * rowSize + (x1 + 1)] -
			prefix[(y1 + 1) * rowSize + x0] +
			prefix[y0 * rowSize + x0]

		const total = this.forestConfig.requireFullWindow
			? density.windowSize
			: (x1 - x0 + 1) * (y1 - y0 + 1)

		return total === 0 ? 0 : sum / total
	}

	private isCollisionTile(mapData: MapData, tileX: number, tileY: number): boolean {
		const collision = mapData.collision
		if (!collision?.data || collision.width === 0 || collision.height === 0) return false
		if (tileX < 0 || tileY < 0 || tileX >= collision.width || tileY >= collision.height) return true

		const index = tileY * collision.width + tileX
		return collision.data[index] !== 0
	}

	private canSpawnAt(mapId: string, mapData: MapData, tileX: number, tileY: number): boolean {
		const tileWidth = mapData.tiledMap.tilewidth
		const tileHeight = mapData.tiledMap.tileheight
		const position = {
			x: tileX * tileWidth,
			y: tileY * tileHeight
		}

		return this.managers.mapObjects.canPlaceAt(mapId, position)
	}

	private isSpawnPointValid(mapId: string, mapData: MapData, mask: ForestMask, density: ForestDensityData, spawn: ForestSpawnPoint): boolean {
		const index = spawn.tileY * mask.width + spawn.tileX
		if (mask.mask[index] === 0) return false
		if (this.isCollisionTile(mapData, spawn.tileX, spawn.tileY)) return false
		if (!this.canSpawnAt(mapId, mapData, spawn.tileX, spawn.tileY)) return false

		const tileDensity = this.getDensityAt(spawn.tileX, spawn.tileY, density)
		return tileDensity >= this.forestConfig.minDensity
	}
}
