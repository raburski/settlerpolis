import { v4 as uuidv4 } from 'uuid'
import { EventManager, EventClient } from '../events'
import type { MapObjectsManager } from '../MapObjects'
import type { ItemsManager } from '../Items'
import { Item } from '../Items/types'
import { Position } from '../types'
import { ResourceNodeDefinition, ResourceNodeInstance, ResourceNodeSpawn } from './types'
import { Logger } from '../Logs'
import { calculateDistance } from '../utils'
import { BaseManager } from '../Managers'

const TILE_SIZE = 32
const WORLD_PLAYER_ID = 'world'

export interface ResourceNodesDeps {
	mapObjects: MapObjectsManager
	items: ItemsManager
}

export class ResourceNodesManager extends BaseManager<ResourceNodesDeps> {
	private definitions = new Map<string, ResourceNodeDefinition>()
	private nodes = new Map<string, ResourceNodeInstance>()

	constructor(
		managers: ResourceNodesDeps,
		private event: EventManager,
		private logger: Logger
	) {
		super(managers)
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
				mapObjectId: mapObject.id
			}

			this.nodes.set(nodeId, node)
		}

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
		if (jobId && node.reservedBy && node.reservedBy !== jobId) return null

		const def = this.definitions.get(node.nodeType)
		if (!def) return null

		node.remainingHarvests -= 1
		node.reservedBy = undefined

		if (node.remainingHarvests <= 0) {
			if (node.mapObjectId) {
				this.managers.mapObjects.removeObjectById(node.mapObjectId, node.mapName)
			}
			this.nodes.delete(node.id)
		}

		return {
			id: uuidv4(),
			itemType: def.outputItemType
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
}
