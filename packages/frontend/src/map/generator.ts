export const GROUND_TYPE_ORDER = [
	'grass',
	'dirt',
	'sand',
	'rock',
	'mountain',
	'water_shallow',
	'water_deep',
	'mud'
] as const

export type GroundType = (typeof GROUND_TYPE_ORDER)[number]

export const GROUND_TYPE_COLORS: Record<GroundType, string> = {
	grass: '#4f9d4a',
	dirt: '#9a6b3f',
	sand: '#d1b36a',
	rock: '#7b7f86',
	mountain: '#4a4f55',
	water_shallow: '#4b86b8',
	water_deep: '#1f4e7a',
	mud: '#6f5a3c'
}

export interface MapGenConfig {
	seed: string
	width: number
	height: number
	tileWidth: number
	tileHeight: number
	seaLevel: number
	roughness: number
	moisture: number
	temperature: number
	grassBias: number
	mountainBias: number
}

export interface MapResourceNode {
	nodeType: string
	position: { x: number; y: number }
	quantity?: number
	tileBased: boolean
}

export interface MapGenResult {
	tiles: Uint16Array
	heightMap: Uint8Array
	stats: Record<GroundType, number>
	width: number
	height: number
	tileWidth: number
	tileHeight: number
	seed: string
	config: MapGenConfig
	spawn: { x: number; y: number }
	resourceNodes: MapResourceNode[]
	deerSpawns: MapResourceNode[]
}

const TILESET = {
	columns: 8,
	firstgid: 1,
	image: 'tiles32.png',
	imageheight: 32,
	imagewidth: 256,
	margin: 0,
	name: 'tiles32',
	spacing: 0,
	tilecount: 8,
	tileheight: 32,
	tilewidth: 32
}

const GID_BY_TYPE: Record<GroundType, number> = GROUND_TYPE_ORDER.reduce(
	(acc, type, index) => {
		acc[type] = index + 1
		return acc
	},
	{} as Record<GroundType, number>
)

const COAST_SIDES = {
	west: true,
	south: true
}
const COAST_BAND = 0.18
const COAST_DROP = 0.38
const COAST_EDGE_TILES = 10
const COAST_EDGE_SEA_OFFSET = 0.02
const COAST_MOUNTAIN_PUSH = 0.09
const MOUNTAIN_HEIGHT_RIDGE_WEIGHT = 0.92
const MOUNTAIN_HEIGHT_SOFTEN = 0.85
const ROCK_CHANCE = 0.016
const ROCK_CLUSTER_CHANCE = 0.2
const ROCK_BUFFER = 4
const ROCK_MOUNTAIN_BUFFER = 6
const LAKE_COUNT_MIN = 10
const LAKE_COUNT_MAX = 20
const LAKE_MIN_TILES = 420
const LAKE_MAX_TILES = 1200
const LAKE_EDGE_BUFFER = 6
const LAKE_WATER_BUFFER = 4
const LAKE_MOUNTAIN_BUFFER = 3
const FOREST_COVERAGE = 0.1
const FOREST_CLUSTER_FRACTION = 0.78
const FOREST_CLUSTER_MIN = 6
const FOREST_CLUSTER_MAX = 14
const FOREST_MIN_CLUSTER = 80
const FOREST_START_BUFFER = 10
const FOREST_WATER_BUFFER = 2
const FOREST_MOUNTAIN_BUFFER = 3
const FOREST_ROCK_BUFFER = 2
const FOREST_SAND_BUFFER = 1
const DEER_DENSITY_RADIUS_TILES = 3
const DEER_MIN_DENSITY = 0.08
const DEER_MIN_DISTANCE_TILES = 6
const DEER_MAX_SPAWNS = 4
const DEER_REQUIRE_FULL_WINDOW = true
const FISH_DENSITY = 0.05
const FISH_MIN_NODES = 18
const FISH_MAX_NODES = 260
const FISH_MIN_SPACING = 2
const STONE_NODE_DENSITY = 0.35
const STONE_MIN_NODES = 40
const STONE_MAX_NODES = 360
const STONE_CLUSTER_SIZE_MIN = 1
const STONE_CLUSTER_SIZE_MAX = 4
const STONE_SPAWN_RADIUS = 28
const STONE_SPAWN_CLUSTER_TARGET = 4
const STONE_SPAWN_ROCK_MIN = 4
const STONE_PATCH_TARGET = 26
const DIRT_MAX_FRACTION = 0.008
const MUD_MAX_FRACTION = 0.006
const DIRT_MIN_FRACTION = 0.0018
const MUD_MIN_FRACTION = 0.0012
const START_REGION = {
	minX: 0.06,
	maxX: 0.35,
	minY: 0.65,
	maxY: 0.94
}
const START_GROWTH_RADIUS = 6
const START_NEARBY_RADII = [90, 140, 190]

const TYPE_BY_GID = GROUND_TYPE_ORDER.reduce(
	(acc, type, index) => {
		acc[index + 1] = type
		return acc
	},
	{} as Record<number, GroundType>
)

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

const hashString = (input: string) => {
	let hash = 1779033703 ^ input.length
	for (let i = 0; i < input.length; i += 1) {
		hash = Math.imul(hash ^ input.charCodeAt(i), 3432918353)
		hash = (hash << 13) | (hash >>> 19)
	}
	return hash >>> 0
}

const hash2D = (x: number, y: number, seed: number) => {
	let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)
	h = Math.imul(h ^ (h >>> 13), 1274126177)
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const valueNoise = (x: number, y: number, seed: number) => {
	const x0 = Math.floor(x)
	const y0 = Math.floor(y)
	const xf = x - x0
	const yf = y - y0
	const u = fade(xf)
	const v = fade(yf)

	const a = hash2D(x0, y0, seed)
	const b = hash2D(x0 + 1, y0, seed)
	const c = hash2D(x0, y0 + 1, seed)
	const d = hash2D(x0 + 1, y0 + 1, seed)

	return lerp(lerp(a, b, u), lerp(c, d, u), v)
}

const fbm = (
	x: number,
	y: number,
	seed: number,
	octaves: number,
	frequency: number,
	lacunarity: number,
	gain: number
) => {
	let sum = 0
	let amp = 1
	let freq = frequency
	let max = 0
	for (let i = 0; i < octaves; i += 1) {
		sum += valueNoise(x * freq, y * freq, seed + i * 1013) * amp
		max += amp
		amp *= gain
		freq *= lacunarity
	}
	return max > 0 ? sum / max : 0
}

const ridgedFbm = (
	x: number,
	y: number,
	seed: number,
	octaves: number,
	frequency: number,
	lacunarity: number,
	gain: number
) => {
	let sum = 0
	let amp = 1
	let freq = frequency
	let max = 0
	for (let i = 0; i < octaves; i += 1) {
		const n = valueNoise(x * freq, y * freq, seed + i * 1999)
		const ridge = 1 - Math.abs(2 * n - 1)
		sum += ridge * amp
		max += amp
		amp *= gain
		freq *= lacunarity
	}
	return max > 0 ? sum / max : 0
}

const initStats = (): Record<GroundType, number> =>
	GROUND_TYPE_ORDER.reduce(
		(acc, type) => {
			acc[type] = 0
			return acc
		},
		{} as Record<GroundType, number>
	)

const paintCircle = (
	tiles: Uint16Array,
	width: number,
	height: number,
	cx: number,
	cy: number,
	radius: number,
	type: GroundType
) => {
	const rSq = radius * radius
	const minX = Math.max(0, cx - radius)
	const maxX = Math.min(width - 1, cx + radius)
	const minY = Math.max(0, cy - radius)
	const maxY = Math.min(height - 1, cy + radius)
	for (let y = minY; y <= maxY; y += 1) {
		for (let x = minX; x <= maxX; x += 1) {
			const dx = x - cx
			const dy = y - cy
			if (dx * dx + dy * dy <= rSq) {
				tiles[y * width + x] = GID_BY_TYPE[type]
			}
		}
	}
}

const neighborOffsets = [
	{ x: 1, y: 0 },
	{ x: -1, y: 0 },
	{ x: 0, y: 1 },
	{ x: 0, y: -1 }
]

const neighborOffsets8 = [
	{ x: 1, y: 0 },
	{ x: -1, y: 0 },
	{ x: 0, y: 1 },
	{ x: 0, y: -1 },
	{ x: 1, y: 1 },
	{ x: 1, y: -1 },
	{ x: -1, y: 1 },
	{ x: -1, y: -1 }
]

