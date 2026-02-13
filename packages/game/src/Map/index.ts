import { EventManager, Event, EventClient } from '../events'
import type { MapData, MapLayer, MapObjectLayer, MapLoadData, MapTransitionData, CollisionData, NPCSpots, NPCSpot, PathData, MapTrigger, TiledMap, MapUrlService, GroundType, TiledTileset } from './types'
import type { RoadData } from '../Roads/types'
import { MapEvents } from './events'
import { Receiver } from '../Receiver'
import { PlayerJoinData, PlayerTransitionData } from '../Players/types'
import { Position } from '../types'
import { Trigger, TriggerOption } from '../Triggers/types'
import fs from 'fs'
import path from 'path'
import { Pathfinder } from './pathfinding'
import { Logger } from '../Logs'

const FETCH = true//typeof window !== 'undefined'

export class MapManager {
	private maps: Map<string, MapData> = new Map()
	private baseCollision: Map<string, number[]> = new Map()
	private dynamicCollisionCounts: Map<string, Int16Array> = new Map()
	private readonly MAPS_DIR = '/assets/maps/'//FETCH ? '/assets/maps/' : path.join(__dirname, '../../../assets/maps')
	private debug = true
	private defaultMapId: string = 'town' // Default starting map
	private readonly groundColumnOrder: GroundType[] = [
		'grass',
		'dirt',
		'sand',
		'rock',
		'mountain',
		'water_shallow',
		'water_deep',
		'mud'
	] as GroundType[]

	private decodeRleLayerData(tiledMap: TiledMap): void {
		const total = tiledMap.width * tiledMap.height
		if (!Number.isFinite(total) || total <= 0) return
		for (const layer of tiledMap.layers || []) {
			if (layer.type !== 'tilelayer' || layer.encoding !== 'rle' || !Array.isArray(layer.data)) continue
			const encoded = layer.data
			const decoded = new Array<number>(total)
			let offset = 0
			for (let i = 0; i < encoded.length; i += 2) {
				if (offset >= total) break
				const value = encoded[i] ?? 0
				const count = encoded[i + 1] ?? 0
				if (count <= 0) continue
				const end = Math.min(total, offset + count)
				decoded.fill(value, offset, end)
				offset = end
			}
			if (offset < total) {
				decoded.fill(0, offset)
			}
			layer.data = decoded
			delete (layer as any).encoding
		}
	}

	constructor(
		private event: EventManager,
		private mapUrlService: MapUrlService | undefined,
		private logger: Logger
	) {
		this.setupEventHandlers()
	}

	private extractPathsData(tiledMap: any): PathData {
		const pathsLayer = tiledMap.layers.find((layer: any) => layer.name === 'paths')
		if (!pathsLayer || !pathsLayer.data) {
			return {
				width: tiledMap.width,
				height: tiledMap.height,
				data: new Array(tiledMap.width * tiledMap.height).fill(0)
			}
		}

		return {
			width: tiledMap.width,
			height: tiledMap.height,
			data: pathsLayer.data
		}
	}

	private extractNPCSpots(tiledMap: any): NPCSpots {
		const npcSpots: NPCSpots = {}
		const npcLayer = tiledMap.layers.find((layer: any) => layer.name === 'npc')
		
		if (npcLayer && npcLayer.objects) {
			for (const obj of npcLayer.objects) {
				const [npcId, spotName] = obj.name.split(':')
				if (!npcId || !spotName) continue

				if (!npcSpots[npcId]) {
					npcSpots[npcId] = {}
				}

				// Calculate center position using width and height
				const centerX = obj.x + (obj.width || 0) / 2
				const centerY = obj.y + (obj.height || 0) / 2

				npcSpots[npcId][spotName] = {
					position: {
						x: centerX,
						y: centerY
					},
					properties: obj.properties || []
				}
			}
		}
		
		return npcSpots
	}

	private extractCollisionData(tiledMap: any): CollisionData {
		const collisionLayer = tiledMap.layers.find((layer: any) => layer.name === 'collision')
		if (!collisionLayer || !collisionLayer.data) {
			return {
				width: tiledMap.width,
				height: tiledMap.height,
				data: new Array(tiledMap.width * tiledMap.height).fill(0)
			}
		}

		return {
			width: tiledMap.width,
			height: tiledMap.height,
			data: collisionLayer.data
		}
	}

