import { BaseManager } from '../Managers'
import type { MapManager } from '../Map'
import type { MapData } from '../Map/types'
import type { MapObjectsManager } from '../MapObjects'
import type { NPCManager } from '../NPC'
import { NPCEvents } from '../NPC/events'
import { NPCState, type NPC } from '../NPC/types'
import type { ResourceNodesManager } from '../ResourceNodes'
import type { ResourceNodeSpawn } from '../ResourceNodes/types'
import { EventManager } from '../events'
import { Logger } from '../Logs'
import { SimulationEvents } from '../Simulation/events'
import { Receiver } from '../Receiver'
import { Position } from '../types'
import type { SimulationTickData } from '../Simulation/types'
import { v4 as uuidv4 } from 'uuid'
import { WildlifeEvents } from './events'
import { WildlifeManagerState } from './WildlifeManagerState'

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

interface DeerNodeState {
	mapId: string
	tileX: number
	tileY: number
	position: Position
	npcIds: Set<string>
	pendingRespawns: number[]
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
	migrationRadiusTiles: number
	migrationMinDensityGain: number
	roamIntervalMs: number
	roamRadiusTiles: number
	roamChance: number
	maxNpcsPerNode: number
	npcRespawnMs: number
}

export interface WildlifeDeps {
	event: EventManager
	map: MapManager
	mapObjects: MapObjectsManager
	resourceNodes: ResourceNodesManager
	npc: NPCManager
}

const DEFAULT_FOREST_CONFIG: ForestSpawnConfig = {
	nodeTypes: ['tree'],
	densityRadiusTiles: 3,
	minDensity: 0.08,
	minDistanceTiles: 6,
	maxSpawnPoints: 4,
	verifyIntervalMs: 60000,
	requireFullWindow: true,
	migrationRadiusTiles: 2,
	migrationMinDensityGain: 0.01,
	roamIntervalMs: 8000,
	roamRadiusTiles: 3,
	roamChance: 0.7,
	maxNpcsPerNode: 2,
	npcRespawnMs: 60000
}

const DEER_NODE_TYPE = 'deer'
const DEER_NPC_SPEED = 90

export class WildlifeManager extends BaseManager<WildlifeDeps> {
	private readonly state: WildlifeManagerState

	constructor(
		managers: WildlifeDeps,
		private logger: Logger,
		config: Partial<ForestSpawnConfig> = {}
	) {
		super(managers)
		this.state = new WildlifeManagerState({ ...DEFAULT_FOREST_CONFIG, ...config })
		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		this.managers.event.on(SimulationEvents.SS.Tick, this.handleSimulationSSTick)
		this.managers.event.on(WildlifeEvents.SS.DeerKilled, this.handleWildlifeSSDeerKilled)
	}

	/* EVENT HANDLERS */
	private readonly handleSimulationSSTick = (data: SimulationTickData): void => {
		this.state.simulationTimeMs = data.nowMs
		this.processDeerRespawns()

		if (this.state.forestConfig.verifyIntervalMs > 0) {
			this.state.verifyElapsedMs += data.deltaMs
			if (this.state.verifyElapsedMs >= this.state.forestConfig.verifyIntervalMs) {
				this.state.verifyElapsedMs = 0
				this.verifyForestSpawnPoints()
			}
		}

		if (this.state.forestConfig.roamIntervalMs <= 0) {
			return
		}
		this.state.roamElapsedMs += data.deltaMs
		if (this.state.roamElapsedMs < this.state.forestConfig.roamIntervalMs) {
			return
		}
		this.state.roamElapsedMs = 0
		this.roamDeer()
	}

	private readonly handleWildlifeSSDeerKilled = (data: { npcId: string }): void => {
		this.handleDeerKilled(data.npcId)
	}