const getTypeAt = (tiles: Uint16Array, width: number, height: number, x: number, y: number): GroundType | null => {
	if (x < 0 || x >= width || y < 0 || y >= height) return null
	const gid = tiles[y * width + x]
	return TYPE_BY_GID[gid] ?? null
}

const computeStats = (tiles: Uint16Array): Record<GroundType, number> => {
	const stats = initStats()
	for (let i = 0; i < tiles.length; i += 1) {
		const type = TYPE_BY_GID[tiles[i]]
		if (type) {
			stats[type] += 1
		}
	}
	return stats
}

const encodeRle = (data: ArrayLike<number>): number[] => {
	const length = data.length || 0
	if (length === 0) return []
	const encoded: number[] = []
	let prev = data[0] ?? 0
	let count = 1
	for (let i = 1; i < length; i += 1) {
		const value = data[i] ?? 0
		if (value === prev && count < 65535) {
			count += 1
		} else {
			encoded.push(prev, count)
			prev = value
			count = 1
		}
	}
	encoded.push(prev, count)
	return encoded
}

const buildMountainHeightMap = (
	tiles: Uint16Array,
	width: number,
	height: number,
	heightValues: Float32Array,
	ridgeValues: Float32Array,
	mountainBias: number
): Uint8Array => {
	const heightMap = new Uint8Array(width * height)
	const mountainHeights = new Float32Array(width * height)
	let maxMountainHeight = 0

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const idx = y * width + x
			if (TYPE_BY_GID[tiles[idx]] !== 'mountain') continue

			const westEdge = COAST_SIDES.west
				? clamp((COAST_EDGE_TILES - x) / COAST_EDGE_TILES, 0, 1)
				: 0
			const southEdge = COAST_SIDES.south
				? clamp((COAST_EDGE_TILES - (height - 1 - y)) / COAST_EDGE_TILES, 0, 1)
				: 0
			const edgeMask = Math.max(westEdge, southEdge)
			const edgeFalloff = edgeMask * edgeMask * (3 - 2 * edgeMask)

			const mountainLevel = 0.82 - mountainBias * 0.12 + edgeFalloff * COAST_MOUNTAIN_PUSH
			const mountainRidge =
				0.8 - mountainBias * 0.08 + edgeFalloff * (COAST_MOUNTAIN_PUSH * 0.8)
			const heightStrength = clamp(
				(heightValues[idx] - mountainLevel) / (1 - mountainLevel),
				0,
				1
			)
			const ridgeStrength = clamp(
				(ridgeValues[idx] - mountainRidge) / (1 - mountainRidge),
				0,
				1
			)
			const raw = Math.max(heightStrength, ridgeStrength * MOUNTAIN_HEIGHT_RIDGE_WEIGHT)
			mountainHeights[idx] = raw
			if (raw > maxMountainHeight) maxMountainHeight = raw
		}
	}

	if (maxMountainHeight <= 0) {
		return heightMap
	}

	for (let i = 0; i < mountainHeights.length; i += 1) {
		const raw = mountainHeights[i]
		if (raw <= 0) continue
		const normalized = clamp(raw / maxMountainHeight, 0, 1)
		const eased = Math.pow(fade(normalized), MOUNTAIN_HEIGHT_SOFTEN)
		heightMap[i] = Math.round(eased * 255)
	}

	return heightMap
}

const isNeighborType = (
	tiles: Uint16Array,
	width: number,
	height: number,
	x: number,
	y: number,
	match: Set<GroundType>
): boolean => {
	for (const offset of neighborOffsets) {
		const type = getTypeAt(tiles, width, height, x + offset.x, y + offset.y)
		if (type && match.has(type)) return true
	}
	return false
}

const isNeighborType8 = (
	tiles: Uint16Array,
	width: number,
	height: number,
	x: number,
	y: number,
	match: Set<GroundType>
): boolean => {
	for (const offset of neighborOffsets8) {
		const type = getTypeAt(tiles, width, height, x + offset.x, y + offset.y)
		if (type && match.has(type)) return true
	}
	return false
}

const isTypeWithinRadius = (
	tiles: Uint16Array,
	width: number,
	height: number,
	x: number,
	y: number,
	type: GroundType,
	radius: number
): boolean => {
	const rSq = radius * radius
	for (let dy = -radius; dy <= radius; dy += 1) {
		for (let dx = -radius; dx <= radius; dx += 1) {
			if (dx * dx + dy * dy > rSq) continue
			const nx = x + dx
			const ny = y + dy
			if (getTypeAt(tiles, width, height, nx, ny) === type) {
				return true
			}
		}
	}
	return false
}

const countNeighborType = (
	tiles: Uint16Array,
	width: number,
	height: number,
	x: number,
	y: number,
	match: GroundType
): number => {
	let count = 0
	for (const offset of neighborOffsets) {
		const type = getTypeAt(tiles, width, height, x + offset.x, y + offset.y)
		if (type === match) count += 1
	}
	return count
}

const findGrassSpot = (
	tiles: Uint16Array,
	width: number,
	height: number,
	seed: number,
	maxTries: number
): { x: number; y: number } | null => {
	for (let i = 0; i < maxTries; i += 1) {
		const nx = Math.floor(hash2D(i, 17, seed) * width)
		const ny = Math.floor(hash2D(i, 29, seed) * height)
		if (getTypeAt(tiles, width, height, nx, ny) !== 'grass') continue
		const forbidden = new Set<GroundType>(['water_shallow', 'water_deep', 'rock', 'mountain', 'sand'])
		if (isNeighborType(tiles, width, height, nx, ny, forbidden)) continue
		return { x: nx, y: ny }
	}
	return null
}

const findRockSpot = (
	tiles: Uint16Array,
	width: number,
	height: number,
	seed: number,
	maxTries: number
): { x: number; y: number } | null => {
	for (let i = 0; i < maxTries; i += 1) {
		const nx = Math.floor(hash2D(i, 71, seed) * width)
		const ny = Math.floor(hash2D(i, 89, seed) * height)
		if (getTypeAt(tiles, width, height, nx, ny) !== 'grass') continue
		if (isTypeWithinRadius(tiles, width, height, nx, ny, 'mountain', ROCK_MOUNTAIN_BUFFER)) continue
		if (isTypeWithinRadius(tiles, width, height, nx, ny, 'water_shallow', ROCK_BUFFER)) continue
		if (isTypeWithinRadius(tiles, width, height, nx, ny, 'water_deep', ROCK_BUFFER)) continue
		if (isTypeWithinRadius(tiles, width, height, nx, ny, 'sand', ROCK_BUFFER)) continue
		if (isTypeWithinRadius(tiles, width, height, nx, ny, 'dirt', ROCK_BUFFER)) continue
		if (isTypeWithinRadius(tiles, width, height, nx, ny, 'mud', ROCK_BUFFER)) continue
		return { x: nx, y: ny }
	}
	return null
}

const isAreaGrassWithBuffer = (
	tiles: Uint16Array,
	width: number,
	height: number,
	x: number,
	y: number,
	radius: number,
	buffer: number
): boolean => {
	const r = radius + buffer
	const rSq = r * r
	for (let dy = -r; dy <= r; dy += 1) {
		for (let dx = -r; dx <= r; dx += 1) {
			if (dx * dx + dy * dy > rSq) continue
			const type = getTypeAt(tiles, width, height, x + dx, y + dy)
			if (type !== 'grass') return false
		}
	}
	return true
}

const findGrassPatchSpot = (
	tiles: Uint16Array,
	width: number,
	height: number,
	seed: number,
	radius: number,
	maxTries: number
): { x: number; y: number } | null => {
	for (let i = 0; i < maxTries; i += 1) {
		const nx = Math.floor(hash2D(i, 271, seed) * width)
		const ny = Math.floor(hash2D(i, 337, seed) * height)
		if (getTypeAt(tiles, width, height, nx, ny) !== 'grass') continue
		if (!isAreaGrassWithBuffer(tiles, width, height, nx, ny, radius, 1)) continue
		return { x: nx, y: ny }
	}
	return null
}

const findLakeSeed = (
	tiles: Uint16Array,
	width: number,
	height: number,
	seed: number,
	radius: number,
	maxTries: number
): { x: number; y: number } | null => {
	for (let i = 0; i < maxTries; i += 1) {
		const nx = Math.floor(hash2D(i, 113, seed) * width)
		const ny = Math.floor(hash2D(i, 127, seed) * height)
		if (
			nx < LAKE_EDGE_BUFFER ||
			nx >= width - LAKE_EDGE_BUFFER ||
			ny < LAKE_EDGE_BUFFER ||
			ny >= height - LAKE_EDGE_BUFFER
		) {
			continue
		}
		if (getTypeAt(tiles, width, height, nx, ny) !== 'grass') continue
		if (!isAreaGrassWithBuffer(tiles, width, height, nx, ny, radius, 1)) continue
		if (isTypeWithinRadius(tiles, width, height, nx, ny, 'water_shallow', LAKE_WATER_BUFFER)) continue
		if (isTypeWithinRadius(tiles, width, height, nx, ny, 'water_deep', LAKE_WATER_BUFFER)) continue
		if (isTypeWithinRadius(tiles, width, height, nx, ny, 'mountain', LAKE_MOUNTAIN_BUFFER)) continue
		return { x: nx, y: ny }
	}
	return null
}

