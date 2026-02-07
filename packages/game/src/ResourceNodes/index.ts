import { v4 as uuidv4 } from 'uuid'
import { EventManager, EventClient, Event } from '../events'
import type { MapObjectsManager } from '../MapObjects'
import type { MapManager } from '../Map'
import type { ItemsManager } from '../Items'
import { Item } from '../Items/types'
import { Position } from '../types'
import { ResourceNodeDefinition, ResourceNodeInstance, ResourceNodeSpawn, ResourceNodeBounds, ResourceNodesQueryData } from './types'
import type { MapObject } from '../MapObjects/types'
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

		this.event.on<ResourceNodesQueryData>(Event.ResourceNodes.CS.Query, (data, client) => {
			this.handleResourceNodeQuery(data, client)
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

			const node: ResourceNodeInstance = {
				id: nodeId,
				nodeType: def.id,
				mapId: spawn.mapId,
				position,
				remainingHarvests,
				matureAtMs: 0
			}

			const item: Item = {
				id: uuidv4(),
				itemType: def.nodeItemType
			}

			const fakeClient: EventClient = {
				id: WORLD_PLAYER_ID,
				currentGroup: spawn.mapId,
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
					...this.buildNodeMetadata(node, def)
				}
			}, fakeClient)

			if (!mapObject) {
				this.logger.warn(`[ResourceNodesManager] Failed to place resource node ${def.id} at (${position.x}, ${position.y})`)
				continue
			}

			node.mapObjectId = mapObject.id

			this.nodes.set(nodeId, node)
		}

		this.rebuildBlockingCollision()
		this.logger.log(`[ResourceNodesManager] Spawned ${this.nodes.size} resource nodes`)
	}

	public removeNodesByType(mapId: string, nodeType: string): void {
		if (!mapId || !nodeType) {
			return
		}

		const def = this.definitions.get(nodeType)
		const toRemove: ResourceNodeInstance[] = []
		for (const node of this.nodes.values()) {
			if (node.mapId !== mapId) continue
			if (node.nodeType !== nodeType) continue
			toRemove.push(node)
		}

		if (toRemove.length === 0) {
			return
		}

		for (const node of toRemove) {
			if (node.mapObjectId) {
				this.managers.mapObjects.removeObjectById(node.mapObjectId, node.mapId)
			}
			if (def) {
				this.updateCollisionForNode(node, def, false)
			}
			this.nodes.delete(node.id)
		}

		this.rebuildBlockingCollision(mapId)
	}

	public getNode(nodeId: string): ResourceNodeInstance | undefined {
		return this.nodes.get(nodeId)
	}

	public getDefinition(nodeType: string): ResourceNodeDefinition | undefined {
		return this.definitions.get(nodeType)
	}

	public getAvailableNodes(mapId: string, nodeType?: string): ResourceNodeInstance[] {
		return Array.from(this.nodes.values()).filter(node => {
			if (node.mapId !== mapId) return false
			if (nodeType && node.nodeType !== nodeType) return false
			if (node.remainingHarvests <= 0) return false
			if (node.isSpoiled) return false
			if (!this.isNodeMature(node)) return false
			if (node.reservedBy) return false
			return true
		})
	}

	public findClosestAvailableNode(mapId: string, nodeType: string, position: Position): ResourceNodeInstance | undefined {
		const nodes = this.getAvailableNodes(mapId, nodeType)
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
			if (def.regenTimeMs && def.regenTimeMs > 0) {
				if (node.mapObjectId) {
					this.managers.mapObjects.removeObjectById(node.mapObjectId, node.mapId)
				}
				this.updateCollisionForNode(node, def, false)
				node.mapObjectId = undefined
				node.matureAtMs = this.simulationTimeMs + def.regenTimeMs
				node.isSpoiled = false
				node.remainingHarvests = 0
				return {
					id: uuidv4(),
					itemType: def.outputItemType
				}
			}
			if (node.mapObjectId) {
				this.managers.mapObjects.removeObjectById(node.mapObjectId, node.mapId)
			}
			this.updateCollisionForNode(node, def, false)
			this.nodes.delete(node.id)
		}

		return {
			id: uuidv4(),
			itemType: def.outputItemType
		}
	}

	public plantNode(options: { nodeType: string, mapId: string, position: Position, growTimeMs?: number, spoilTimeMs?: number, despawnTimeMs?: number, tileBased?: boolean }): ResourceNodeInstance | null {
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
			mapId: options.mapId,
			position: options.position,
			tileBased: options.tileBased
		}) : options.position

		const existingAtPosition = Array.from(this.nodes.values()).find(node =>
			node.mapId === options.mapId &&
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

		const matureAtMs = this.simulationTimeMs + Math.max(0, options.growTimeMs ?? 0)
		const node: ResourceNodeInstance = {
			id: nodeId,
			nodeType: def.id,
			mapId: options.mapId,
			position,
			remainingHarvests,
			matureAtMs,
			plantedAtMs: this.simulationTimeMs
		}

		const item: Item = {
			id: uuidv4(),
			itemType: def.nodeItemType
		}

		const fakeClient: EventClient = {
			id: WORLD_PLAYER_ID,
			currentGroup: options.mapId,
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
				...this.buildNodeMetadata(node, def)
			}
		}, fakeClient)

		if (!mapObject) {
			return null
		}
		node.mapObjectId = mapObject.id

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

	public getNodes(mapId?: string, nodeType?: string): ResourceNodeInstance[] {
		return Array.from(this.nodes.values()).filter(node => {
			if (mapId && node.mapId !== mapId) return false
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
			if (node.remainingHarvests <= 0) {
				const def = this.definitions.get(node.nodeType)
				if (def?.regenTimeMs && def.regenTimeMs > 0 && node.matureAtMs !== undefined && this.simulationTimeMs >= node.matureAtMs) {
					const nextHarvests = Math.max(1, def.maxHarvests)
					node.remainingHarvests = nextHarvests
					node.matureAtMs = 0
					node.isSpoiled = false
					const mapObject = this.spawnNodeMapObject(node, def)
					if (mapObject) {
						node.mapObjectId = mapObject.id
						this.updateCollisionForNode(node, def, true)
					} else {
						node.remainingHarvests = 0
						node.matureAtMs = this.simulationTimeMs + def.regenTimeMs
					}
				}
				continue
			}

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
				this.managers.mapObjects.removeObjectById(node.mapObjectId, node.mapId)
			}
			const def = this.definitions.get(node.nodeType)
			if (def) {
				this.updateCollisionForNode(node, def, false)
			}
			this.nodes.delete(node.id)
		}
	}

	private spawnNodeMapObject(node: ResourceNodeInstance, def: ResourceNodeDefinition): MapObject | null {
		const item: Item = {
			id: uuidv4(),
			itemType: def.nodeItemType
		}

		const fakeClient: EventClient = {
			id: WORLD_PLAYER_ID,
			currentGroup: node.mapId,
			emit: (receiver, event, data, target) => {
				this.event.emit(receiver, event, data, target)
			},
			setGroup: () => {
				// No-op for fake client
			}
		}

		return this.managers.mapObjects.placeObject(WORLD_PLAYER_ID, {
			position: node.position,
			item,
			metadata: {
				...this.buildNodeMetadata(node, def)
			}
		}, fakeClient)
	}

	private updateCollisionForNode(node: ResourceNodeInstance, def: ResourceNodeDefinition, blocked: boolean): void {
		const shouldBlock = def.blocksMovement ?? def.id === 'tree'
		if (!shouldBlock) return
		const map = this.managers.map.getMap(node.mapId)
		if (!map) return

		const tileX = Math.floor(node.position.x / map.tiledMap.tilewidth)
		const tileY = Math.floor(node.position.y / map.tiledMap.tileheight)
		this.managers.map.setDynamicCollision(node.mapId, tileX, tileY, blocked)
	}

	public rebuildBlockingCollision(mapId?: string): void {
		const nodes = Array.from(this.nodes.values())
		const mapIds = new Set<string>()

		for (const node of nodes) {
			if (mapId && node.mapId !== mapId) continue
			mapIds.add(node.mapId)
		}

		for (const name of mapIds) {
			this.managers.map.resetDynamicCollision(name)
		}

		for (const node of nodes) {
			if (mapId && node.mapId !== mapId) continue
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
			if (node.remainingHarvests <= 0) {
				continue
			}
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
				const nextMetadata = this.buildNodeMetadata(node, def)
				const needsUpdate = existing.item.itemType !== def.nodeItemType ||
					existing.metadata?.resourceNode !== true ||
					existing.metadata?.resourceNodeId !== node.id ||
					existing.metadata?.resourceNodeType !== node.nodeType ||
					existing.metadata?.remainingHarvests !== node.remainingHarvests ||
					JSON.stringify(existing.metadata?.growth || null) !== JSON.stringify(nextMetadata.growth || null)
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
						...nextMetadata
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
			mapId: node.mapId,
			metadata: this.buildNodeMetadata(node, def)
		}

		this.managers.mapObjects.restoreObject(mapObject)
		node.mapObjectId = mapObjectId
		return mapObject
	}

	private handleResourceNodeQuery(data: ResourceNodesQueryData, client: EventClient): void {
		const mapId = data.mapId || client.currentGroup
		const bounds = data.bounds
		if (!bounds) return
		const nodes = this.collectNodesInBounds(mapId, bounds)
		client.emit(Receiver.Sender, Event.ResourceNodes.SC.Sync, {
			mapId,
			nodes,
			requestId: data.requestId,
			chunkKey: data.chunkKey
		})
	}

	private collectNodesInBounds(mapId: string, bounds: ResourceNodeBounds): MapObject[] {
		const results: MapObject[] = []
		for (const node of this.nodes.values()) {
			if (node.mapId !== mapId) continue
			if (!this.shouldSyncNode(node)) continue

			const tileX = Math.floor(node.position.x / TILE_SIZE)
			const tileY = Math.floor(node.position.y / TILE_SIZE)
			if (tileX < bounds.minX || tileX > bounds.maxX || tileY < bounds.minY || tileY > bounds.maxY) {
				continue
			}

			const def = this.definitions.get(node.nodeType)
			if (!def) {
				this.logger.warn(`[ResourceNodesManager] Missing definition for node type ${node.nodeType} when syncing to client`)
				continue
			}

			const mapObject = this.ensureNodeMapObject(node, def)
			if (!mapObject) continue
			results.push(mapObject)
		}
		return results
	}

	private shouldSyncNode(node: ResourceNodeInstance): boolean {
		if (node.remainingHarvests <= 0) return false
		if (node.isSpoiled) return false
		if (!this.isNodeMature(node)) {
			const def = this.definitions.get(node.nodeType)
			if (def?.id !== 'tree') {
				return false
			}
		}
		return true
	}

	private sendNodesToClient(client: EventClient, mapId?: string): void {
		const targetMap = mapId || client.currentGroup
		for (const node of this.nodes.values()) {
			if (node.mapId !== targetMap) {
				continue
			}
			if (!this.shouldSyncNode(node)) {
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

	private getGrowthMetadata(node: ResourceNodeInstance, def: ResourceNodeDefinition): { durationMs: number; elapsedMs: number } | null {
		if (def.id !== 'tree') return null
		if (node.plantedAtMs === undefined || node.matureAtMs === undefined) return null
		const durationMs = Math.max(0, node.matureAtMs - node.plantedAtMs)
		if (durationMs <= 0) return null
		const elapsedMs = Math.min(durationMs, Math.max(0, this.simulationTimeMs - node.plantedAtMs))
		return { durationMs, elapsedMs }
	}

	private buildNodeMetadata(node: ResourceNodeInstance, def: ResourceNodeDefinition): Record<string, any> {
		const metadata: Record<string, any> = {
			resourceNode: true,
			resourceNodeId: node.id,
			resourceNodeType: def.id,
			remainingHarvests: node.remainingHarvests
		}
		const growth = this.getGrowthMetadata(node, def)
		if (growth) {
			metadata.growth = growth
		}
		return metadata
	}

	reset(): void {
		this.nodes.clear()
		this.simulationTimeMs = 0
	}
}