	private extractSpawnPoints(tiledMap: any): Position[] {
		const spawnPoints: Position[] = []
		const spawnLayer = tiledMap.layers.find((layer: any) => layer.name === 'spawn_points')
		
		if (spawnLayer && spawnLayer.objects) {
			for (const obj of spawnLayer.objects) {
				// Calculate center position using width and height
				const centerX = obj.x + (obj.width || 0) / 2
				const centerY = obj.y + (obj.height || 0) / 2
				
				spawnPoints.push({
					x: centerX,
					y: centerY
				})
			}
		}
		
		return spawnPoints
	}

	private extractTriggers(tiledMap: any): MapTrigger[] {
		const triggers: MapTrigger[] = []
		const triggerLayer = tiledMap.layers.find((layer: any) => layer.name === 'triggers')
		
		if (triggerLayer && triggerLayer.objects) {
			for (const obj of triggerLayer.objects) {
				const trigger: MapTrigger = {
					id: obj.name,
					position: {
						x: obj.x,
						y: obj.y
					},
					width: obj.width || 32, // default to tile size if not specified
					height: obj.height || 32
				}

				triggers.push(trigger)
			}
		}
		
		return triggers
	}

	private extractResourceNodes(tiledMap: any, mapId: string): import('../ResourceNodes/types').ResourceNodeSpawn[] {
		const resourceLayer = tiledMap.layers.find((layer: any) => layer.name === 'resource_nodes')
		if (!resourceLayer || !resourceLayer.objects) {
			return []
		}

		const tileWidth = tiledMap.tilewidth || 32
		const tileHeight = tiledMap.tileheight || 32
		const nodes: import('../ResourceNodes/types').ResourceNodeSpawn[] = []

		for (const obj of resourceLayer.objects) {
			const properties = Array.isArray(obj.properties) ? obj.properties : []
			const getProperty = (name: string) => properties.find((prop: any) => prop.name === name)?.value
			const nodeType = getProperty('nodeType') || (typeof obj.name === 'string' && obj.name.startsWith('resource:') ? obj.name.split(':')[1] : obj.type)
			if (!nodeType) {
				continue
			}

			const tileBased = getProperty('tileBased')
			const quantity = getProperty('quantity')
			const depositType = getProperty('depositType')

			const position = tileBased
				? {
					x: Math.round(obj.x / tileWidth),
					y: Math.round(obj.y / tileHeight)
				}
				: {
					x: obj.x,
					y: obj.y
				}

			const spawn: import('../ResourceNodes/types').ResourceNodeSpawn = {
				nodeType,
				mapId,
				position,
				tileBased: Boolean(tileBased)
			}

			if (typeof quantity === 'number') {
				spawn.quantity = quantity
			}
			if (typeof depositType === 'string') {
				const isDepositType = ['coal', 'iron', 'gold', 'stone', 'empty'].includes(depositType)
				if (isDepositType) {
					spawn.depositType = depositType as import('../ResourceNodes/types').ResourceDepositType
				}
			}

			nodes.push(spawn)
		}

		return nodes
	}

	private setupEventHandlers() {
		// Handle map loading requests
		// this.event.on<MapLoadData>(Event.Map.CS.Load, async (data, client) => {
		// 	await this.loadMapForClient(data.mapId, client)
		// })

		// Handle map transitions
		// this.event.on<MapTransitionData>(Event.Map.CS.Transition, async (data, client) => {
		// 	await this.handleMapTransition(data, client)
		// })

		// Handle player joining to send initial map
		// this.event.on<PlayerJoinData>(Event.Players.CS.Join, async (data, client) => {
		// 	await this.loadMapForClient(data.scene, client)
		// })

		// Handle player scene transitions
		// this.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, async (data, client) => {
		// 	await this.loadMapForClient(data.scene, client)
		// })
	}

	// private async loadMapForClient(mapId: string, client: EventClient) {
	// 	const mapData = this.maps.get(mapId)
	// 	if (!mapData) {
	// 		console.error(`Map not found: ${mapId}`)
	// 		return
	// 	}

	// 	// Filter and structure layers
	// 	const tileLayers = this.getTileLayers(mapData.tiledMap)
	// 	const objectLayers = this.getObjectLayers(mapData.tiledMap)

