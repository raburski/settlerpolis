import { v4 as uuidv4 } from 'uuid'
import { EventManager, EventClient, Event } from '../events'
import type { MapObjectsManager } from '../MapObjects'
import type { MapManager } from '../Map'
import type { ItemsManager } from '../Items'
import { Item } from '../Items/types'
import { Position } from '../types'
import { ResourceNodeDefinition, ResourceNodeInstance, ResourceNodeSpawn } from './types'
import type { MapObject } from '../MapObjects/types'
import type { PlayerJoinData, PlayerTransitionData } from '../Players/types'
import { Logger } from '../Logs'
import { calculateDistance } from '../utils'
import { BaseManager } from '../Managers'
import { SimulationEvents } from '../Simulation/events'
import { SimulationTickData } from '../Simulation/types'
import type { ResourceNodesSnapshot } from '../state/types'
import { Receiver } from '../Receiver'

const TILE_SIZE = 32
const WORLD_PLAYER_ID = 'world'

export interface ResourceNodesDeps {
	map: MapManager
	mapObjects: MapObjectsManager
	items: ItemsManager
}

export class ResourceNodesManager extends BaseManager<ResourceNodesDeps> {
	private definitions = new Map<string, ResourceNodeDefinition>()
	private nodes = new Map<string, ResourceNodeInstance>()
	private simulationTimeMs = 0

	constructor(
		managers: ResourceNodesDeps,
		private event: EventManager,
		private logger: Logger
	) {
		super(managers)
		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		this.event.on(SimulationEvents.SS.Tick, (data: SimulationTickData) => {
			this.simulationTimeMs = data.nowMs
			this.processNodeDecay()
		})

		this.event.on<PlayerJoinData>(Event.Players.CS.Join, (data, client) => {
			this.sendNodesToClient(client, data.mapId)
		})

		this.event.on<PlayerTransitionData>(Event.Players.CS.TransitionTo, (data, client) => {
			this.sendNodesToClient(client, data.mapId)
		})
	}

	public loadDefinitions(definitions: ResourceNodeDefinition[]): void {
		this.definitions.clear()
		definitions.forEach(def => {
			this.definitions.set(def.id, def)
		})
		this.logger.log(`[ResourceNodesManager] Loaded ${definitions.length} resource node definitions`)
	}

	public spawnNodes(spawns: ResourceNodeSpawn[]): void {
		if (!spawns || spawns.length === 0) {
			return
		}

		for (const spawn of spawns) {
			const def = this.definitions.get(spawn.nodeType)
			if (!def) {
				this.logger.warn(`[ResourceNodesManager] Missing definition for node type ${spawn.nodeType}`)
				continue
			}

			if (!this.managers.items.itemExists(def.nodeItemType)) {
				this.logger.warn(`[ResourceNodesManager] Missing item metadata for node item ${def.nodeItemType}`)
			}

			const position = this.resolvePosition(spawn)
			const nodeId = uuidv4()
			const remainingHarvests = Math.max(0, spawn.quantity ?? def.maxHarvests)

			if (remainingHarvests === 0) {
				this.logger.warn(`[ResourceNodesManager] Skipping node ${spawn.nodeType} with zero remaining harvests`)
				continue
			}

			const item: Item = {
				id: uuidv4(),
				itemType: def.nodeItemType
			}

			const fakeClient: EventClient = {
				id: WORLD_PLAYER_ID,
				currentGroup: spawn.mapName,
				emit: (receiver, event, data, target) => {
					this.event.emit(receiver, event, data, target)
				},
				setGroup: () => {
					// No-op for fake client
				}
			}

			const mapObject = this.managers.mapObjects.placeObject(WORLD_PLAYER_ID, {
				position,
				item,
				metadata: {
					resourceNode: true,
					resourceNodeId: nodeId,
					resourceNodeType: def.id,
					remainingHarvests
				}
			}, fakeClient)

			if (!mapObject) {
				this.logger.warn(`[ResourceNodesManager] Failed to place resource node ${def.id} at (${position.x}, ${position.y})`)
				continue
			}

			const node: ResourceNodeInstance = {
				id: nodeId,
				nodeType: def.id,
				mapName: spawn.mapName,
				position,
				remainingHarvests,
				mapObjectId: mapObject.id,
				matureAtMs: 0
			}

			this.nodes.set(nodeId, node)
		}

		this.rebuildBlockingCollision()
		this.logger.log(`[ResourceNodesManager] Spawned ${this.nodes.size} resource nodes`)
	}