const isForestCandidate = (
	tiles: Uint16Array,
	width: number,
	height: number,
	x: number,
	y: number,
	spawn: { x: number; y: number } | null
): boolean => {
	const baseType = getTypeAt(tiles, width, height, x, y)
	if (baseType !== 'grass' && baseType !== 'dirt' && baseType !== 'mud') return false
	if (spawn) {
		const dx = x - spawn.x
		const dy = y - spawn.y
		if (dx * dx + dy * dy <= FOREST_START_BUFFER * FOREST_START_BUFFER) {
			return false
		}
	}
	if (isTypeWithinRadius(tiles, width, height, x, y, 'water_shallow', FOREST_WATER_BUFFER)) return false
	if (isTypeWithinRadius(tiles, width, height, x, y, 'water_deep', FOREST_WATER_BUFFER)) return false
	if (isTypeWithinRadius(tiles, width, height, x, y, 'mountain', FOREST_MOUNTAIN_BUFFER)) return false
	if (isTypeWithinRadius(tiles, width, height, x, y, 'rock', FOREST_ROCK_BUFFER)) return false
	if (isTypeWithinRadius(tiles, width, height, x, y, 'sand', FOREST_SAND_BUFFER)) return false
	return true
}

const findForestSeed = (
	tiles: Uint16Array,
	width: number,
	height: number,
	seed: number,
	spawn: { x: number; y: number } | null,
	maxTries: number
): { x: number; y: number } | null => {
	for (let i = 0; i < maxTries; i += 1) {
		const nx = Math.floor(hash2D(i, 149, seed) * width)
		const ny = Math.floor(hash2D(i, 163, seed) * height)
		if (isForestCandidate(tiles, width, height, nx, ny, spawn)) {
			return { x: nx, y: ny }
		}
	}
	return null
}

const growForestCluster = (
	tiles: Uint16Array,
	width: number,
	height: number,
	seed: number,
	targetCount: number,
	occupied: Uint8Array,
	spawn: { x: number; y: number } | null,
	start: { x: number; y: number }
): { x: number; y: number }[] => {
	if (targetCount <= 0) return []
	const visited = new Uint8Array(tiles.length)
	const queue: { x: number; y: number; dist: number }[] = []
	const positions: { x: number; y: number }[] = []
	const radius = Math.max(3, Math.sqrt(targetCount / Math.PI))
	const maxDist = Math.max(6, radius * 1.9)

	const startIndex = start.y * width + start.x
	if (occupied[startIndex]) return []
	if (!isForestCandidate(tiles, width, height, start.x, start.y, spawn)) return []

	visited[startIndex] = 1
	occupied[startIndex] = 1
	queue.push({ x: start.x, y: start.y, dist: 0 })
	positions.push({ x: start.x, y: start.y })

	while (queue.length && positions.length < targetCount) {
		const current = queue.pop()
		if (!current) break
		const jitter = hash2D(current.x, current.y, seed + 17)
		const offsets = jitter < 0.5 ? neighborOffsets8 : [...neighborOffsets8].reverse()
		for (const offset of offsets) {
			const nx = current.x + offset.x
			const ny = current.y + offset.y
			if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
			const index = ny * width + nx
			if (visited[index]) continue
			visited[index] = 1
			if (occupied[index]) continue
			if (!isForestCandidate(tiles, width, height, nx, ny, spawn)) continue

			const dist = current.dist + 1
			const distFactor = clamp(1 - dist / maxDist, 0, 1)
			const noise = hash2D(nx, ny, seed + 71)
			const chance = 0.35 + distFactor * 0.5
			if (noise > chance) continue

			occupied[index] = 1
			positions.push({ x: nx, y: ny })
			queue.push({ x: nx, y: ny, dist })
			if (positions.length >= targetCount) break
		}
	}

	return positions
}

const generateForestNodes = (
	tiles: Uint16Array,
	width: number,
	height: number,
	seed: number,
	stats: Record<GroundType, number>,
	spawn: { x: number; y: number } | null
): MapResourceNode[] => {
	const totalTiles = width * height
	const nonMountain = totalTiles - (stats.mountain ?? 0)
	if (nonMountain <= 0) return []

	const targetTotal = Math.max(0, Math.round(nonMountain * FOREST_COVERAGE))
	if (targetTotal === 0) return []

	const clusterCount = Math.max(
		FOREST_CLUSTER_MIN,
		Math.round(lerp(FOREST_CLUSTER_MIN, FOREST_CLUSTER_MAX, hash2D(5, 7, seed)))
	)

	const occupied = new Uint8Array(tiles.length)
	const nodes: MapResourceNode[] = []
	let remaining = targetTotal
	let clusteredRemaining = Math.round(targetTotal * FOREST_CLUSTER_FRACTION)

	for (let cluster = 0; cluster < clusterCount && clusteredRemaining > 0; cluster += 1) {
		const clustersLeft = clusterCount - cluster
		const noise = hash2D(cluster, 19, seed + 303)
		const clusterTarget = Math.max(
			FOREST_MIN_CLUSTER,
			Math.floor((clusteredRemaining / clustersLeft) * lerp(0.75, 1.35, noise))
		)
		const seedSpot = findForestSeed(tiles, width, height, seed + 401 + cluster * 17, spawn, 260)
		if (!seedSpot) continue
		const positions = growForestCluster(
			tiles,
			width,
			height,
			seed + 417 + cluster * 19,
			Math.min(clusterTarget, clusteredRemaining),
			occupied,
			spawn,
			seedSpot
		)
		for (const pos of positions) {
			nodes.push({ nodeType: 'tree', position: pos, tileBased: true })
		}
		clusteredRemaining -= positions.length
		remaining -= positions.length
	}

	if (remaining > 0) {
		let tries = 0
		const maxTries = remaining * 12
		while (remaining > 0 && tries < maxTries) {
			const nx = Math.floor(hash2D(tries, 211, seed + 701) * width)
			const ny = Math.floor(hash2D(tries, 227, seed + 709) * height)
			const index = ny * width + nx
			if (!occupied[index] && isForestCandidate(tiles, width, height, nx, ny, spawn)) {
				const noise = hash2D(nx, ny, seed + 811)
				if (noise < 0.55) {
					occupied[index] = 1
					nodes.push({ nodeType: 'tree', position: { x: nx, y: ny }, tileBased: true })
					remaining -= 1
				}
			}
			tries += 1
		}
	}

	return nodes
}

const buildForestMask = (nodes: MapResourceNode[], width: number, height: number) => {
	const mask = new Uint8Array(width * height)
	for (const node of nodes) {
		const x = node.position.x
		const y = node.position.y
		if (x < 0 || y < 0 || x >= width || y >= height) continue
		mask[y * width + x] = 1
	}
	return mask
}

const buildForestDensity = (mask: Uint8Array, width: number, height: number, radius: number) => {
	const prefixSum = new Int32Array((width + 1) * (height + 1))

	for (let y = 1; y <= height; y += 1) {
		const rowOffset = y * (width + 1)
		const prevOffset = (y - 1) * (width + 1)
		for (let x = 1; x <= width; x += 1) {
			const maskIndex = (y - 1) * width + (x - 1)
			prefixSum[rowOffset + x] =
				prefixSum[rowOffset + x - 1] +
				prefixSum[prevOffset + x] -
				prefixSum[prevOffset + x - 1] +
				(mask[maskIndex] || 0)
		}
	}

	const windowSize = (radius * 2 + 1) ** 2
	return { prefixSum, radius, windowSize }
}

