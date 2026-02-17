import { v4 as uuidv4 } from 'uuid'
import { EventManager, EventClient, Event } from '../events'
import type { MapObjectsManager } from '../MapObjects'
import type { MapManager } from '../Map'
import type { ItemsManager } from '../Items'
import type { BuildingManager } from '../Buildings'
import type { PopulationManager } from '../Population'
import type { WorkProviderManager } from '../Settlers/WorkProvider'
import { Item } from '../Items/types'
import { Position } from '../types'
import { ResourceDepositType, ResourceNodeDefinition, ResourceNodeInstance, ResourceNodeSpawn, ResourceNodeBounds, ResourceNodeProspectRequestData, ResourceNodesQueryData } from './types'
import type { MapObject } from '../MapObjects/types'
import { Logger } from '../Logs'
import { calculateDistance } from '../utils'
import { BaseManager } from '../Managers'
import { SimulationEvents } from '../Simulation/events'
import { SimulationTickData } from '../Simulation/types'
import type { ResourceNodesSnapshot } from '../state/types'
import { Receiver } from '../Receiver'
import { BuildingsEvents } from '../Buildings/events'
import { ConstructionStage } from '../Buildings/types'
import { ProfessionType } from '../Population/types'
import type { Settler } from '../Population/types'
import { ResourceNodesManagerState } from './ResourceNodesManagerState'

const TILE_SIZE = 32
const WORLD_PLAYER_ID = 'world'
const RESOURCE_DEPOSIT_NODE = 'resource_deposit'
const STONE_DEPOSIT_NODE = 'stone_deposit'
const GUILDHALL_BUILDING_ID = 'guildhall'
const PROSPECTING_DURATION_MS = 60000
const MOUNTAIN_DEPOSIT_DENSITY = 0.005
const MOUNTAIN_DEPOSIT_BUFFER = 1
const STONE_QUANTITY_MIN = 10
const STONE_QUANTITY_MAX = 50
const RESOURCE_DEPOSIT_QUANTITY_MIN = 50
const RESOURCE_DEPOSIT_QUANTITY_MAX = 200
const DEPOSIT_WEIGHTS: Array<{ type: ResourceDepositType; weight: number }> = [
	{ type: 'empty', weight: 0.3 },
	{ type: 'stone', weight: 0.25 },
	{ type: 'coal', weight: 0.2 },
	{ type: 'iron', weight: 0.18 },
	{ type: 'gold', weight: 0.07 }
]

interface ProspectingJob {
	jobId: string
	mapId: string
	playerId: string
	nodeId: string
	createdAt: number
	assignedSettlerId?: string
}

const hashString = (input: string): number => {
	let hash = 1779033703 ^ input.length
	for (let i = 0; i < input.length; i += 1) {
		hash = Math.imul(hash ^ input.charCodeAt(i), 3432918353)
		hash = (hash << 13) | (hash >>> 19)
	}
	return hash >>> 0
}

const hash2D = (x: number, y: number, seed: number): number => {
	let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)
	h = Math.imul(h ^ (h >>> 13), 1274126177)
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export interface ResourceNodesDeps {
	event: EventManager
	map: MapManager
	mapObjects: MapObjectsManager
	items: ItemsManager
	buildings: BuildingManager
	population: PopulationManager
	work: WorkProviderManager
}

export class ResourceNodesManager extends BaseManager<ResourceNodesDeps> {
	private readonly state = new ResourceNodesManagerState()

	private get definitions(): Map<string, ResourceNodeDefinition> {
		return this.state.definitions
	}

	private get nodes(): Map<string, ResourceNodeInstance> {
		return this.state.nodes
	}

	private get prospectingJobsByMap(): Map<string, ProspectingJob[]> {
		return this.state.prospectingJobsByMap
	}

	private get simulationTimeMs(): number {
		return this.state.simulationTimeMs
	}

	private set simulationTimeMs(value: number) {
		this.state.simulationTimeMs = value
	}