	public getNode(nodeId: string): ResourceNodeInstance | undefined {
		return this.nodes.get(nodeId)
	}

	public getDefinition(nodeType: string): ResourceNodeDefinition | undefined {
		return this.definitions.get(nodeType)
	}

	public getAvailableNodes(mapName: string, nodeType?: string): ResourceNodeInstance[] {
		return Array.from(this.nodes.values()).filter(node => {
			if (node.mapName !== mapName) return false
			if (nodeType && node.nodeType !== nodeType) return false
			if (node.remainingHarvests <= 0) return false
			if (node.isSpoiled) return false
			if (!this.isNodeMature(node)) return false
			if (node.reservedBy) return false
			return true
		})
	}

	public findClosestAvailableNode(mapName: string, nodeType: string, position: Position): ResourceNodeInstance | undefined {
		const nodes = this.getAvailableNodes(mapName, nodeType)
		if (nodes.length === 0) {
			return undefined
		}

		let closest = nodes[0]
		let closestDistance = calculateDistance(position, closest.position)

		for (let i = 1; i < nodes.length; i++) {
			const distance = calculateDistance(position, nodes[i].position)
			if (distance < closestDistance) {
				closest = nodes[i]
				closestDistance = distance
			}
		}

		return closest
	}

	public reserveNode(nodeId: string, jobId: string): boolean {
		const node = this.nodes.get(nodeId)
		if (!node) return false
		if (node.remainingHarvests <= 0) return false
		if (node.isSpoiled) return false
		if (!this.isNodeMature(node)) return false
		if (node.reservedBy) return false

		node.reservedBy = jobId
		return true
	}

	public releaseReservation(nodeId: string, jobId?: string): void {
		const node = this.nodes.get(nodeId)
		if (!node) return
		if (jobId && node.reservedBy !== jobId) return
		node.reservedBy = undefined
	}

	public harvestNode(nodeId: string, jobId?: string): Item | null {
		const node = this.nodes.get(nodeId)
		if (!node) return null
		if (node.remainingHarvests <= 0) return null
		if (node.isSpoiled) return null
		if (!this.isNodeMature(node)) return null
		if (jobId && node.reservedBy && node.reservedBy !== jobId) return null

		const def = this.definitions.get(node.nodeType)
		if (!def) return null

		node.remainingHarvests -= 1
		node.reservedBy = undefined

		if (node.remainingHarvests <= 0) {
			if (node.mapObjectId) {
				this.managers.mapObjects.removeObjectById(node.mapObjectId, node.mapName)
			}
			const def = this.definitions.get(node.nodeType)
			if (def) {
				this.updateCollisionForNode(node, def, false)
			}
			this.nodes.delete(node.id)
		}

		return {
			id: uuidv4(),
			itemType: def.outputItemType
		}
	}