	// 	// Add mapUrl if we have the service
	// 	const mapUrl = this.mapUrlService ? this.mapUrlService.getMapUrl(mapId) : undefined

	// 	client.emit(Receiver.Sender, MapEvents.SC.Load, {
	// 		mapId,
	// 		name: mapData.name,
	// 		tileLayers,
	// 		objectLayers,
	// 		spawnPoints: mapData.spawnPoints,
	// 		collision: mapData.collision,
	// 		npcSpots: mapData.npcSpots,
	// 		paths: mapData.paths,
	// 		triggers: mapData.triggers,
	// 		mapUrl // Include the map URL
	// 	})
	// }

	private async handleMapTransition(data: MapTransitionData, client: EventClient) {
		const { toMapId, position } = data
		const toMap = this.maps.get(toMapId)

		if (!toMap) {
			this.logger.error(`Target map not found: ${toMapId}`)
			return
		}

		// Filter and structure layers for the new map
		const tileLayers = this.getTileLayers(toMap.tiledMap)
		const objectLayers = this.getObjectLayers(toMap.tiledMap)

		// Add mapUrl if we have the service
		const mapUrl = this.mapUrlService ? this.mapUrlService.getMapUrl(toMapId) : undefined

		client.emit(Receiver.Sender, MapEvents.SC.Transition, {
			toMapId,
			position,
			tileLayers,
			objectLayers,
			spawnPoints: toMap.spawnPoints,
			collision: toMap.collision,
			npcSpots: toMap.npcSpots,
			paths: toMap.paths,
			triggers: toMap.triggers,
			mapUrl // Include the map URL
		})
	}

	private getTileLayers(tiledMap: any): MapLayer[] {
		return tiledMap.layers
			.filter((layer: any) => layer.type === 'tilelayer')
			.map((layer: any) => ({
				name: layer.name,
				data: layer.data || [],
				visible: layer.visible,
				opacity: layer.opacity
			}))
	}

	private getObjectLayers(tiledMap: any): MapObjectLayer[] {
		return tiledMap.layers
			.filter((layer: any) => layer.type === 'objectgroup')
			.map((layer: any) => ({
				name: layer.name,
				objects: layer.objects || [],
				visible: layer.visible,
				opacity: layer.opacity
			}))
	}

	public getMap(mapId: string): MapData | undefined {
		return this.maps.get(mapId)
	}

	public setDynamicCollision(mapId: string, tileX: number, tileY: number, blocked: boolean): void {
		const map = this.maps.get(mapId)
		if (!map) return

		if (tileX < 0 || tileY < 0 || tileX >= map.collision.width || tileY >= map.collision.height) {
			return
		}

		const base = this.baseCollision.get(mapId)
		if (!base) return

		let counts = this.dynamicCollisionCounts.get(mapId)
		if (!counts) {
			counts = new Int16Array(map.collision.data.length)
			this.dynamicCollisionCounts.set(mapId, counts)
		}

		const index = tileY * map.collision.width + tileX
		if (index < 0 || index >= map.collision.data.length) {
			return
		}

		if (blocked) {
			counts[index] += 1
			if (counts[index] === 1 && base[index] === 0) {
				map.collision.data[index] = 1
			}
			return
		}

		if (counts[index] <= 0) return
		counts[index] -= 1
		if (counts[index] === 0 && base[index] === 0) {
			map.collision.data[index] = 0
		}
	}

	public resetDynamicCollision(mapId: string): void {
		const map = this.maps.get(mapId)
		if (!map) return

		const base = this.baseCollision.get(mapId)
		if (!base) return

		map.collision.data = base.slice()
		this.dynamicCollisionCounts.set(mapId, new Int16Array(map.collision.data.length))
	}

	public getMapIds(): string[] {
		return Array.from(this.maps.keys())
	}

	public getRandomSpawnPoint(mapId: string): Position | undefined {
		const map = this.maps.get(mapId)
		if (!map || map.spawnPoints.length === 0) return undefined

		const randomIndex = Math.floor(Math.random() * map.spawnPoints.length)
		return map.spawnPoints[randomIndex]
	}

	public isCollision(mapId: string, x: number, y: number): boolean {
		const map = this.maps.get(mapId)
		if (!map) return true

		const index = y * map.collision.width + x
		return index >= 0 && index < map.collision.data.length && map.collision.data[index] !== 0
	}