const getForestDensityAt = (
	x: number,
	y: number,
	width: number,
	height: number,
	density: { prefixSum: Int32Array; radius: number; windowSize: number }
) => {
	const radius = density.radius
	let x0 = x - radius
	let y0 = y - radius
	let x1 = x + radius
	let y1 = y + radius

	if (!DEER_REQUIRE_FULL_WINDOW) {
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

	const total = DEER_REQUIRE_FULL_WINDOW
		? density.windowSize
		: (x1 - x0 + 1) * (y1 - y0 + 1)

	return total === 0 ? 0 : sum / total
}

const generateDeerSpawns = (
	forestNodes: MapResourceNode[],
	width: number,
	height: number
): MapResourceNode[] => {
	if (forestNodes.length === 0) return []

	const mask = buildForestMask(forestNodes, width, height)
	const density = buildForestDensity(mask, width, height, DEER_DENSITY_RADIUS_TILES)
	const candidates: Array<{ x: number; y: number; density: number }> = []

	const startX = DEER_REQUIRE_FULL_WINDOW ? DEER_DENSITY_RADIUS_TILES : 0
	const startY = DEER_REQUIRE_FULL_WINDOW ? DEER_DENSITY_RADIUS_TILES : 0
	const endX = DEER_REQUIRE_FULL_WINDOW ? width - DEER_DENSITY_RADIUS_TILES : width
	const endY = DEER_REQUIRE_FULL_WINDOW ? height - DEER_DENSITY_RADIUS_TILES : height

	for (let y = startY; y < endY; y += 1) {
		for (let x = startX; x < endX; x += 1) {
			const index = y * width + x
			if (mask[index] === 0) continue
			const tileDensity = getForestDensityAt(x, y, width, height, density)
			if (tileDensity < DEER_MIN_DENSITY) continue
			candidates.push({ x, y, density: tileDensity })
		}
	}

	candidates.sort((a, b) => {
		if (b.density !== a.density) return b.density - a.density
		if (a.y !== b.y) return a.y - b.y
		return a.x - b.x
	})

	const selected: MapResourceNode[] = []
	const minDistanceSq = DEER_MIN_DISTANCE_TILES * DEER_MIN_DISTANCE_TILES

	for (const candidate of candidates) {
		let tooClose = false
		for (const existing of selected) {
			const dx = existing.position.x - candidate.x
			const dy = existing.position.y - candidate.y
			if ((dx * dx + dy * dy) < minDistanceSq) {
				tooClose = true
				break
			}
		}
		if (tooClose) continue

		selected.push({
			nodeType: 'deer',
			position: { x: candidate.x, y: candidate.y },
			tileBased: true
		})
		if (selected.length >= DEER_MAX_SPAWNS) break
	}

	return selected
}

const generateFishNodes = (
	tiles: Uint16Array,
	width: number,
	height: number,
	seed: number,
	lakeMask: Uint8Array
): MapResourceNode[] => {
	const lakeIndices: number[] = []
	for (let i = 0; i < lakeMask.length; i += 1) {
		if (!lakeMask[i]) continue
		if (tiles[i] !== GID_BY_TYPE.water_deep) continue
		lakeIndices.push(i)
	}
	if (lakeIndices.length === 0) return []

	const target = Math.min(
		lakeIndices.length,
		Math.max(FISH_MIN_NODES, Math.min(FISH_MAX_NODES, Math.round(lakeIndices.length * FISH_DENSITY)))
	)
	if (target <= 0) return []

	const fishMask = new Uint8Array(tiles.length)
	const nodes: MapResourceNode[] = []

	const isFishNearby = (x: number, y: number) => {
		for (let dy = -FISH_MIN_SPACING; dy <= FISH_MIN_SPACING; dy += 1) {
			for (let dx = -FISH_MIN_SPACING; dx <= FISH_MIN_SPACING; dx += 1) {
				if (dx === 0 && dy === 0) continue
				const nx = x + dx
				const ny = y + dy
				if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
				if (fishMask[ny * width + nx]) return true
			}
		}
		return false
	}

	let placed = 0
	let tries = 0
	const maxTries = lakeIndices.length * 6
	while (placed < target && tries < maxTries) {
		const pick = lakeIndices[Math.floor(hash2D(tries, 331, seed) * lakeIndices.length)]
		const x = pick % width
		const y = Math.floor(pick / width)
		if (!fishMask[pick] && !isFishNearby(x, y)) {
			fishMask[pick] = 1
			nodes.push({ nodeType: 'fish', position: { x, y }, tileBased: true })
			placed += 1
		}
		tries += 1
	}

	return nodes
}

const findRockTilesNear = (
	tiles: Uint16Array,
	width: number,
	height: number,
	center: { x: number; y: number },
	radius: number
): number[] => {
	const indices: number[] = []
	const rSq = radius * radius
	const minX = Math.max(0, center.x - radius)
	const maxX = Math.min(width - 1, center.x + radius)
	const minY = Math.max(0, center.y - radius)
	const maxY = Math.min(height - 1, center.y + radius)
	for (let y = minY; y <= maxY; y += 1) {
		for (let x = minX; x <= maxX; x += 1) {
			const dx = x - center.x
			const dy = y - center.y
			if (dx * dx + dy * dy > rSq) continue
			const idx = y * width + x
			if (tiles[idx] === GID_BY_TYPE.rock) {
				indices.push(idx)
			}
		}
	}
	return indices
}

const findRockPatchSpotNearSpawn = (
	tiles: Uint16Array,
	width: number,
	height: number,
	spawn: { x: number; y: number },
	seed: number,
	radius: number,
	minDist: number,
	maxTries: number
): { x: number; y: number } | null => {
	for (let i = 0; i < maxTries; i += 1) {
		const angle = hash2D(i, 411, seed) * Math.PI * 2
		const dist = minDist + hash2D(i, 433, seed) * (radius - minDist)
		const x = Math.round(spawn.x + Math.cos(angle) * dist)
		const y = Math.round(spawn.y + Math.sin(angle) * dist)
		if (x < 0 || x >= width || y < 0 || y >= height) continue
		if (!isAreaGrassWithBuffer(tiles, width, height, x, y, 2, 1)) continue
		if (isTypeWithinRadius(tiles, width, height, x, y, 'water_shallow', 3)) continue
		if (isTypeWithinRadius(tiles, width, height, x, y, 'water_deep', 3)) continue
		if (isTypeWithinRadius(tiles, width, height, x, y, 'mountain', 4)) continue
		if (isTypeWithinRadius(tiles, width, height, x, y, 'sand', 2)) continue
		if (isTypeWithinRadius(tiles, width, height, x, y, 'dirt', 2)) continue
		if (isTypeWithinRadius(tiles, width, height, x, y, 'mud', 2)) continue
		return { x, y }
	}
	return null
}

const ensureRockPatchNearSpawn = (
	tiles: Uint16Array,
	width: number,
	height: number,
	spawn: { x: number; y: number },
	seed: number
): void => {
	const nearRock = findRockTilesNear(tiles, width, height, spawn, STONE_SPAWN_RADIUS)
	if (nearRock.length >= STONE_SPAWN_ROCK_MIN) return

	const spot = findRockPatchSpotNearSpawn(
		tiles,
		width,
		height,
		spawn,
		seed,
		STONE_SPAWN_RADIUS,
		6,
		120
	)
	if (!spot) return

	const rockForbidden = new Set<GroundType>([
		'water_shallow',
		'water_deep',
		'sand',
		'dirt',
		'mud',
		'mountain'
	])
	growNoisyPatch(tiles, width, height, 'rock', seed + 73, STONE_PATCH_TARGET, rockForbidden, spot)
}

const growStoneCluster = (
	tiles: Uint16Array,
	width: number,
	height: number,
	seed: number,
	targetCount: number,
	occupied: Uint8Array,
	startIndex: number
): { x: number; y: number }[] => {
	if (targetCount <= 0) return []
	const visited = new Uint8Array(tiles.length)
	const queue: number[] = [startIndex]
	const positions: { x: number; y: number }[] = []
	visited[startIndex] = 1

	while (queue.length && positions.length < targetCount) {
		const currentIndex = queue.pop()
		if (currentIndex == null) break
		const cx = currentIndex % width
		const cy = Math.floor(currentIndex / width)
		if (!occupied[currentIndex]) {
			occupied[currentIndex] = 1
			positions.push({ x: cx, y: cy })
			if (positions.length >= targetCount) break
		}
		const offsets = hash2D(cx, cy, seed + 19) < 0.5 ? neighborOffsets8 : [...neighborOffsets8].reverse()
		for (const offset of offsets) {
			const nx = cx + offset.x
			const ny = cy + offset.y
			if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
			const nIndex = ny * width + nx
			if (visited[nIndex]) continue
			visited[nIndex] = 1
			if (tiles[nIndex] !== GID_BY_TYPE.rock) continue
			queue.push(nIndex)
		}
	}

	return positions
}

const generateStoneNodes = (
	tiles: Uint16Array,
	width: number,
	height: number,
	seed: number,
	spawn: { x: number; y: number } | null
): MapResourceNode[] => {
	const rockIndices: number[] = []
	for (let i = 0; i < tiles.length; i += 1) {
		if (tiles[i] === GID_BY_TYPE.rock) {
			rockIndices.push(i)
		}
	}
	if (rockIndices.length === 0) return []

	const targetTotal = Math.min(
		rockIndices.length,
		Math.max(STONE_MIN_NODES, Math.min(STONE_MAX_NODES, Math.round(rockIndices.length * STONE_NODE_DENSITY)))
	)
	if (targetTotal <= 0) return []

	const occupied = new Uint8Array(tiles.length)
	const nodes: MapResourceNode[] = []
	let remaining = targetTotal

	if (spawn) {
		const nearSpawn = findRockTilesNear(tiles, width, height, spawn, STONE_SPAWN_RADIUS)
		if (nearSpawn.length > 0) {
			const seedIndex = nearSpawn[Math.floor(hash2D(7, 11, seed) * nearSpawn.length)]
			const clusterTarget = Math.min(remaining, STONE_SPAWN_CLUSTER_TARGET)
			const positions = growStoneCluster(
				tiles,
				width,
				height,
				seed + 67,
				clusterTarget,
				occupied,
				seedIndex
			)
			for (const pos of positions) {
				nodes.push({ nodeType: 'stone_deposit', position: pos, tileBased: true })
			}
			remaining -= positions.length
		}
	}

	let attempts = 0
	const maxAttempts = rockIndices.length * 3
	while (remaining > 0 && attempts < maxAttempts) {
		const seedIndex = rockIndices[Math.floor(hash2D(attempts, 91, seed + 29) * rockIndices.length)]
		if (occupied[seedIndex]) {
			attempts += 1
			continue
		}
		const sizeNoise = hash2D(attempts, 101, seed + 47)
		const clusterTarget =
			STONE_CLUSTER_SIZE_MIN +
			Math.floor(sizeNoise * (STONE_CLUSTER_SIZE_MAX - STONE_CLUSTER_SIZE_MIN + 1))
		const positions = growStoneCluster(
			tiles,
			width,
			height,
			seed + 83 + attempts * 11,
			Math.min(clusterTarget, remaining),
			occupied,
			seedIndex
		)
		for (const pos of positions) {
			nodes.push({ nodeType: 'stone_deposit', position: pos, tileBased: true })
		}
		remaining -= positions.length
		attempts += 1
	}

	return nodes
}

const limitPatchSize = (
	tiles: Uint16Array,
	width: number,
	height: number,
	type: GroundType,
	maxSize: number,
	seed: number
): void => {
	if (maxSize <= 0) return
	const visited = new Uint8Array(tiles.length)

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const index = y * width + x
			if (visited[index]) continue
			if (getTypeAt(tiles, width, height, x, y) !== type) continue

			const stack = [{ x, y }]
			const cells: { x: number; y: number }[] = []
			visited[index] = 1

			while (stack.length) {
				const current = stack.pop()
				if (!current) break
				cells.push(current)
				for (const offset of neighborOffsets) {
					const nx = current.x + offset.x
					const ny = current.y + offset.y
					if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
					const nIndex = ny * width + nx
					if (visited[nIndex]) continue
					if (getTypeAt(tiles, width, height, nx, ny) !== type) continue
					visited[nIndex] = 1
					stack.push({ x: nx, y: ny })
				}
			}

			if (cells.length <= maxSize) continue

			let sumX = 0
			let sumY = 0
			for (const cell of cells) {
				sumX += cell.x
				sumY += cell.y
			}
			const centerX = sumX / cells.length
			const centerY = sumY / cells.length

			cells.sort((a, b) => {
				const da = (a.x - centerX) * (a.x - centerX) + (a.y - centerY) * (a.y - centerY)
				const db = (b.x - centerX) * (b.x - centerX) + (b.y - centerY) * (b.y - centerY)
				const na = hash2D(a.x, a.y, seed)
				const nb = hash2D(b.x, b.y, seed)
				const scoreA = da * (0.75 + na * 0.5)
				const scoreB = db * (0.75 + nb * 0.5)
				if (scoreA !== scoreB) return scoreB - scoreA
				return na - nb
			})

			for (let i = maxSize; i < cells.length; i += 1) {
				const cell = cells[i]
				tiles[cell.y * width + cell.x] = GID_BY_TYPE.grass
			}
		}
	}
}