	/* METHODS */
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
		return (this.state.deerSpawnPoints.get(mapId) || []).map(spawn => spawn.position)
	}

	public getDeerSpawnDetails(mapId: string): ForestSpawnPoint[] {
		return this.state.deerSpawnPoints.get(mapId) || []
	}

	private verifyForestSpawnPoints(): void {
		for (const [mapId, spawns] of this.state.deerSpawnPoints.entries()) {
			if (spawns.length === 0) continue

			const mapData = this.managers.map.getMap(mapId)
			if (!mapData) continue

			const mask = this.buildForestMask(mapId, mapData)
			if (!mask) {
				this.state.forestMasks.delete(mapId)
				this.state.forestDensity.delete(mapId)
				this.state.deerSpawnPoints.set(mapId, [])
				this.managers.resourceNodes.removeNodesByType(mapId, DEER_NODE_TYPE)
				this.syncDeerNpcsForMap(mapId, [])
				continue
			}

			this.state.forestMasks.set(mapId, mask)
			const density = this.buildForestDensity(mask)
			this.state.forestDensity.set(mapId, density)
			const migrated = this.migrateSpawnPoints(mapId, mapData, mask, density, spawns)
			const changed = this.haveSpawnPointsChanged(spawns, migrated)
			this.state.deerSpawnPoints.set(mapId, migrated)
			if (!changed) continue

			this.logger.debug(`[WildlifeManager] Migrating deer spawns for ${mapId} (forest changed)`)
			this.syncDeerNodesForMap(mapId, migrated)
			this.syncDeerNpcsForMap(mapId, migrated)
		}
	}

	private generateForestSpawnsForMap(mapId: string): void {
		const mapData = this.managers.map.getMap(mapId)
		if (!mapData) return

		const mask = this.buildForestMask(mapId, mapData)
		if (!mask) {
			this.logger.debug(`[WildlifeManager] No forest nodes found for ${mapId}`)
			this.state.forestMasks.delete(mapId)
			this.state.forestDensity.delete(mapId)
			this.state.deerSpawnPoints.set(mapId, [])
			this.managers.resourceNodes.removeNodesByType(mapId, DEER_NODE_TYPE)
			this.syncDeerNpcsForMap(mapId, [])
			return
		}

		this.state.forestMasks.set(mapId, mask)
		const density = this.buildForestDensity(mask)
		this.state.forestDensity.set(mapId, density)

		const spawns = this.selectSpawnPoints(mapId, mapData, mask, density)
		this.state.deerSpawnPoints.set(mapId, spawns)
		this.syncDeerNodesForMap(mapId, spawns)
		this.syncDeerNpcsForMap(mapId, spawns)

		this.logger.log(`[WildlifeManager] Generated ${spawns.length} deer spawn points for ${mapId}`)
	}

	private syncDeerNodesForMap(mapId: string, spawns: ForestSpawnPoint[]): void {
		this.managers.resourceNodes.removeNodesByType(mapId, DEER_NODE_TYPE)
		if (spawns.length === 0) return

		const deerSpawns: ResourceNodeSpawn[] = spawns.map(spawn => ({
			nodeType: DEER_NODE_TYPE,
			mapId,
			position: { x: spawn.tileX, y: spawn.tileY },
			tileBased: true
		}))

		this.managers.resourceNodes.spawnNodes(deerSpawns)
	}

	private syncDeerNpcsForMap(mapId: string, spawns: ForestSpawnPoint[]): void {
		const desiredKeys = new Set<string>()
		const maxNpcsPerNode = Math.max(0, this.state.forestConfig.maxNpcsPerNode)

		for (const spawn of spawns) {
			const key = this.getDeerNodeKey(mapId, spawn.tileX, spawn.tileY)
			desiredKeys.add(key)
			let state = this.state.deerNodeStates.get(key)
			if (!state) {
				state = {
					mapId,
					tileX: spawn.tileX,
					tileY: spawn.tileY,
					position: { ...spawn.position },
					npcIds: new Set<string>(),
					pendingRespawns: []
				}
				this.state.deerNodeStates.set(key, state)
				if (maxNpcsPerNode > 0) {
					this.spawnDeerNpcsForNode(state, maxNpcsPerNode)
				}
			} else {
				state.tileX = spawn.tileX
				state.tileY = spawn.tileY
				state.position = { ...spawn.position }
			}
		}

		const existingKeys = this.state.deerNodeKeysByMap.get(mapId) || new Set<string>()
		for (const key of existingKeys) {
			if (!desiredKeys.has(key)) {
				this.removeDeerNode(key)
			}
		}

		this.state.deerNodeKeysByMap.set(mapId, desiredKeys)

		for (const key of desiredKeys) {
			const state = this.state.deerNodeStates.get(key)
			if (!state) continue
			this.trimDeerNpcsForNode(state, maxNpcsPerNode)
		}
	}

	private getDeerNodeKey(mapId: string, tileX: number, tileY: number): string {
		return `${mapId}:${tileX}:${tileY}`
	}

	private spawnDeerNpcsForNode(state: DeerNodeState, count: number): void {
		const maxNpcsPerNode = Math.max(0, this.state.forestConfig.maxNpcsPerNode)
		for (let i = 0; i < count; i += 1) {
			if (state.npcIds.size >= maxNpcsPerNode) {
				break
			}
			this.spawnDeerNpcForNode(state)
		}
	}

	private spawnDeerNpcForNode(state: DeerNodeState): void {
		const maxNpcsPerNode = Math.max(0, this.state.forestConfig.maxNpcsPerNode)
		if (state.npcIds.size >= maxNpcsPerNode) {
			return
		}

		const nodeKey = this.getDeerNodeKey(state.mapId, state.tileX, state.tileY)
		const npc: NPC = {
			id: uuidv4(),
			name: 'Deer',
			position: { ...state.position },
			mapId: state.mapId,
			speed: DEER_NPC_SPEED,
			state: NPCState.Idle,
			active: true,
			interactable: false,
			attributes: {
				wildlifeType: 'deer',
				deerNodeKey: nodeKey,
				emoji: '🦌'
			}
		}

		this.managers.npc.addNPC(npc)
		state.npcIds.add(npc.id)
		this.state.deerNpcToNodeKey.set(npc.id, nodeKey)
	}

	private trimDeerNpcsForNode(state: DeerNodeState, maxNpcsPerNode: number): void {
		if (maxNpcsPerNode <= 0) {
			for (const npcId of Array.from(state.npcIds)) {
				this.despawnDeerNpc(npcId, false)
			}
			state.pendingRespawns = []
			return
		}

		while (state.npcIds.size > maxNpcsPerNode) {
			const npcId = state.npcIds.values().next().value
			if (!npcId) break
			this.despawnDeerNpc(npcId, false)
		}

		const maxPending = Math.max(0, maxNpcsPerNode - state.npcIds.size)
		if (state.pendingRespawns.length > maxPending) {
			state.pendingRespawns = state.pendingRespawns.slice(0, maxPending)
		}
	}

	private removeDeerNode(nodeKey: string): void {
		const state = this.state.deerNodeStates.get(nodeKey)
		if (!state) return

		for (const npcId of Array.from(state.npcIds)) {
			this.despawnDeerNpc(npcId, false)
		}

		this.state.deerNodeStates.delete(nodeKey)
	}

	private despawnDeerNpc(npcId: string, scheduleRespawn: boolean): void {
		const nodeKey = this.state.deerNpcToNodeKey.get(npcId)
		const state = nodeKey ? this.state.deerNodeStates.get(nodeKey) : undefined

		if (state) {
			state.npcIds.delete(npcId)
			if (scheduleRespawn) {
				this.scheduleDeerRespawn(state)
			}
		}

		this.state.deerNpcToNodeKey.delete(npcId)
		this.managers.npc.removeNPC(npcId)
	}

	private scheduleDeerRespawn(state: DeerNodeState): void {
		const maxNpcsPerNode = Math.max(0, this.state.forestConfig.maxNpcsPerNode)
		if (maxNpcsPerNode <= 0) return

		const currentTotal = state.npcIds.size + state.pendingRespawns.length
		if (currentTotal >= maxNpcsPerNode) return

		const respawnAt = this.state.simulationTimeMs + Math.max(0, this.state.forestConfig.npcRespawnMs)
		state.pendingRespawns.push(respawnAt)
	}

	private processDeerRespawns(): void {
		const now = this.state.simulationTimeMs
		const maxNpcsPerNode = Math.max(0, this.state.forestConfig.maxNpcsPerNode)

		for (const state of this.state.deerNodeStates.values()) {
			if (maxNpcsPerNode <= 0) {
				this.trimDeerNpcsForNode(state, maxNpcsPerNode)
				continue
			}

			const maxPending = Math.max(0, maxNpcsPerNode - state.npcIds.size)
			if (state.pendingRespawns.length > maxPending) {
				state.pendingRespawns = state.pendingRespawns.slice(0, maxPending)
			}

			if (state.pendingRespawns.length === 0) continue

			const remaining: number[] = []
			let availableSlots = maxNpcsPerNode - state.npcIds.size

			for (const respawnAt of state.pendingRespawns) {
				if (respawnAt > now) {
					remaining.push(respawnAt)
					continue
				}
				if (availableSlots <= 0) {
					remaining.push(respawnAt)
					continue
				}
				this.spawnDeerNpcForNode(state)
				availableSlots -= 1
			}

			state.pendingRespawns = remaining
		}
	}

	private handleDeerKilled(npcId: string): void {
		this.despawnDeerNpc(npcId, true)
	}

	public reportDeerKilled(npcId: string): void {
		this.handleDeerKilled(npcId)
	}

	private migrateSpawnPoints(
		mapId: string,
		mapData: MapData,
		mask: ForestMask,
		density: ForestDensityData,
		spawns: ForestSpawnPoint[]
	): ForestSpawnPoint[] {
		if (spawns.length === 0) return []

		const minDistance = Math.max(0, this.state.forestConfig.minDistanceTiles)
		const minDistanceSq = minDistance * minDistance
		const sorted = [...spawns].sort((a, b) => b.density - a.density)
		const migrated: ForestSpawnPoint[] = []

		for (const spawn of sorted) {
			const currentDensity = this.getDensityAt(spawn.tileX, spawn.tileY, density)
			const currentValid = this.isSpawnPointValid(mapId, mapData, mask, density, spawn)
			const candidates = this.getMigrationCandidates(mapId, mapData, mask, density, spawn, currentDensity, currentValid)
			let chosen: ForestSpawnPoint | null = null

			for (const candidate of candidates) {
				if (this.isTooClose(candidate, migrated, minDistanceSq)) continue
				chosen = candidate
				break
			}

			if (!chosen && currentValid && !this.isTooClose(spawn, migrated, minDistanceSq)) {
				chosen = this.toSpawnPoint(mapData, spawn.tileX, spawn.tileY, currentDensity)
			}

			if (chosen) {
				migrated.push(chosen)
			}
		}

		if (migrated.length < this.state.forestConfig.maxSpawnPoints) {
			const fallback = this.selectSpawnPoints(mapId, mapData, mask, density)
			for (const candidate of fallback) {
				if (migrated.length >= this.state.forestConfig.maxSpawnPoints) break
				if (this.isTooClose(candidate, migrated, minDistanceSq)) continue
				migrated.push(candidate)
			}
		}

		return migrated
	}

	private getMigrationCandidates(
		mapId: string,
		mapData: MapData,
		mask: ForestMask,
		density: ForestDensityData,
		spawn: ForestSpawnPoint,
		currentDensity: number,
		currentValid: boolean
	): ForestSpawnPoint[] {
		const radius = Math.max(1, this.state.forestConfig.migrationRadiusTiles)
		const minDensity = this.state.forestConfig.minDensity
		const minGain = this.state.forestConfig.migrationMinDensityGain
		const candidates: Array<{ x: number; y: number; density: number; distSq: number }> = []

		for (let dy = -radius; dy <= radius; dy += 1) {
			for (let dx = -radius; dx <= radius; dx += 1) {
				if (dx === 0 && dy === 0) continue
				const tileX = spawn.tileX + dx
				const tileY = spawn.tileY + dy
				if (tileX < 0 || tileY < 0 || tileX >= mask.width || tileY >= mask.height) continue
				const index = tileY * mask.width + tileX
				if (mask.mask[index] === 0) continue
				if (this.isCollisionTile(mapData, tileX, tileY)) continue
				if (!this.canSpawnAt(mapId, mapData, tileX, tileY)) continue

				const tileDensity = this.getDensityAt(tileX, tileY, density)
				if (tileDensity < minDensity) continue
				if (currentValid && tileDensity < currentDensity + minGain) continue

				candidates.push({
					x: tileX,
					y: tileY,
					density: tileDensity,
					distSq: dx * dx + dy * dy
				})
			}
		}

		candidates.sort((a, b) => {
			if (b.density !== a.density) return b.density - a.density
			return a.distSq - b.distSq
		})

		return candidates.map(candidate =>
			this.toSpawnPoint(mapData, candidate.x, candidate.y, candidate.density)
		)
	}

	private toSpawnPoint(mapData: MapData, tileX: number, tileY: number, density: number): ForestSpawnPoint {
		const tileWidth = mapData.tiledMap.tilewidth
		const tileHeight = mapData.tiledMap.tileheight
		return {
			position: {
				x: tileX * tileWidth + tileWidth / 2,
				y: tileY * tileHeight + tileHeight / 2
			},
			tileX,
			tileY,
			density
		}
	}

	private isTooClose(candidate: ForestSpawnPoint, existing: ForestSpawnPoint[], minDistanceSq: number): boolean {
		for (const spawn of existing) {
			const dx = spawn.tileX - candidate.tileX
			const dy = spawn.tileY - candidate.tileY
			if ((dx * dx + dy * dy) < minDistanceSq) {
				return true
			}
		}
		return false
	}

	private haveSpawnPointsChanged(prev: ForestSpawnPoint[], next: ForestSpawnPoint[]): boolean {
		if (prev.length !== next.length) return true
		const prevKeys = prev.map(spawn => `${spawn.tileX}:${spawn.tileY}`).sort()
		const nextKeys = next.map(spawn => `${spawn.tileX}:${spawn.tileY}`).sort()
		for (let i = 0; i < prevKeys.length; i += 1) {
			if (prevKeys[i] !== nextKeys[i]) return true
		}
		return false
	}

	private roamDeer(): void {
		for (const [mapId, nodeKeys] of this.state.deerNodeKeysByMap.entries()) {
			if (nodeKeys.size === 0) continue

			const mapData = this.managers.map.getMap(mapId)
			if (!mapData) continue
			const mask = this.state.forestMasks.get(mapId)
			const density = this.state.forestDensity.get(mapId)
			if (!mask || !density) continue

			for (const key of nodeKeys) {
				const state = this.state.deerNodeStates.get(key)
				if (!state || state.npcIds.size === 0) continue
				const homeDensity = this.getDensityAt(state.tileX, state.tileY, density)
				const home: ForestSpawnPoint = {
					position: { ...state.position },
					tileX: state.tileX,
					tileY: state.tileY,
					density: homeDensity
				}

				for (const npcId of state.npcIds) {
					const npc = this.managers.npc.getNPC(npcId)
					if (!npc || npc.attributes?.reservedBy) {
						continue
					}
					if (Math.random() > this.state.forestConfig.roamChance) continue
					const target = this.findRoamTarget(mapId, mapData, mask, density, home)
					if (!target) continue
					this.managers.event.emit(Receiver.All, NPCEvents.SS.Go, { npcId, position: target })
				}
			}
		}
	}

	private findRoamTarget(
		mapId: string,
		mapData: MapData,
		mask: ForestMask,
		density: ForestDensityData,
		spawn: ForestSpawnPoint
	): Position | null {
		const radius = Math.max(1, this.state.forestConfig.roamRadiusTiles)
		const minDensity = this.state.forestConfig.minDensity
		const candidates: Array<{ x: number; y: number; density: number }> = []

		for (let dy = -radius; dy <= radius; dy += 1) {
			for (let dx = -radius; dx <= radius; dx += 1) {
				if (dx === 0 && dy === 0) continue
				const tileX = spawn.tileX + dx
				const tileY = spawn.tileY + dy
				if (tileX < 0 || tileY < 0 || tileX >= mask.width || tileY >= mask.height) continue
				const index = tileY * mask.width + tileX
				if (mask.mask[index] === 0) continue
				if (this.isCollisionTile(mapData, tileX, tileY)) continue
				if (!this.canSpawnAt(mapId, mapData, tileX, tileY)) continue

				const tileDensity = this.getDensityAt(tileX, tileY, density)
				if (tileDensity < minDensity) continue
				candidates.push({ x: tileX, y: tileY, density: tileDensity })
			}
		}

		if (candidates.length === 0) return null

		let totalDensity = 0
		for (const candidate of candidates) {
			totalDensity += candidate.density
		}
		let pick = Math.random() * totalDensity
		let chosen = candidates[0]
		for (const candidate of candidates) {
			pick -= candidate.density
			if (pick <= 0) {
				chosen = candidate
				break
			}
		}

		const tileWidth = mapData.tiledMap.tilewidth
		const tileHeight = mapData.tiledMap.tileheight
		return {
			x: chosen.x * tileWidth + tileWidth / 2,
			y: chosen.y * tileHeight + tileHeight / 2
		}
	}

	private buildForestMask(mapId: string, mapData: MapData): ForestMask | null {
		const width = mapData.tiledMap.width
		const height = mapData.tiledMap.height
		const mask = new Uint8Array(width * height)

		const nodeTypes = this.state.forestConfig.nodeTypes.length > 0 ? this.state.forestConfig.nodeTypes : ['tree']
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

		const radius = this.state.forestConfig.densityRadiusTiles
		const windowSize = (radius * 2 + 1) ** 2
		return { width, height, prefixSum, radius, windowSize }
	}

	private selectSpawnPoints(mapId: string, mapData: MapData, mask: ForestMask, density: ForestDensityData): ForestSpawnPoint[] {
		if (this.state.forestConfig.maxSpawnPoints <= 0) {
			return []
		}

		const candidates: Array<{ x: number, y: number, density: number }> = []
		const radius = density.radius
		const minDensity = this.state.forestConfig.minDensity
		const requireFullWindow = this.state.forestConfig.requireFullWindow

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
		const minDistance = Math.max(0, this.state.forestConfig.minDistanceTiles)
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

			if (selected.length >= this.state.forestConfig.maxSpawnPoints) break
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

		if (!this.state.forestConfig.requireFullWindow) {
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

		const total = this.state.forestConfig.requireFullWindow
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
		return tileDensity >= this.state.forestConfig.minDensity
	}
}

export * from './WildlifeManagerState'