	constructor(
		managers: ResourceNodesDeps,
		private logger: Logger
	) {
		super(managers)
		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		this.managers.event.on(SimulationEvents.SS.Tick, this.handleSimulationSSTick)
		this.managers.event.on<ResourceNodesQueryData>(Event.ResourceNodes.CS.Query, this.handleResourceNodesCSQuery)
		this.managers.event.on<ResourceNodeProspectRequestData>(Event.ResourceNodes.CS.RequestProspecting, this.handleResourceNodesCSRequestProspecting)
		this.managers.event.on<{ building: { id: string; buildingId: string; mapId: string; position: Position; resourceNodeId?: string } }>(BuildingsEvents.SS.Placed, this.handleBuildingsSSPlaced)
	}

	/* EVENT HANDLERS */
	private readonly handleSimulationSSTick = (data: SimulationTickData): void => {
		this.simulationTimeMs = data.nowMs
		this.processNodeDecay()
	}

	private readonly handleResourceNodesCSQuery = (data: ResourceNodesQueryData, client: EventClient): void => {
		this.handleResourceNodeQuery(data, client)
	}

	private readonly handleResourceNodesCSRequestProspecting = (data: ResourceNodeProspectRequestData, client: EventClient): void => {
		this.handleProspectingRequest(data, client)
	}

	private readonly handleBuildingsSSPlaced = (data: { building?: { id: string; buildingId: string; mapId: string; position: Position; resourceNodeId?: string } }): void => {
		this.handleBuildingPlaced(data?.building)
	}