const canPlacePatchTile = (
	tiles: Uint16Array,
	width: number,
	height: number,
	x: number,
	y: number,
	type: GroundType,
	forbidden: Set<GroundType>
): boolean => {
	const current = getTypeAt(tiles, width, height, x, y)
	if (current && current !== 'grass' && current !== type) return false
	for (const offset of neighborOffsets) {
		const neighborType = getTypeAt(tiles, width, height, x + offset.x, y + offset.y)
		if (neighborType && forbidden.has(neighborType)) {
			return false
		}
	}
	return true
}

const growNoisyPatch = (
	tiles: Uint16Array,
	width: number,
	height: number,
	type: GroundType,
	seed: number,
	targetCount: number,
	forbidden: Set<GroundType>,
	start?: { x: number; y: number } | null,
	mark?: Uint8Array
): number => {
	if (targetCount <= 0) return 0
	const visited = new Uint8Array(tiles.length)
	const queue: { x: number; y: number; dist: number }[] = []
	let filled = 0
	const radius = Math.max(4, Math.sqrt(targetCount / Math.PI))
	const maxDist = Math.max(6, radius * 1.8)

	const seedSpot =
		start ?? findGrassPatchSpot(tiles, width, height, seed, Math.max(3, Math.floor(radius / 2)), 220)
	if (!seedSpot) return 0
	if (!canPlacePatchTile(tiles, width, height, seedSpot.x, seedSpot.y, type, forbidden)) return 0

	tiles[seedSpot.y * width + seedSpot.x] = GID_BY_TYPE[type]
	visited[seedSpot.y * width + seedSpot.x] = 1
	queue.push({ x: seedSpot.x, y: seedSpot.y, dist: 0 })
	if (mark) mark[seedSpot.y * width + seedSpot.x] = 1
	filled += 1

	const seedCount = 3
	for (let i = 1; i < seedCount; i += 1) {
		let placed = false
		for (let attempt = 0; attempt < 30 && !placed; attempt += 1) {
			const randA = hash2D(seedSpot.x + attempt * 31, seedSpot.y + i * 17, seed + 61)
			const randB = hash2D(seedSpot.x + attempt * 17, seedSpot.y + i * 29, seed + 97)
			const dist = 1 + Math.floor(randA * Math.max(2, radius * 0.6))
			const angle = randB * Math.PI * 2
			const nx = seedSpot.x + Math.round(Math.cos(angle) * dist)
			const ny = seedSpot.y + Math.round(Math.sin(angle) * dist)
			if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
			const index = ny * width + nx
			if (visited[index]) continue
			if (!canPlacePatchTile(tiles, width, height, nx, ny, type, forbidden)) continue
			tiles[index] = GID_BY_TYPE[type]
			visited[index] = 1
			queue.push({ x: nx, y: ny, dist: 0 })
			filled += 1
			placed = true
		}
	}

	while (queue.length && filled < targetCount) {
		const current = queue.pop()
		if (!current) break
		const jitter = hash2D(current.x, current.y, seed + 33)
		const offsets = jitter < 0.5 ? neighborOffsets : [...neighborOffsets].reverse()
		for (const offset of offsets) {
			const nx = current.x + offset.x
			const ny = current.y + offset.y
			if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
			const index = ny * width + nx
			if (visited[index]) continue
			visited[index] = 1
			if (!canPlacePatchTile(tiles, width, height, nx, ny, type, forbidden)) continue

			const dist = current.dist + 1
			const distFactor = clamp(1 - dist / maxDist, 0, 1)
			const noise = hash2D(nx, ny, seed + 199)
			const chance = 0.25 + distFactor * 0.55
			if (noise > chance) continue

			tiles[index] = GID_BY_TYPE[type]
			if (mark) mark[index] = 1
			filled += 1
			queue.push({ x: nx, y: ny, dist })
			if (filled >= targetCount) break
		}
	}

	return filled
}