	public getGroundTypeAt(mapId: string, x: number, y: number): GroundType | null {
		const map = this.maps.get(mapId)
		if (!map) return null

		const groundLayer = map.tiledMap.layers.find((layer) => layer.name === 'ground' && Array.isArray(layer.data))
		if (!groundLayer?.data) {
			return null
		}

		if (x < 0 || y < 0 || x >= map.tiledMap.width || y >= map.tiledMap.height) {
			return null
		}

		const index = y * map.tiledMap.width + x
		const rawGid = groundLayer.data[index]
		const gid = rawGid & 0x1fffffff
		if (!gid) {
			return null
		}

		const tileset = this.getTilesetForGid(map.tiledMap, gid)
		if (!tileset || !tileset.columns) {
			return null
		}

		const localId = gid - tileset.firstgid
		if (localId < 0 || this.groundColumnOrder.length === 0) {
			return null
		}

		const column = localId % tileset.columns
		const columnIndex = column % this.groundColumnOrder.length
		return this.groundColumnOrder[columnIndex] ?? null
	}

	private getTilesetForGid(tiledMap: TiledMap, gid: number): TiledTileset | null {
		const tilesets = tiledMap.tilesets || []
		let match: TiledTileset | null = null
		for (const tileset of tilesets) {
			if (tileset.firstgid <= gid && (!match || tileset.firstgid > match.firstgid)) {
				match = tileset
			}
		}
		return match
	}

	public findPath(mapId: string, start: Position, end: Position, options?: { roadData?: RoadData, allowDiagonal?: boolean }): Position[] {
		const map = this.maps.get(mapId)
		if (!map) return []

		// Convert positions to tile coordinates
		const startTile = {
			x: Math.floor(start.x / map.tiledMap.tilewidth),
			y: Math.floor(start.y / map.tiledMap.tileheight)
		}
		const endTile = {
			x: Math.floor(end.x / map.tiledMap.tilewidth),
			y: Math.floor(end.y / map.tiledMap.tileheight)
		}

		// Find path in tile coordinates
		const path = Pathfinder.findPath(map.collision, map.paths, startTile, endTile, {
			roads: options?.roadData,
			allowDiagonal: options?.allowDiagonal
		})

		this.logger.debug('findPath', startTile, path)
		// Convert path back to world coordinates
		return path.map(tile => ({
			x: tile.x * map.tiledMap.tilewidth + map.tiledMap.tilewidth / 2,
			y: tile.y * map.tiledMap.tileheight + map.tiledMap.tileheight / 2
		}))
	}

	public findNearestWalkablePosition(mapId: string, position: Position, maxRadiusTiles: number = 2): Position | null {
		const map = this.maps.get(mapId)
		if (!map) return null

		const tileWidth = map.tiledMap.tilewidth
		const tileHeight = map.tiledMap.tileheight
		const startX = Math.floor(position.x / tileWidth)
		const startY = Math.floor(position.y / tileHeight)

		const isWalkable = (x: number, y: number) => {
			if (x < 0 || y < 0 || x >= map.collision.width || y >= map.collision.height) {
				return false
			}
			const index = y * map.collision.width + x
			return map.collision.data[index] === 0
		}

		if (isWalkable(startX, startY)) {
			return {
				x: startX * tileWidth + tileWidth / 2,
				y: startY * tileHeight + tileHeight / 2
			}
		}

		for (let radius = 1; radius <= maxRadiusTiles; radius++) {
			for (let dx = -radius; dx <= radius; dx++) {
				for (let dy = -radius; dy <= radius; dy++) {
					if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) {
						continue
					}
					const x = startX + dx
					const y = startY + dy
					if (!isWalkable(x, y)) {
						continue
					}
					return {
						x: x * tileWidth + tileWidth / 2,
						y: y * tileHeight + tileHeight / 2
					}
				}
			}
		}

