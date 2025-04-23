import { EventManager, Event, EventClient } from '../../events'
import { MapData, MapLayer, MapObjectLayer, MapLoadData, MapTransitionData, CollisionData, NPCSpots, NPCSpot, PathData, MapTrigger } from './types'
import { MapEvents } from './events'
import { Receiver } from '../../Receiver'
import { PlayerJoinData, PlayerTransitionData } from '../Players/types'
import { Position } from '../../types'
import { Trigger, TriggerOption } from '../Triggers/types'
import fs from 'fs'
import path from 'path'
import { Pathfinder } from './pathfinding'

const FETCH = typeof window !== 'undefined'

export class MapManager {
	private maps: Map<string, MapData> = new Map()
	private readonly MAPS_DIR = FETCH ? '/assets/maps/' : path.join(__dirname, '../../../assets/maps')

	constructor(private event: EventManager) {
		if (FETCH) {
			this.loadMapsFromUrl()
		} else {
			this.loadMapsFromFiles()
		}
		this.setupEventHandlers()
	}

	private async loadMapsFromUrl() {
		try {
			const response = await fetch(`${this.MAPS_DIR}index.json`)
			if (!response.ok) {
				console.error('Failed to load maps index')
				return
			}

			const mapList = await response.json()
			for (const mapId of mapList) {
				const mapResponse = await fetch(`${this.MAPS_DIR}${mapId}.json`)
				if (!mapResponse.ok) {
					console.error(`Failed to load map: ${mapId}`)
					continue
				}

				const tiledMap = await mapResponse.json()
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
			}
			console.log('maps?', this.maps)
		} catch (error) {
			console.error('Error loading maps:', error)
		}
	}

	private loadMapsFromFiles() {
		try {
			const mapFiles = fs.readdirSync(this.MAPS_DIR)
				.filter(file => file.endsWith('.json'))

			for (const file of mapFiles) {
				const mapId = path.basename(file, '.json')
				const mapPath = path.join(this.MAPS_DIR, file)
				const tiledMap = JSON.parse(fs.readFileSync(mapPath, 'utf-8'))

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
			}
		} catch (error) {
			console.error('Error loading maps:', error)
		}
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

				npcSpots[npcId][spotName] = {
					position: {
						x: obj.x,
						y: obj.y
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
				spawnPoints.push({
					x: obj.x,
					y: obj.y
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
		this.event.on<MapLoadData>(Event.Map.CS.Load, async (data, client) => {
			await this.loadMapForClient(data.mapId, client)
		})

		// Handle map transitions
		this.event.on<MapTransitionData>(Event.Map.CS.Transition, async (data, client) => {
			await this.handleMapTransition(data, client)
		})

		// Handle player joining to send initial map
		this.event.on<PlayerJoinData>(Event.Players.CS.Join, async (data, client) => {
			await this.loadMapForClient(data.scene, client)
		})

		// Handle player scene transitions
		this.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, async (data, client) => {
			await this.loadMapForClient(data.scene, client)
		})
	}

	private async loadMapForClient(mapId: string, client: EventClient) {
		const mapData = this.maps.get(mapId)
		if (!mapData) {
			console.error(`Map not found: ${mapId}`)
			return
		}

		// Filter and structure layers
		const tileLayers = this.getTileLayers(mapData.tiledMap)
		const objectLayers = this.getObjectLayers(mapData.tiledMap)

		client.emit(Receiver.Sender, MapEvents.SC.Load, {
			mapId,
			name: mapData.name,
			tileLayers,
			objectLayers,
			spawnPoints: mapData.spawnPoints,
			collision: mapData.collision,
			npcSpots: mapData.npcSpots,
			paths: mapData.paths,
			triggers: mapData.triggers
		})
	}

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

		client.emit(Receiver.Sender, MapEvents.SC.Transition, {
			toMapId,
			position,
			tileLayers,
			objectLayers,
			spawnPoints: toMap.spawnPoints,
			collision: toMap.collision,
			npcSpots: toMap.npcSpots,
			paths: toMap.paths,
			triggers: toMap.triggers
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
		console.log('map triggers', mapId, map, position)
		if (!map) return []

		return map.triggers.filter(trigger => {
			const isWithinX = position.x >= trigger.position.x && position.x <= trigger.position.x + trigger.width
			const isWithinY = position.y >= trigger.position.y && position.y <= trigger.position.y + trigger.height
			return isWithinX && isWithinY
		})
	}
} 