	public plantNode(options: { nodeType: string, mapName: string, position: Position, growTimeMs?: number, spoilTimeMs?: number, despawnTimeMs?: number, tileBased?: boolean }): ResourceNodeInstance | null {
		const def = this.definitions.get(options.nodeType)
		if (!def) {
			this.logger.warn(`[ResourceNodesManager] Missing definition for node type ${options.nodeType}`)
			return null
		}

		if (!this.managers.items.itemExists(def.nodeItemType)) {
			this.logger.warn(`[ResourceNodesManager] Missing item metadata for node item ${def.nodeItemType}`)
		}

		const position = options.tileBased ? this.resolvePosition({
			nodeType: options.nodeType,
			mapName: options.mapName,
			position: options.position,
			tileBased: options.tileBased
		}) : options.position

		const existingAtPosition = Array.from(this.nodes.values()).find(node =>
			node.mapName === options.mapName &&
			node.position.x === position.x &&
			node.position.y === position.y &&
			node.remainingHarvests > 0
		)
		if (existingAtPosition) {
			return null
		}

		const nodeId = uuidv4()
		const remainingHarvests = Math.max(0, def.maxHarvests)
		if (remainingHarvests === 0) {
			this.logger.warn(`[ResourceNodesManager] Cannot plant node ${options.nodeType} with zero remaining harvests`)
			return null
		}

		const item: Item = {
			id: uuidv4(),
			itemType: def.nodeItemType
		}

		const fakeClient: EventClient = {
			id: WORLD_PLAYER_ID,
			currentGroup: options.mapName,
			emit: (receiver, event, data, target) => {
				this.event.emit(receiver, event, data, target)
			},
			setGroup: () => {
				// No-op for fake client
			}
		}

		const mapObject = this.managers.mapObjects.placeObject(WORLD_PLAYER_ID, {
			position,
			item,
			metadata: {
				resourceNode: true,
				resourceNodeId: nodeId,
				resourceNodeType: def.id,
				remainingHarvests
			}
		}, fakeClient)

		if (!mapObject) {
			return null
		}

		const matureAtMs = this.simulationTimeMs + Math.max(0, options.growTimeMs ?? 0)
		const node: ResourceNodeInstance = {
			id: nodeId,
			nodeType: def.id,
			mapName: options.mapName,
			position,
			remainingHarvests,
			mapObjectId: mapObject.id,
			matureAtMs
		}

		if (options.spoilTimeMs !== undefined) {
			node.spoilAtMs = matureAtMs + Math.max(0, options.spoilTimeMs)
		}
		if (options.despawnTimeMs !== undefined) {
			const base = node.spoilAtMs ?? matureAtMs
			node.despawnAtMs = base + Math.max(0, options.despawnTimeMs)
		}

		this.nodes.set(nodeId, node)
		this.updateCollisionForNode(node, def, true)
		return node
	}

	public getNodes(mapName?: string, nodeType?: string): ResourceNodeInstance[] {
		return Array.from(this.nodes.values()).filter(node => {
			if (mapName && node.mapName !== mapName) return false
			if (nodeType && node.nodeType !== nodeType) return false
			if (node.remainingHarvests <= 0) return false
			return true
		})
	}

	private isNodeMature(node: ResourceNodeInstance): boolean {
		if (node.matureAtMs === undefined) {
			return true
		}
		return this.simulationTimeMs >= node.matureAtMs
	}

	private processNodeDecay(): void {
		if (this.nodes.size === 0) {
			return
		}

		for (const node of this.nodes.values()) {
			if (node.isSpoiled || node.spoilAtMs === undefined) {
				// skip spoil check
			} else if (this.simulationTimeMs >= node.spoilAtMs) {
				node.isSpoiled = true
				node.reservedBy = undefined
			}

			if (node.despawnAtMs === undefined) {
				continue
			}
			if (this.simulationTimeMs < node.despawnAtMs) {
				continue
			}

			if (node.mapObjectId) {
				this.managers.mapObjects.removeObjectById(node.mapObjectId, node.mapName)
			}
			const def = this.definitions.get(node.nodeType)
			if (def) {
				this.updateCollisionForNode(node, def, false)
			}
			this.nodes.delete(node.id)
		}
	}

	private updateCollisionForNode(node: ResourceNodeInstance, def: ResourceNodeDefinition, blocked: boolean): void {
		const shouldBlock = def.blocksMovement ?? def.id === 'tree'
		if (!shouldBlock) return
		const map = this.managers.map.getMap(node.mapName)
		if (!map) return

		const tileX = Math.floor(node.position.x / map.tiledMap.tilewidth)
		const tileY = Math.floor(node.position.y / map.tiledMap.tileheight)
		this.managers.map.setDynamicCollision(node.mapName, tileX, tileY, blocked)
	}

	public rebuildBlockingCollision(mapName?: string): void {
		const nodes = Array.from(this.nodes.values())
		const mapNames = new Set<string>()

		for (const node of nodes) {
			if (mapName && node.mapName !== mapName) continue
			mapNames.add(node.mapName)
		}

		for (const name of mapNames) {
			this.managers.map.resetDynamicCollision(name)
		}

		for (const node of nodes) {
			if (mapName && node.mapName !== mapName) continue
			const def = this.definitions.get(node.nodeType)
			if (!def) continue
			this.updateCollisionForNode(node, def, true)
		}
	}