		return null
	}

	public getNPCSpot(mapId: string, npcId: string, spotName: string): NPCSpot | undefined {
		const map = this.maps.get(mapId)
		if (!map) return undefined

		return map.npcSpots[npcId]?.[spotName]
	}

	public getNPCSpots(mapId: string, npcId: string): { [spotName: string]: NPCSpot } | undefined {
		const map = this.maps.get(mapId)
		if (!map) return undefined

		return map.npcSpots[npcId]
	}

	public getTriggersAtPosition(mapId: string, position: Position): MapTrigger[] {
		const map = this.maps.get(mapId)
		if (!map) return []

		return map.triggers.filter(trigger => {
			const isWithinX = position.x >= trigger.position.x && position.x <= trigger.position.x + trigger.width
			const isWithinY = position.y >= trigger.position.y && position.y <= trigger.position.y + trigger.height
			return isWithinX && isWithinY
		})
	}

	public getTriggerById(mapId: string, triggerId: string): any | undefined {
		const map = this.maps.get(mapId)
		if (!map) return undefined

		return map.triggers.find(trigger => trigger.id === triggerId)
	}

	public async loadMaps(maps: Record<string, TiledMap>) {
		if (this.debug) {
			this.logger.log('Loading maps from content')
		}

		for (const [mapId, tiledMap] of Object.entries(maps)) {
			try {
				this.decodeRleLayerData(tiledMap)

				// Validate required map properties
				if (!tiledMap || !tiledMap.layers || !Array.isArray(tiledMap.layers)) {
					this.logger.error(`Invalid map data for ${mapId}`)
					continue
				}

				const mapData: MapData = {
					id: mapId,
					name: mapId,
					tiledMap,
					spawnPoints: this.extractSpawnPoints(tiledMap),
					collision: this.extractCollisionData(tiledMap),
					npcSpots: this.extractNPCSpots(tiledMap),
					paths: this.extractPathsData(tiledMap),
					triggers: this.extractTriggers(tiledMap),
					resourceNodes: this.extractResourceNodes(tiledMap, mapId)
				}

				this.maps.set(mapId, mapData)
				this.baseCollision.set(mapId, mapData.collision.data.slice())
				this.dynamicCollisionCounts.set(mapId, new Int16Array(mapData.collision.data.length))
			} catch (error) {
				this.logger.error(`Error loading map ${mapId}:`, error)
			}
		}

		if (this.debug) {
			this.logger.log('Loaded maps:', Array.from(this.maps.keys()))
		}
	}

	/**
	 * Get the URL for a map
	 * @param mapId The ID of the map
	 * @returns The URL to load the map, or undefined if not available
	 */
	public getMapUrl(mapId: string): string | undefined {
		return this.mapUrlService ? this.mapUrlService.getMapUrl(mapId) : undefined
	}

	/**
	 * Load a map for a player and send the necessary events
	 * @param client The client to send map data to
	 * @param mapId Optional map ID, defaults to defaultMapId if not provided
	 * @param position Optional position, defaults to map's spawn point if not provided
	 */
	public loadPlayerMap(client: EventClient, mapId?: string, position?: Position): void {
		// Use provided mapId or default
		const targetMapId = mapId || this.defaultMapId
		
		// Get map URL if available
		const mapUrl = this.getMapUrl(targetMapId)
		
		// Determine position - use provided position or get a spawn point from the map
		let playerPosition = position
		if (!playerPosition) {
			// Try to get a random spawn point from the map
			playerPosition = this.getRandomSpawnPoint(targetMapId)
			
			// Fall back to a default position if no spawn point is available
			if (!playerPosition) {
				playerPosition = {
					x: 100,
					y: 400
				}
			}
		}
		
		if (this.debug) {
			this.logger.debug(`Loading map for player: ${targetMapId} with URL: ${mapUrl || 'N/A'}`)
			this.logger.debug(`Initial position: x=${playerPosition.x}, y=${playerPosition.y}`)
		}
		
		// Send map load event with URL and position
		client.emit(Receiver.Sender, Event.Map.SC.Load, {
			mapId: targetMapId,
			mapUrl,
			position: playerPosition // Always include position
		})
	}

	/**
	 * Get the default map ID
	 * @returns The default map ID
	 */
	public getDefaultMapId(): string {
		return this.defaultMapId
	}

	/**
	 * Set the default map ID to use when no specific map is requested
	 * @param mapId The map ID to use as the default
	 */
	public setDefaultMapId(mapId: string): void {
		if (this.debug) {
			this.logger.debug(`Setting default map ID to ${mapId}`)
		}
		if (this.maps.has(mapId)) {
			this.defaultMapId = mapId
		} else {
			this.logger.warn(`Could not set default map ID to ${mapId} as it doesn't exist`)
		}
	}
} 