const ensureMinimumCoverage = (
	tiles: Uint16Array,
	width: number,
	height: number,
	type: GroundType,
	minCount: number,
	seed: number,
	forbidden: Set<GroundType>
): void => {
	let current = 0
	for (let i = 0; i < tiles.length; i += 1) {
		if (TYPE_BY_GID[tiles[i]] === type) current += 1
	}
	if (current >= minCount) return

	let remaining = minCount - current
	let patches = 0
	while (remaining > 0 && patches < 4) {
		const target = Math.max(90, Math.floor(remaining / (4 - patches)))
		const filled = growNoisyPatch(tiles, width, height, type, seed + patches * 31, target, forbidden)
		if (filled === 0) break
		current += filled
		remaining = minCount - current
		patches += 1
	}
}

const isGrowthAreaClear = (
	tiles: Uint16Array,
	width: number,
	height: number,
	x: number,
	y: number,
	radius: number
): boolean => {
	const rSq = radius * radius
	for (let dy = -radius; dy <= radius; dy += 1) {
		for (let dx = -radius; dx <= radius; dx += 1) {
			if (dx * dx + dy * dy > rSq) continue
			const type = getTypeAt(tiles, width, height, x + dx, y + dy)
			if (type !== 'grass') return false
		}
	}
	return true
}

const evaluateBiomeProximity = (
	tiles: Uint16Array,
	width: number,
	height: number,
	x: number,
	y: number,
	radius: number
): { found: number; score: number; allFound: boolean } => {
	const rSq = radius * radius
	let sandDist = Infinity
	let dirtDist = Infinity
	let mudDist = Infinity
	let rockDist = Infinity
	let mountainDist = Infinity
	let waterDist = Infinity

	for (let dy = -radius; dy <= radius; dy += 1) {
		for (let dx = -radius; dx <= radius; dx += 1) {
			const distSq = dx * dx + dy * dy
			if (distSq > rSq) continue
			const nx = x + dx
			const ny = y + dy
			const type = getTypeAt(tiles, width, height, nx, ny)
			if (!type) continue
			if (type === 'sand' && distSq < sandDist) sandDist = distSq
			if (type === 'dirt' && distSq < dirtDist) dirtDist = distSq
			if (type === 'mud' && distSq < mudDist) mudDist = distSq
			if (type === 'rock' && distSq < rockDist) rockDist = distSq
			if (type === 'mountain' && distSq < mountainDist) mountainDist = distSq
			if ((type === 'water_shallow' || type === 'water_deep') && distSq < waterDist) waterDist = distSq
			if (
				sandDist <= rSq &&
				dirtDist <= rSq &&
				mudDist <= rSq &&
				rockDist <= rSq &&
				mountainDist <= rSq &&
				waterDist <= rSq
			) {
				dy = radius + 1
				break
			}
		}
	}

	const distances = [sandDist, dirtDist, mudDist, rockDist, mountainDist, waterDist]
	const found = distances.filter((value) => value <= rSq).length
	const score =
		found * 1000000 -
		distances.reduce((sum, value) => sum + (Number.isFinite(value) ? value : rSq * 4), 0)
	const allFound = found === distances.length
	return { found, score, allFound }
}

const findStartPoint = (
	tiles: Uint16Array,
	width: number,
	height: number,
	seed: number
): { x: number; y: number } | null => {
	const minX = Math.floor(width * START_REGION.minX)
	const maxX = Math.floor(width * START_REGION.maxX)
	const minY = Math.floor(height * START_REGION.minY)
	const maxY = Math.floor(height * START_REGION.maxY)
	const tries = 260

	let best: { x: number; y: number; score: number; found: number } | null = null

	for (const radius of START_NEARBY_RADII) {
		for (let i = 0; i < tries; i += 1) {
			const nx = Math.floor(lerp(minX, maxX, hash2D(i, 401, seed)))
			const ny = Math.floor(lerp(minY, maxY, hash2D(i, 547, seed)))
			if (getTypeAt(tiles, width, height, nx, ny) !== 'grass') continue
			if (!isGrowthAreaClear(tiles, width, height, nx, ny, START_GROWTH_RADIUS)) continue

			const proximity = evaluateBiomeProximity(tiles, width, height, nx, ny, radius)
			if (!best || proximity.score > best.score) {
				best = { x: nx, y: ny, score: proximity.score, found: proximity.found }
			}
			if (proximity.allFound) {
				return { x: nx, y: ny }
			}
		}
	}

	return best ? { x: best.x, y: best.y } : null
}