	private resolvePosition(spawn: ResourceNodeSpawn): Position {
		const tileBased = spawn.tileBased !== false
		if (!tileBased) {
			return spawn.position
		}

		return {
			x: spawn.position.x * TILE_SIZE,
			y: spawn.position.y * TILE_SIZE
		}
	}

	serialize(): ResourceNodesSnapshot {
		return {
			nodes: Array.from(this.nodes.values()).map(node => ({
				...node,
				position: { ...node.position }
			})),
			simulationTimeMs: this.simulationTimeMs
		}
	}

	deserialize(state: ResourceNodesSnapshot): void {
		this.nodes.clear()
		for (const node of state.nodes) {
			this.nodes.set(node.id, {
				...node,
				position: { ...node.position }
			})
		}
		this.simulationTimeMs = state.simulationTimeMs
		this.restoreMissingMapObjects()
	}

	private restoreMissingMapObjects(): void {
		for (const node of this.nodes.values()) {
			const def = this.definitions.get(node.nodeType)
			if (!def) {
				this.logger.warn(`[ResourceNodesManager] Missing definition for node type ${node.nodeType} during restore`)
				continue
			}
			this.ensureNodeMapObject(node, def)
		}
	}

	private ensureNodeMapObject(node: ResourceNodeInstance, def: ResourceNodeDefinition): MapObject | null {
		if (node.mapObjectId) {
			const existing = this.managers.mapObjects.getObjectById(node.mapObjectId)
			if (existing) {
				const needsUpdate = existing.item.itemType !== def.nodeItemType ||
					existing.metadata?.resourceNode !== true ||
					existing.metadata?.resourceNodeId !== node.id ||
					existing.metadata?.resourceNodeType !== node.nodeType ||
					existing.metadata?.remainingHarvests !== node.remainingHarvests
				if (!needsUpdate) {
					return existing
				}

				const updated: MapObject = {
					...existing,
					item: {
						...existing.item,
						itemType: def.nodeItemType
					},
					metadata: {
						...(existing.metadata || {}),
						resourceNode: true,
						resourceNodeId: node.id,
						resourceNodeType: node.nodeType,
						remainingHarvests: node.remainingHarvests
					}
				}
				this.managers.mapObjects.restoreObject(updated)
				return updated
			}
		}

		const mapObjectId = node.mapObjectId ?? uuidv4()
		const mapObject: MapObject = {
			id: mapObjectId,
			item: {
				id: uuidv4(),
				itemType: def.nodeItemType
			},
			position: { ...node.position },
			rotation: 0,
			playerId: WORLD_PLAYER_ID,
			mapName: node.mapName,
			metadata: {
				resourceNode: true,
				resourceNodeId: node.id,
				resourceNodeType: node.nodeType,
				remainingHarvests: node.remainingHarvests
			}
		}

		this.managers.mapObjects.restoreObject(mapObject)
		node.mapObjectId = mapObjectId
		return mapObject
	}

	private sendNodesToClient(client: EventClient, mapName?: string): void {
		const targetMap = mapName || client.currentGroup
		for (const node of this.nodes.values()) {
			if (node.mapName !== targetMap) {
				continue
			}
			if (node.remainingHarvests <= 0) {
				continue
			}
			if (node.isSpoiled) {
				continue
			}
			if (!this.isNodeMature(node)) {
				continue
			}

			const def = this.definitions.get(node.nodeType)
			if (!def) {
				this.logger.warn(`[ResourceNodesManager] Missing definition for node type ${node.nodeType} when syncing to client`)
				continue
			}

			const mapObject = this.ensureNodeMapObject(node, def)
			if (!mapObject) {
				continue
			}

			client.emit(Receiver.Sender, Event.MapObjects.SC.Spawn, { object: mapObject })
		}
	}

	reset(): void {
		this.nodes.clear()
		this.simulationTimeMs = 0
	}
}
