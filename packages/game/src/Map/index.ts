import { EventManager, Event, EventClient } from '../events'
import { MapData, MapLayer, MapObjectLayer, MapLoadData, MapTransitionData, CollisionData, NPCSpots, NPCSpot, PathData, MapTrigger, TiledMap, MapUrlService } from './types'
import { MapEvents } from './events'
import { Receiver } from '../Receiver'
import { PlayerJoinData, PlayerTransitionData } from '../Players/types'
import { Position } from '../types'
import { Trigger, TriggerOption } from '../Triggers/types'
import fs from 'fs'
import path from 'path'
import { Pathfinder } from './pathfinding'

const FETCH = true//typeof window !== 'undefined'

export class MapManager {
	private maps: Map<string, MapData> = new Map()
	private readonly MAPS_DIR = '/assets/maps/'//FETCH ? '/assets/maps/' : path.join(__dirname, '../../../assets/maps')
	private debug = true
	private defaultMapId: string = 'town' // Default starting map

	constructor(
		private event: EventManager,
		private mapUrlService?: MapUrlService
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
			console.error(`Target map not found: ${toMapId}`)
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

	public findPath(mapId: string, start: Position, end: Position): Position[] {
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
		const path = Pathfinder.findPath(map.collision, map.paths, startTile, endTile)

		// Convert path back to world coordinates
		return path.map(tile => ({
			x: tile.x * map.tiledMap.tilewidth + map.tiledMap.tilewidth / 2,
			y: tile.y * map.tiledMap.tileheight + map.tiledMap.tileheight / 2
		}))
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
			console.log('[MapManager] Loading maps from content')
		}

		for (const [mapId, tiledMap] of Object.entries(maps)) {
			try {
				// Validate required map properties
				if (!tiledMap || !tiledMap.layers || !Array.isArray(tiledMap.layers)) {
					console.error(`Invalid map data for ${mapId}`)
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
					triggers: this.extractTriggers(tiledMap)
				}

				this.maps.set(mapId, mapData)
			} catch (error) {
				console.error(`Error loading map ${mapId}:`, error)
			}
		}

		if (this.debug) {
			console.log('[MapManager] Loaded maps:', Array.from(this.maps.keys()))
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
			console.log(`[MapManager] Loading map for player: ${targetMapId} with URL: ${mapUrl || 'N/A'}`)
			console.log(`[MapManager] Initial position: x=${playerPosition.x}, y=${playerPosition.y}`)
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
			console.log(`[MapManager] Setting default map ID to ${mapId}`)
		}
		if (this.maps.has(mapId)) {
			this.defaultMapId = mapId
		} else {
			console.warn(`[MapManager] Could not set default map ID to ${mapId} as it doesn't exist`)
		}
	}
} 