export const generateMap = (config: MapGenConfig): MapGenResult => {
	const width = Math.max(1, Math.floor(config.width))
	const height = Math.max(1, Math.floor(config.height))
	const tileWidth = Math.max(1, Math.floor(config.tileWidth))
	const tileHeight = Math.max(1, Math.floor(config.tileHeight))
	const tiles = new Uint16Array(width * height)
	const heightValues = new Float32Array(width * height)
	const ridgeValues = new Float32Array(width * height)

	const seedBase = hashString(config.seed || 'settlerpolis')
	const heightSeed = seedBase + 11
	const ridgeSeed = seedBase + 37
	const lakeSeed = seedBase + 79
	const moistureSeed = seedBase + 131
	const tempSeed = seedBase + 197

	const roughness = clamp(config.roughness, 0.4, 1.4)
	const roughness01 = clamp((roughness - 0.4) / 1.0, 0, 1)
	const seaLevel = clamp(config.seaLevel, 0.12, 0.5)
	const grassBias = clamp(config.grassBias, 0, 1)
	const mountainBias = clamp(config.mountainBias, 0, 1)
	const moistureBias = clamp(config.moisture, 0, 1)
	const tempBias = clamp(config.temperature, 0, 1)

	const baseScale = lerp(0.9, 2.6, roughness01)
	const detailScale = lerp(1.6, 4.4, roughness01)
	const ridgeWeight = lerp(0.2, 0.38, roughness01)
	const widthInv = 1 / width
	const heightInv = 1 / height

	let maxHeight = -1
	let maxHeightIndex = 0

	for (let y = 0; y < height; y += 1) {
		const ny = y * heightInv
		const latitude = 1 - Math.abs(ny - 0.5) * 2
		for (let x = 0; x < width; x += 1) {
			const nx = x * widthInv
			const edge = Math.min(nx, 1 - nx, ny, 1 - ny) * 2
			const edgeBoost = (1 - edge) * 0.06

			const westMask = COAST_SIDES.west ? clamp((COAST_BAND - nx) / COAST_BAND, 0, 1) : 0
			const southMask = COAST_SIDES.south ? clamp((COAST_BAND - (1 - ny)) / COAST_BAND, 0, 1) : 0
			const coastMask = Math.max(westMask, southMask)
			const coastFalloff = coastMask * coastMask * (3 - 2 * coastMask)
			const westEdge = COAST_SIDES.west
				? clamp((COAST_EDGE_TILES - x) / COAST_EDGE_TILES, 0, 1)
				: 0
			const southEdge = COAST_SIDES.south
				? clamp((COAST_EDGE_TILES - (height - 1 - y)) / COAST_EDGE_TILES, 0, 1)
				: 0
			const edgeMask = Math.max(westEdge, southEdge)
			const edgeFalloff = edgeMask * edgeMask * (3 - 2 * edgeMask)

			const heightNoise = fbm(nx, ny, heightSeed, 5, baseScale, 2, 0.5)
			const ridgeNoise = ridgedFbm(nx, ny, ridgeSeed, 3, detailScale, 2, 0.5)
			const lakeNoise = fbm(nx, ny, lakeSeed, 2, detailScale * 1.3, 2, 0.6)
			const moistureNoise = fbm(nx, ny, moistureSeed, 3, baseScale * 1.5, 2, 0.55)
			const tempNoise = fbm(nx, ny, tempSeed, 2, baseScale * 1.2, 2, 0.6)

			const ridgeWeightLocal = ridgeWeight * (1 - edgeFalloff * 0.75)
			let heightValue = heightNoise * (1 - ridgeWeightLocal) + ridgeNoise * ridgeWeightLocal
			heightValue = clamp(heightValue + edgeBoost + 0.04 - coastFalloff * COAST_DROP, 0, 1)
			heightValue = lerp(heightValue, seaLevel - COAST_EDGE_SEA_OFFSET, edgeFalloff)

			const lakeHeight = heightValue - (lakeNoise - 0.5) * 0.12
			const moistureValue = clamp(moistureNoise * 0.75 + moistureBias * 0.25, 0, 1)
			const temperatureValue = clamp(latitude * 0.6 + tempNoise * 0.25 + tempBias * 0.15, 0, 1)
			const effectiveMoisture = clamp(
				moistureValue - (temperatureValue - 0.5) * 0.25,
				0,
				1
			)

			const mountainLevel = 0.82 - mountainBias * 0.12 + edgeFalloff * COAST_MOUNTAIN_PUSH
			const mountainRidge = 0.8 - mountainBias * 0.08 + edgeFalloff * (COAST_MOUNTAIN_PUSH * 0.8)
			const beachLevel = seaLevel + 0.035
			const mudMoisture = 0.74 + (1 - grassBias) * 0.06
			const mudHeight = seaLevel + 0.12
			const dirtMoisture = 0.38 - grassBias * 0.18
			const sandMoisture = 0.28 - grassBias * 0.1

			let type: GroundType
			if (lakeHeight < seaLevel) {
				const depth = seaLevel - lakeHeight + edgeFalloff * 0.08
				const deepThreshold = 0.07 - edgeFalloff * 0.05
				type = depth > deepThreshold ? 'water_deep' : 'water_shallow'
			} else if (heightValue > mountainLevel || ridgeNoise > mountainRidge) {
				type = 'mountain'
			} else if (heightValue < beachLevel && effectiveMoisture < sandMoisture) {
				type = 'sand'
			} else if (effectiveMoisture > mudMoisture && heightValue < mudHeight) {
				type = 'mud'
			} else if (effectiveMoisture < dirtMoisture) {
				type = 'dirt'
			} else {
				type = 'grass'
			}

			const idx = y * width + x
			tiles[idx] = GID_BY_TYPE[type]
			heightValues[idx] = heightValue
			ridgeValues[idx] = ridgeNoise

			if (heightValue > maxHeight) {
				maxHeight = heightValue
				maxHeightIndex = idx
			}
		}
	}

	const lakeAreaScale = clamp((width * height) / (512 * 512), 0.6, 1.8)
	const lakeCount = Math.max(
		2,
		Math.round(lerp(LAKE_COUNT_MIN, LAKE_COUNT_MAX, hash2D(19, 29, seedBase)) * lakeAreaScale)
	)
	const lakeGrowForbidden = new Set<GroundType>(['mountain', 'rock', 'sand', 'dirt', 'mud'])
	const lakeMask = new Uint8Array(tiles.length)
	let lakesPlaced = 0
	let lakeTries = 0
	while (lakesPlaced < lakeCount && lakeTries < lakeCount * 18) {
		const sizeNoise = hash2D(lakeTries, 41, seedBase + 521)
		const target = Math.floor(lerp(LAKE_MIN_TILES, LAKE_MAX_TILES, sizeNoise))
		const radius = Math.max(4, Math.floor(Math.sqrt(target / Math.PI)))
		const lakeSeedSpot = findLakeSeed(
			tiles,
			width,
			height,
			seedBase + 541 + lakeTries * 31,
			radius,
			220
		)
		if (lakeSeedSpot) {
			const filled = growNoisyPatch(
				tiles,
				width,
				height,
				'water_deep',
				seedBase + 557 + lakeTries * 17,
				target,
				lakeGrowForbidden,
				lakeSeedSpot,
				lakeMask
			)
			if (filled > 0) {
				lakesPlaced += 1
			}
		}
		lakeTries += 1
	}

	if (lakesPlaced > 0) {
		for (let i = 0; i < lakeMask.length; i += 1) {
			if (!lakeMask[i]) continue
			const x = i % width
			const y = Math.floor(i / width)
			for (const offset of neighborOffsets8) {
				const nx = x + offset.x
				const ny = y + offset.y
				if (getTypeAt(tiles, width, height, nx, ny) !== 'grass') continue
				tiles[ny * width + nx] = GID_BY_TYPE.water_shallow
			}
		}
	}

	const shorelineSeed = seedBase + 409
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const type = getTypeAt(tiles, width, height, x, y)
			if (type !== 'water_shallow' && type !== 'water_deep') continue
			for (const offset of neighborOffsets) {
				const nx = x + offset.x
				const ny = y + offset.y
				if (getTypeAt(tiles, width, height, nx, ny) !== 'grass') continue
				const chance = hash2D(nx, ny, shorelineSeed)
				if (chance < 0.55) {
					tiles[ny * width + nx] = GID_BY_TYPE.sand
				}
			}
		}
	}

	const sandAllowedNeighbors = new Set<GroundType>(['grass', 'water_shallow', 'water_deep', 'sand'])
	const dirtForbiddenNeighbors = new Set<GroundType>([
		'water_shallow',
		'water_deep',
		'rock',
		'mountain',
		'sand'
	])

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const type = getTypeAt(tiles, width, height, x, y)
			if (type === 'sand') {
				let invalid = false
				let touchesWater = false
				for (const offset of neighborOffsets) {
					const neighborType = getTypeAt(tiles, width, height, x + offset.x, y + offset.y)
					if (!neighborType) continue
					if (neighborType === 'water_shallow' || neighborType === 'water_deep') {
						touchesWater = true
					}
					if (!sandAllowedNeighbors.has(neighborType)) {
						invalid = true
						break
					}
				}
				if (!touchesWater || invalid) {
					tiles[y * width + x] = GID_BY_TYPE.grass
				}
			} else if (type === 'dirt' || type === 'mud') {
				if (isNeighborType(tiles, width, height, x, y, dirtForbiddenNeighbors)) {
					tiles[y * width + x] = GID_BY_TYPE.grass
				}
			}
		}
	}

	const rockSeed = seedBase + 911
	const rockSeed2 = seedBase + 913
	const rockMask = new Uint8Array(width * height)
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			if (getTypeAt(tiles, width, height, x, y) !== 'grass') continue
			if (isTypeWithinRadius(tiles, width, height, x, y, 'mountain', ROCK_MOUNTAIN_BUFFER)) continue
			if (isTypeWithinRadius(tiles, width, height, x, y, 'water_shallow', ROCK_BUFFER)) continue
			if (isTypeWithinRadius(tiles, width, height, x, y, 'water_deep', ROCK_BUFFER)) continue
			if (isTypeWithinRadius(tiles, width, height, x, y, 'sand', ROCK_BUFFER)) continue
			if (isTypeWithinRadius(tiles, width, height, x, y, 'dirt', ROCK_BUFFER)) continue
			if (isTypeWithinRadius(tiles, width, height, x, y, 'mud', ROCK_BUFFER)) continue
			if (hash2D(x, y, rockSeed) < ROCK_CHANCE) {
				rockMask[y * width + x] = 1
			}
		}
	}

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const idx = y * width + x
			if (rockMask[idx]) continue
			if (getTypeAt(tiles, width, height, x, y) !== 'grass') continue
			if (isTypeWithinRadius(tiles, width, height, x, y, 'mountain', ROCK_MOUNTAIN_BUFFER)) continue
			if (isTypeWithinRadius(tiles, width, height, x, y, 'water_shallow', ROCK_BUFFER)) continue
			if (isTypeWithinRadius(tiles, width, height, x, y, 'water_deep', ROCK_BUFFER)) continue
			if (isTypeWithinRadius(tiles, width, height, x, y, 'sand', ROCK_BUFFER)) continue
			if (isTypeWithinRadius(tiles, width, height, x, y, 'dirt', ROCK_BUFFER)) continue
			if (isTypeWithinRadius(tiles, width, height, x, y, 'mud', ROCK_BUFFER)) continue
			const hasRockNeighbor = neighborOffsets8.some((offset) => {
				const nx = x + offset.x
				const ny = y + offset.y
				if (nx < 0 || nx >= width || ny < 0 || ny >= height) return false
				return rockMask[ny * width + nx] === 1
			})
			if (hasRockNeighbor && hash2D(x, y, rockSeed2) < ROCK_CLUSTER_CHANCE) {
				rockMask[idx] = 1
			}
		}
	}

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const idx = y * width + x
			if (rockMask[idx] !== 1) continue
			tiles[idx] = GID_BY_TYPE.rock
		}
	}

	const rockForbidden = new Set<GroundType>([
		'water_shallow',
		'water_deep',
		'sand',
		'dirt',
		'mud',
		'mountain'
	])
	const rockAllowed = new Set<GroundType>(['grass', 'rock'])
	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			if (getTypeAt(tiles, width, height, x, y) !== 'rock') continue
			if (isTypeWithinRadius(tiles, width, height, x, y, 'mountain', ROCK_MOUNTAIN_BUFFER)) {
				tiles[y * width + x] = GID_BY_TYPE.grass
				continue
			}
			if (isNeighborType8(tiles, width, height, x, y, rockForbidden)) {
				tiles[y * width + x] = GID_BY_TYPE.grass
				continue
			}
			let invalidNeighbor = false
			for (const offset of neighborOffsets8) {
				const neighborType = getTypeAt(tiles, width, height, x + offset.x, y + offset.y)
				if (!neighborType) continue
				if (!rockAllowed.has(neighborType)) {
					invalidNeighbor = true
					break
				}
			}
			if (invalidNeighbor) {
				tiles[y * width + x] = GID_BY_TYPE.grass
				continue
			}
			const rockNeighbors = countNeighborType(tiles, width, height, x, y, 'rock')
			if (rockNeighbors >= 3 && hash2D(x, y, rockSeed) < 0.55) {
				tiles[y * width + x] = GID_BY_TYPE.grass
			}
		}
	}

	const dirtMax = Math.floor(width * height * DIRT_MAX_FRACTION)
	const mudMax = Math.floor(width * height * MUD_MAX_FRACTION)
	limitPatchSize(tiles, width, height, 'dirt', dirtMax, seedBase + 701)
	limitPatchSize(tiles, width, height, 'mud', mudMax, seedBase + 709)

	const dirtMin = Math.floor(width * height * DIRT_MIN_FRACTION)
	const mudMin = Math.floor(width * height * MUD_MIN_FRACTION)
	ensureMinimumCoverage(tiles, width, height, 'dirt', dirtMin, seedBase + 721, dirtForbiddenNeighbors)
	ensureMinimumCoverage(tiles, width, height, 'mud', mudMin, seedBase + 729, dirtForbiddenNeighbors)

	for (let y = 0; y < height; y += 1) {
		for (let x = 0; x < width; x += 1) {
			const type = getTypeAt(tiles, width, height, x, y)
			if (type === 'dirt' || type === 'mud') {
				if (isNeighborType(tiles, width, height, x, y, dirtForbiddenNeighbors)) {
					tiles[y * width + x] = GID_BY_TYPE.grass
				}
			}
		}
	}

	let stats = computeStats(tiles)
	const missing = GROUND_TYPE_ORDER.filter((type) => stats[type] === 0)
	if (missing.length > 0) {
		const patchRadius = Math.max(4, Math.floor(Math.min(width, height) * 0.015))
		const edgeSpots = [
			{ x: Math.floor(width * 0.78), y: Math.floor(height * 0.16) },
			{ x: Math.floor(width * 0.68), y: Math.floor(height * 0.3) },
			{ x: Math.floor(width * 0.86), y: Math.floor(height * 0.46) },
			{ x: Math.floor(width * 0.72), y: Math.floor(height * 0.66) },
			{ x: Math.floor(width * 0.84), y: Math.floor(height * 0.82) }
		]
		let spotIndex = 0

		const nextSpot = () => {
			const spot = edgeSpots[spotIndex % edgeSpots.length]
			spotIndex += 1
			return spot
		}

		for (const type of missing) {
			if (type === 'water_shallow' || type === 'water_deep') {
				const waterSpot = { x: Math.floor(width * 0.12), y: Math.floor(height * 0.88) }
				paintCircle(tiles, width, height, waterSpot.x, waterSpot.y, patchRadius + 2, 'water_shallow')
				paintCircle(tiles, width, height, waterSpot.x, waterSpot.y, patchRadius - 1, 'water_deep')
				continue
			}
			if (type === 'mountain') {
				const peakX = maxHeightIndex % width
				const peakY = Math.floor(maxHeightIndex / width)
				paintCircle(tiles, width, height, peakX, peakY, patchRadius + 2, type)
				continue
			}
			if (type === 'rock') {
				const rockSpot = findRockSpot(tiles, width, height, seedBase + 701, 260)
				if (rockSpot) {
					paintCircle(tiles, width, height, rockSpot.x, rockSpot.y, patchRadius, 'rock')
				}
				continue
			}
			if (type === 'sand') {
				const waterSpot = { x: Math.floor(width * 0.18), y: Math.floor(height * 0.82) }
				paintCircle(tiles, width, height, waterSpot.x, waterSpot.y, patchRadius, 'sand')
				continue
			}
			if (type === 'dirt' || type === 'mud') {
				const target = Math.max(120, Math.floor(Math.PI * patchRadius * patchRadius * 0.7))
				const filled = growNoisyPatch(
					tiles,
					width,
					height,
					type,
					seedBase + 800 + spotIndex * 13,
					target,
					dirtForbiddenNeighbors
				)
				if (filled > 0) continue
			}
			const grassSpot = findGrassSpot(tiles, width, height, seedBase + spotIndex * 17, 200)
			const spot = grassSpot ?? nextSpot()
			paintCircle(tiles, width, height, spot.x, spot.y, patchRadius, type)
		}
		stats = computeStats(tiles)
	}

	const spawn =
		findStartPoint(tiles, width, height, seedBase + 991) ?? {
			x: Math.max(2, Math.floor(width * 0.12)),
			y: Math.min(height - 3, Math.floor(height * 0.86))
		}

	if (spawn) {
		ensureRockPatchNearSpawn(tiles, width, height, spawn, seedBase + 1151)
		stats = computeStats(tiles)
	}

	const heightMap = buildMountainHeightMap(
		tiles,
		width,
		height,
		heightValues,
		ridgeValues,
		mountainBias
	)

	const forestNodes = generateForestNodes(tiles, width, height, seedBase + 1201, stats, spawn)
	const resourceNodes = [
		...forestNodes,
		...generateFishNodes(tiles, width, height, seedBase + 1301, lakeMask),
		...generateStoneNodes(tiles, width, height, seedBase + 1401, spawn)
	]
	const deerSpawns = generateDeerSpawns(forestNodes, width, height)

	return {
		tiles,
		heightMap,
		stats,
		width,
		height,
		tileWidth,
		tileHeight,
		seed: config.seed,
		config,
		spawn,
		resourceNodes,
		deerSpawns
	}
}

