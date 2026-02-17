import type { Position } from '../types'

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

interface ForestSpawnPoint {
	position: Position
	tileX: number
	tileY: number
	density: number
}

interface ForestSpawnConfig {
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

export class WildlifeManagerState {
	public forestConfig: ForestSpawnConfig
	public forestMasks = new Map<string, ForestMask>()
	public forestDensity = new Map<string, ForestDensityData>()
	public deerSpawnPoints = new Map<string, ForestSpawnPoint[]>()
	public deerNodeKeysByMap = new Map<string, Set<string>>()
	public deerNodeStates = new Map<string, DeerNodeState>()
	public deerNpcToNodeKey = new Map<string, string>()
	public verifyElapsedMs = 0
	public roamElapsedMs = 0
	public simulationTimeMs = 0

	constructor(forestConfig: ForestSpawnConfig) {
		this.forestConfig = forestConfig
	}
}