	/* METHODS */
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
			const resolvedQuantity = spawn.quantity ?? this.rollQuantityForNode(spawn.nodeType, spawn.mapId, position)
			const remainingHarvests = Math.max(0, resolvedQuantity ?? def.maxHarvests)
			const depositType = spawn.nodeType === RESOURCE_DEPOSIT_NODE
				? (spawn.depositType ?? this.rollDepositType(spawn.mapId, position))
				: undefined

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
				matureAtMs: 0,
				depositType,
				depositDiscovered: depositType ? false : undefined
			}

			const item: Item = {
				id: uuidv4(),
				itemType: def.nodeItemType
			}

			const fakeClient: EventClient = {
				id: WORLD_PLAYER_ID,
				currentGroup: spawn.mapId,
				emit: (receiver, event, data, target) => {
					this.managers.event.emit(receiver, event, data, target)
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

	private removeNodeInstance(node: ResourceNodeInstance, def?: ResourceNodeDefinition): void {
		if (node.mapObjectId) {
			this.managers.mapObjects.removeObjectById(node.mapObjectId, node.mapId)
		}
		if (def) {
			this.updateCollisionForNode(node, def, false)
		}
		this.nodes.delete(node.id)
	}

	private handleProspectingRequest(data: ResourceNodeProspectRequestData, client: EventClient): void {
		if (!data?.nodeId) return
		const node = this.nodes.get(data.nodeId)
		if (!node) return
		if (node.mapId !== client.currentGroup) return
		if (node.nodeType !== RESOURCE_DEPOSIT_NODE) return
		if (node.depositDiscovered) return
		if (node.prospectingJobId) return

		const jobId = uuidv4()
		const job: ProspectingJob = {
			jobId,
			mapId: node.mapId,
			playerId: client.id,
			nodeId: node.id,
			createdAt: this.simulationTimeMs
		}
		const jobs = this.getProspectingJobsForMap(node.mapId)
		jobs.push(job)

		node.prospectingJobId = jobId
		node.prospectingStatus = 'queued'
		const assigned = this.assignProspectingJobToClosestSettler(node, job)
		if (!assigned) {
			this.broadcastNodeUpdate(node)
		}
	}

	private handleBuildingPlaced(building?: { id?: string; buildingId?: string; mapId?: string; position?: Position; resourceNodeId?: string }): void {
		if (!building?.buildingId || !building?.mapId || !building?.position) {
			return
		}
		const mineMap: Record<string, ResourceDepositType> = {
			coal_mine: 'coal',
			iron_mine: 'iron',
			gold_mine: 'gold',
			quarry: 'stone',
			stone_mine: 'stone'
		}
		const depositType = mineMap[building.buildingId]
		if (!depositType) return
		const buildingDef = this.managers.buildings.getBuildingDefinition(building.buildingId)
		const footprintWidth = buildingDef?.footprint?.width ?? 1
		const footprintHeight = buildingDef?.footprint?.height ?? footprintWidth
		const nodes = building.resourceNodeId
			? this.findDepositNodesById(building.mapId, building.resourceNodeId)
			: this.findDepositNodesInFootprint(building.mapId, building.position, footprintWidth, footprintHeight)
		if (nodes.length === 0) {
			this.logger.warn(`[ResourceNodesManager] Mine placed but no deposit nodes found for ${building.buildingId} at (${building.position.x}, ${building.position.y})`)
			return
		}

		let removed = 0
		for (const node of nodes) {
			if (node.nodeType === RESOURCE_DEPOSIT_NODE) {
				if (!node.depositDiscovered || node.depositType !== depositType) {
					continue
				}
			}
			if (node.nodeType === STONE_DEPOSIT_NODE && depositType !== 'stone') {
				continue
			}
			const def = this.definitions.get(node.nodeType)
			this.claimNodeForBuilding(node, def, building.id ?? building.buildingId)
			removed += 1
		}

		if (removed > 0) {
			this.logger.warn(`[ResourceNodesManager] Claimed ${removed} deposit node(s) for ${building.buildingId}`)
			this.rebuildBlockingCollision(building.mapId)
		}
	}

	private claimNodeForBuilding(node: ResourceNodeInstance, def: ResourceNodeDefinition | undefined, buildingId: string): void {
		if (node.mapObjectId) {
			this.managers.mapObjects.removeObjectById(node.mapObjectId, node.mapId)
			node.mapObjectId = undefined
		}
		if (def) {
			this.updateCollisionForNode(node, def, false)
		}
		node.claimedByBuildingId = buildingId
	}

	private findDepositNodesById(mapId: string, nodeId: string): ResourceNodeInstance[] {
		const node = this.nodes.get(nodeId)
		if (!node) return []
		if (node.mapId !== mapId) return []
		if (node.nodeType !== RESOURCE_DEPOSIT_NODE && node.nodeType !== STONE_DEPOSIT_NODE) return []
		return [node]
	}

	private findDepositNodesInFootprint(mapId: string, position: Position, widthTiles: number, heightTiles: number): ResourceNodeInstance[] {
		const width = widthTiles * TILE_SIZE
		const height = heightTiles * TILE_SIZE
		const nodes: ResourceNodeInstance[] = []
		for (const node of this.nodes.values()) {
			if (node.mapId !== mapId) continue
			if (node.nodeType !== RESOURCE_DEPOSIT_NODE && node.nodeType !== STONE_DEPOSIT_NODE) continue
			const withinX = node.position.x >= position.x && node.position.x < position.x + width
			const withinY = node.position.y >= position.y && node.position.y < position.y + height
			if (withinX && withinY) {
				nodes.push(node)
			}
		}
		return nodes
	}

	private getProspectingJobsForMap(mapId: string): ProspectingJob[] {
		let jobs = this.prospectingJobsByMap.get(mapId)
		if (!jobs) {
			jobs = []
			this.prospectingJobsByMap.set(mapId, jobs)
		}
		return jobs
	}

	public getPendingProspectingGroups(): Array<{ mapId: string; playerId: string; count: number }> {
		const groups = new Map<string, { mapId: string; playerId: string; count: number }>()
		for (const jobs of this.prospectingJobsByMap.values()) {
			for (const job of jobs) {
				if (job.assignedSettlerId) continue
				const key = `${job.mapId}:${job.playerId}`
				const entry = groups.get(key)
				if (entry) {
					entry.count += 1
				} else {
					groups.set(key, { mapId: job.mapId, playerId: job.playerId, count: 1 })
				}
			}
		}
		return Array.from(groups.values())
	}

	public getProspectingJobForSettler(settlerId: string): ProspectingJob | null {
		for (const jobs of this.prospectingJobsByMap.values()) {
			const job = jobs.find(candidate => candidate.assignedSettlerId === settlerId)
			if (job) {
				return job
			}
		}
		return null
	}

	public claimProspectingJob(mapId: string, playerId: string, settlerId: string): { jobId: string; nodeId: string; position: Position; durationMs: number } | null {
		const jobs = this.prospectingJobsByMap.get(mapId)
		if (!jobs || jobs.length === 0) {
			return null
		}
		let job = jobs.find(candidate => candidate.assignedSettlerId === settlerId)
		if (!job) {
			const settler = this.managers.population.getSettler(settlerId)
			if (!settler) {
				return null
			}
			let bestJob: ProspectingJob | null = null
			let bestDistance = Number.POSITIVE_INFINITY
			for (const candidate of jobs) {
				if (candidate.assignedSettlerId || candidate.playerId !== playerId) {
					continue
				}
				const node = this.nodes.get(candidate.nodeId)
				if (!node) continue
				const distance = calculateDistance(settler.position, node.position)
				if (distance < bestDistance) {
					bestDistance = distance
					bestJob = candidate
				}
			}
			if (!bestJob) {
				return null
			}
			job = bestJob
			job.assignedSettlerId = settlerId
		}
		if (!job) {
			return null
		}
		const node = this.nodes.get(job.nodeId)
		if (!node) {
			return null
		}
		if (job.assignedSettlerId !== settlerId) {
			job.assignedSettlerId = settlerId
		}
		if (node.prospectingStatus !== 'in_progress' || node.prospectingSettlerId !== settlerId) {
			node.prospectingStatus = 'in_progress'
			node.prospectingSettlerId = settlerId
			this.broadcastNodeUpdate(node)
		}
		return {
			jobId: job.jobId,
			nodeId: node.id,
			position: { ...node.position },
			durationMs: PROSPECTING_DURATION_MS
		}
	}

	private assignProspectingJobToClosestSettler(node: ResourceNodeInstance, job: ProspectingJob): boolean {
		const candidate = this.findClosestAvailableProspector(node.mapId, job.playerId, node.position)
		if (!candidate) {
			return false
		}
		job.assignedSettlerId = candidate.id
		node.prospectingStatus = 'in_progress'
		node.prospectingSettlerId = candidate.id
		this.broadcastNodeUpdate(node)
		this.managers.work.requestImmediateDispatch(candidate.id)
		return true
	}

	private findClosestAvailableProspector(mapId: string, playerId: string, position: Position): Settler | null {
		const workerIds = new Set<string>()
		let guildhallCount = 0
		for (const building of this.managers.buildings.getAllBuildings()) {
			if (building.mapId !== mapId || building.playerId !== playerId) {
				continue
			}
			if (building.buildingId !== GUILDHALL_BUILDING_ID) {
				continue
			}
			if (building.stage !== ConstructionStage.Completed) {
				continue
			}
			guildhallCount += 1
			const workers = this.managers.buildings.getBuildingWorkers(building.id)
			for (const workerId of workers) {
				workerIds.add(workerId)
			}
		}

		if (workerIds.size === 0) {
			return null
		}

		let best: Settler | null = null
		let bestDistance = Number.POSITIVE_INFINITY
		for (const workerId of workerIds) {
			const settler = this.managers.population.getSettler(workerId)
			if (!settler) continue
			if (settler.mapId !== mapId || settler.playerId !== playerId) {
				continue
			}
			if (settler.profession !== ProfessionType.Prospector) {
				continue
			}
			if (this.getProspectingJobForSettler(settler.id)) {
				continue
			}
			const distance = calculateDistance(settler.position, position)
			if (distance < bestDistance) {
				bestDistance = distance
				best = settler
			}
		}

		return best
	}

	public releaseProspectingJob(jobId: string): void {
		for (const jobs of this.prospectingJobsByMap.values()) {
			const job = jobs.find(candidate => candidate.jobId === jobId)
			if (job) {
				job.assignedSettlerId = undefined
				const node = this.nodes.get(job.nodeId)
				if (node && node.prospectingStatus === 'in_progress') {
					node.prospectingStatus = 'queued'
					node.prospectingSettlerId = undefined
					this.broadcastNodeUpdate(node)
				}
				return
			}
		}
	}

	public completeProspectingJob(nodeId: string): void {
		const node = this.nodes.get(nodeId)
		if (!node || node.nodeType !== RESOURCE_DEPOSIT_NODE) {
			return
		}

		node.depositDiscovered = true
		node.prospectingStatus = undefined
		node.prospectingSettlerId = undefined

		const jobId = node.prospectingJobId
		if (jobId) {
			for (const [mapId, jobs] of this.prospectingJobsByMap.entries()) {
				const index = jobs.findIndex(job => job.jobId === jobId)
				if (index >= 0) {
					jobs.splice(index, 1)
					if (jobs.length === 0) {
						this.prospectingJobsByMap.delete(mapId)
					}
					break
				}
			}
		}
		node.prospectingJobId = undefined
		this.broadcastNodeUpdate(node)
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

	public consumeDeposit(nodeId: string, amount: number = 1): number {
		const node = this.nodes.get(nodeId)
		if (!node) {
			return 0
		}
		if (node.remainingHarvests <= 0) {
			return 0
		}
		const consumed = Math.min(amount, node.remainingHarvests)
		node.remainingHarvests -= consumed
		if (node.remainingHarvests <= 0) {
			node.remainingHarvests = 0
		}
		return consumed
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
				this.managers.event.emit(receiver, event, data, target)
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
				this.managers.event.emit(receiver, event, data, target)
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
		const footprintWidth = def.footprint?.width ?? 1
		const footprintHeight = def.footprint?.height ?? def.footprint?.width ?? 1
		for (let dy = 0; dy < footprintHeight; dy += 1) {
			for (let dx = 0; dx < footprintWidth; dx += 1) {
				this.managers.map.setDynamicCollision(node.mapId, tileX + dx, tileY + dy, blocked)
			}
		}
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
		return this.state.serialize()
	}

	deserialize(state: ResourceNodesSnapshot): void {
		this.state.deserialize(state)
		this.restoreMissingMapObjects()
	}

	private restoreMissingMapObjects(): void {
		for (const node of this.nodes.values()) {
			if (!this.shouldSyncNode(node)) {
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
					JSON.stringify(existing.metadata?.growth || null) !== JSON.stringify(nextMetadata.growth || null) ||
					existing.metadata?.depositDiscovered !== nextMetadata.depositDiscovered ||
					existing.metadata?.depositType !== nextMetadata.depositType ||
					existing.metadata?.prospectingStatus !== nextMetadata.prospectingStatus ||
					existing.metadata?.prospectingSettlerId !== nextMetadata.prospectingSettlerId ||
					JSON.stringify(existing.metadata?.footprint || null) !== JSON.stringify(nextMetadata.footprint || null)
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
		if (node.claimedByBuildingId) return false
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
		if (def.footprint) {
			metadata.footprint = {
				width: def.footprint.width,
				height: def.footprint.height ?? def.footprint.width
			}
		}
		if (node.nodeType === RESOURCE_DEPOSIT_NODE) {
			metadata.depositDiscovered = Boolean(node.depositDiscovered)
			if (node.depositDiscovered && node.depositType) {
				metadata.depositType = node.depositType
			}
			if (node.prospectingStatus) {
				metadata.prospectingStatus = node.prospectingStatus
			}
			if (node.prospectingSettlerId) {
				metadata.prospectingSettlerId = node.prospectingSettlerId
			}
		}
		const growth = this.getGrowthMetadata(node, def)
		if (growth) {
			metadata.growth = growth
		}
		return metadata
	}

	private broadcastNodeUpdate(node: ResourceNodeInstance): void {
		const def = this.definitions.get(node.nodeType)
		if (!def) {
			this.logger.warn(`[ResourceNodesManager] Missing definition for node type ${node.nodeType} during broadcast`)
			return
		}
		const mapObject = this.ensureNodeMapObject(node, def)
		if (!mapObject) return
		this.managers.event.emit(Receiver.Group, Event.MapObjects.SC.Spawn, { object: mapObject }, node.mapId)
	}

	private rollDepositType(mapId: string, position: Position): ResourceDepositType {
		const mapSeed = this.getMapSeed(mapId)
		const tileX = Math.floor(position.x / TILE_SIZE)
		const tileY = Math.floor(position.y / TILE_SIZE)
		const roll = hash2D(tileX, tileY, mapSeed + 971)
		const totalWeight = DEPOSIT_WEIGHTS.reduce((sum, entry) => sum + entry.weight, 0)
		let cursor = 0
		for (const entry of DEPOSIT_WEIGHTS) {
			cursor += entry.weight
			if (roll * totalWeight <= cursor) {
				return entry.type
			}
		}
		return DEPOSIT_WEIGHTS[DEPOSIT_WEIGHTS.length - 1].type
	}

	private rollQuantityForNode(nodeType: string, mapId: string, position: Position): number | undefined {
		if (nodeType !== STONE_DEPOSIT_NODE && nodeType !== RESOURCE_DEPOSIT_NODE) {
			return undefined
		}
		const mapSeed = this.getMapSeed(mapId)
		const tileX = Math.floor(position.x / TILE_SIZE)
		const tileY = Math.floor(position.y / TILE_SIZE)
		const roll = hash2D(tileX, tileY, mapSeed + 1207)
		const [min, max] = nodeType === STONE_DEPOSIT_NODE
			? [STONE_QUANTITY_MIN, STONE_QUANTITY_MAX]
			: [RESOURCE_DEPOSIT_QUANTITY_MIN, RESOURCE_DEPOSIT_QUANTITY_MAX]
		return min + Math.floor(roll * (max - min + 1))
	}

	public generateMountainDepositSpawns(mapId: string, existingNodes: ResourceNodeSpawn[]): ResourceNodeSpawn[] {
		const map = this.managers.map.getMap(mapId)
		if (!map) return []

		const width = map.tiledMap.width
		const height = map.tiledMap.height
		const tileSize = map.tiledMap.tilewidth || TILE_SIZE
		const occupied = new Uint8Array(width * height)
		for (const node of existingNodes) {
			const tileBased = node.tileBased !== false
			const tileX = tileBased ? node.position.x : Math.floor(node.position.x / tileSize)
			const tileY = tileBased ? node.position.y : Math.floor(node.position.y / tileSize)
			if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) continue
			occupied[tileY * width + tileX] = 1
		}

		const seed = this.getMapSeed(mapId)
		const spawns: ResourceNodeSpawn[] = []
		const footprintWidth = 2
		const footprintHeight = 2

		for (let y = 0; y < height - (footprintHeight - 1); y += 1) {
			for (let x = 0; x < width - (footprintWidth - 1); x += 1) {
				if (hash2D(x, y, seed + 211) > MOUNTAIN_DEPOSIT_DENSITY) {
					continue
				}

				let allMountain = true
				for (let dy = 0; dy < footprintHeight; dy += 1) {
					for (let dx = 0; dx < footprintWidth; dx += 1) {
						const groundType = this.managers.map.getGroundTypeAt(mapId, x + dx, y + dy)
						if (groundType !== 'mountain') {
							allMountain = false
							break
						}
					}
					if (!allMountain) break
				}
				if (!allMountain) continue

				let blocked = false
				for (let dy = -MOUNTAIN_DEPOSIT_BUFFER; dy < footprintHeight + MOUNTAIN_DEPOSIT_BUFFER; dy += 1) {
					for (let dx = -MOUNTAIN_DEPOSIT_BUFFER; dx < footprintWidth + MOUNTAIN_DEPOSIT_BUFFER; dx += 1) {
						const tx = x + dx
						const ty = y + dy
						if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue
						if (occupied[ty * width + tx]) {
							blocked = true
							break
						}
					}
					if (blocked) break
				}
				if (blocked) continue

				const position = { x, y }
				spawns.push({
					nodeType: RESOURCE_DEPOSIT_NODE,
					mapId,
					position,
					tileBased: true,
					depositType: this.rollDepositType(mapId, { x: x * TILE_SIZE, y: y * TILE_SIZE }),
					quantity: this.rollQuantityForNode(
						RESOURCE_DEPOSIT_NODE,
						mapId,
						{ x: x * TILE_SIZE, y: y * TILE_SIZE }
					)
				})

				for (let dy = -MOUNTAIN_DEPOSIT_BUFFER; dy < footprintHeight + MOUNTAIN_DEPOSIT_BUFFER; dy += 1) {
					for (let dx = -MOUNTAIN_DEPOSIT_BUFFER; dx < footprintWidth + MOUNTAIN_DEPOSIT_BUFFER; dx += 1) {
						const tx = x + dx
						const ty = y + dy
						if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue
						occupied[ty * width + tx] = 1
					}
				}
			}
		}

		return spawns
	}

	private getMapSeed(mapId: string): number {
		const map = this.managers.map.getMap(mapId)
		const tiledMap = map?.tiledMap as { properties?: Array<{ name?: string; value?: unknown }> } | undefined
		const props = Array.isArray(tiledMap?.properties) ? tiledMap?.properties : []
		const seedProp = props.find((prop: any) => prop?.name === 'seed')?.value
		return hashString(seedProp ? String(seedProp) : mapId)
	}

	reset(): void {
		this.state.reset()
	}
}

export * from './ResourceNodesManagerState'