export const buildMapJson = (result: MapGenResult) => {
	const { width, height, tileWidth, tileHeight, tiles, heightMap, config, spawn, resourceNodes } = result
	const data = encodeRle(tiles)
	const heightData = encodeRle(heightMap)
	const resourceObjects = resourceNodes.map((node, index) => ({
		height: tileHeight,
		id: index + 2,
		name: `resource:${node.nodeType}`,
		rotation: 0,
		type: 'resource_node',
		visible: true,
		width: tileWidth,
		x: node.position.x * tileWidth,
		y: node.position.y * tileHeight,
		properties: [
			{ name: 'nodeType', type: 'string', value: node.nodeType },
			{ name: 'tileBased', type: 'bool', value: node.tileBased },
			...(node.quantity != null ? [{ name: 'quantity', type: 'int', value: node.quantity }] : [])
		]
	}))
	return {
		compressionlevel: -1,
		height,
		infinite: false,
		layers: [
			{
				data,
				height,
				id: 1,
				name: 'ground',
				opacity: 1,
				encoding: 'rle',
				type: 'tilelayer',
				visible: true,
				width,
				x: 0,
				y: 0
			},
			{
				data: heightData,
				height,
				id: 2,
				name: 'heightmap',
				opacity: 1,
				encoding: 'rle',
				properties: [{ name: 'heightmap', type: 'bool', value: true }],
				type: 'tilelayer',
				visible: false,
				width,
				x: 0,
				y: 0
			},
			{
				draworder: 'topdown',
				id: 3,
				name: 'spawn_points',
				objects: [
					{
						height: tileHeight,
						id: 1,
						name: 'spawn:default',
						rotation: 0,
						type: '',
						visible: true,
						width: tileWidth,
						x: spawn.x * tileWidth,
						y: spawn.y * tileHeight
					}
				],
				opacity: 1,
				type: 'objectgroup',
				visible: true,
				x: 0,
				y: 0
			},
			{
				draworder: 'topdown',
				id: 4,
				name: 'resource_nodes',
				objects: resourceObjects,
				opacity: 1,
				type: 'objectgroup',
				visible: true,
				x: 0,
				y: 0
			}
		],
		nextlayerid: 5,
		nextobjectid: resourceObjects.length + 2,
		orientation: 'orthogonal',
		properties: [
			{ name: 'generator', type: 'string', value: 'settlerpolis-mapgen' },
			{ name: 'seed', type: 'string', value: config.seed },
			{ name: 'seaLevel', type: 'float', value: config.seaLevel },
			{ name: 'roughness', type: 'float', value: config.roughness },
			{ name: 'moisture', type: 'float', value: config.moisture },
			{ name: 'temperature', type: 'float', value: config.temperature },
			{ name: 'grassBias', type: 'float', value: config.grassBias },
			{ name: 'mountainBias', type: 'float', value: config.mountainBias }
		],
		renderorder: 'right-down',
		tiledversion: '1.10.2',
		tileheight: tileHeight,
		tilesets: [TILESET],
		tilewidth: tileWidth,
		type: 'map',
		version: '1.10',
		width
	}
}
