export const WIND_REACTIVE_NODE_TYPES = new Set(['tree', 'wheat_crop'])

const WIND_SWAY_MIN_TILT_RAD = 0.007
const WIND_SWAY_MAX_TILT_RAD = 0.018
const WIND_SWAY_SPEED_MIN_HZ = 0.055
const WIND_SWAY_SPEED_MAX_HZ = 0.11
const WIND_GUST_STRENGTH = 1
const WIND_STROKE_INTERVAL_MIN_SEC = 10
const WIND_STROKE_INTERVAL_MAX_SEC = 20
const WIND_STROKE_DURATION_MIN_SEC = 4.8
const WIND_STROKE_DURATION_MAX_SEC = 7.2
const WIND_STROKE_WIDTH_FACTOR_MIN = 0.24
const WIND_STROKE_WIDTH_FACTOR_MAX = 0.36
const WIND_STROKE_LENGTH_FACTOR_MIN = 0.45
const WIND_STROKE_LENGTH_FACTOR_MAX = 0.62
const WIND_STROKE_OVERSCAN_TILES = 10
const WIND_GUST_FORCE_GAIN = 5
const WIND_GUST_SPRING = 0.7
const WIND_GUST_DAMPING = 1.6
const WIND_GUST_MAX_BOOST = 3.8

type PerInstanceWindState = {
	phaseA: number
	phaseB: number
	speedA: number
	speedB: number
	tiltAmplitude: number
	gustBoost: number
	gustVelocity: number
}

type WindStroke = {
	dirX: number
	dirY: number
	perpX: number
	perpY: number
	crossCenter: number
	startHead: number
	headSpeed: number
	widthTiles: number
	lengthTiles: number
	strength: number
	durationSec: number
	ageSec: number
}

type TileBounds = {
	minX: number
	maxX: number
	minY: number
	maxY: number
	centerX: number
	centerY: number
}

type Anchor = { x: number; y: number; z: number }
type WorldBounds = { minX: number; minY: number; maxX: number; maxY: number }

export class WindSwayController {
	private readonly tileSize: number
	private readonly tileHalf: number
	private readonly baseOffset: number
	private windTimeSec = 0
	private deltaSec = 0
	private windStateByObject = new Map<string, PerInstanceWindState>()
	private windStrokeCooldownSec = 1.5
	private activeWindStrokes: WindStroke[] = []
	private windAnchorByBatch = new Map<string, Anchor>()
	private animatedMatricesByBatch = new Map<string, Float32Array>()

	constructor(tileSize: number, tileHalf: number, baseOffset: number) {
		this.tileSize = tileSize
		this.tileHalf = tileHalf
		this.baseOffset = baseOffset
	}

	public reset(): void {
		this.windTimeSec = 0
		this.deltaSec = 0
		this.windStateByObject.clear()
		this.windStrokeCooldownSec = 1.5
		this.activeWindStrokes = []
		this.windAnchorByBatch.clear()
		this.animatedMatricesByBatch.clear()
	}

	public removeObject(objectId: string): void {
		this.windStateByObject.delete(objectId)
	}

	public setBatchAnchor(batchKey: string, anchor: Anchor): void {
		this.windAnchorByBatch.set(batchKey, anchor)
	}

	public removeBatch(batchKey: string): void {
		this.windAnchorByBatch.delete(batchKey)
		this.clearBatchAnimation(batchKey)
	}

	public clearBatchAnimation(batchKey: string): void {
		this.animatedMatricesByBatch.delete(batchKey)
	}

	public step(deltaSec: number, visibleWorldBounds: WorldBounds | null): void {
		if (!Number.isFinite(deltaSec) || deltaSec <= 0) return
		this.deltaSec = deltaSec
		this.windTimeSec += deltaSec
		const bounds = this.computeBoundsFromWorldBounds(visibleWorldBounds)
		this.updateWindStrokes(deltaSec, bounds)
	}

	public applySwayToBatch(batchKey: string, baseMatrices: Float32Array, visibleIds: string[]): Float32Array {
		if (baseMatrices.length === 0 || visibleIds.length === 0) {
			return baseMatrices
		}
		const instanceCount = baseMatrices.length / 16
		if (instanceCount <= 0) {
			return baseMatrices
		}
		const anchor = this.windAnchorByBatch.get(batchKey) ?? { x: 0, y: 0, z: 0 }
		const animated = this.ensureAnimatedMatrixBuffer(batchKey, baseMatrices.length)
		animated.set(baseMatrices)
		const animateCount = Math.min(instanceCount, visibleIds.length)
		for (let index = 0; index < animateCount; index += 1) {
			const objectId = visibleIds[index]
			if (!objectId) continue
			const wind = this.ensurePerInstanceWindState(objectId)
			const matrixOffset = index * 16
			const tileX = (baseMatrices[matrixOffset + 12] - this.baseOffset) / this.tileSize
			const tileY = (baseMatrices[matrixOffset + 14] - this.baseOffset) / this.tileSize
			const gustField = this.sampleWindStrokes(tileX, tileY)
			this.updateTreeGustResponse(wind, gustField * WIND_GUST_FORCE_GAIN, this.deltaSec)
			const gustMultiplier = 1 + wind.gustBoost * WIND_GUST_STRENGTH
			const tiltX = Math.sin(this.windTimeSec * wind.speedA + wind.phaseA) * wind.tiltAmplitude * gustMultiplier
			const tiltZ = Math.sin(this.windTimeSec * wind.speedB + wind.phaseB) * wind.tiltAmplitude * 0.65 * gustMultiplier
			applyTiltToInstanceMatrix(animated, index * 16, tiltX, tiltZ, anchor)
		}
		return animated
	}

	private ensurePerInstanceWindState(objectId: string): PerInstanceWindState {
		const existing = this.windStateByObject.get(objectId)
		if (existing) return existing
		const phaseA = getSeededFractionWithSalt(objectId, 'wind-phase-a') * Math.PI * 2
		const phaseB = getSeededFractionWithSalt(objectId, 'wind-phase-b') * Math.PI * 2
		const speedA =
			lerp(WIND_SWAY_SPEED_MIN_HZ, WIND_SWAY_SPEED_MAX_HZ, getSeededFractionWithSalt(objectId, 'wind-speed-a')) *
			Math.PI *
			2
		const speedB =
			lerp(WIND_SWAY_SPEED_MIN_HZ, WIND_SWAY_SPEED_MAX_HZ, getSeededFractionWithSalt(objectId, 'wind-speed-b')) *
			Math.PI *
			2
		const tiltAmplitude = lerp(
			WIND_SWAY_MIN_TILT_RAD,
			WIND_SWAY_MAX_TILT_RAD,
			getSeededFractionWithSalt(objectId, 'wind-tilt-amplitude')
		)
		const created: PerInstanceWindState = {
			phaseA,
			phaseB,
			speedA,
			speedB,
			tiltAmplitude,
			gustBoost: 0,
			gustVelocity: 0
		}
		this.windStateByObject.set(objectId, created)
		return created
	}

	private updateTreeGustResponse(wind: PerInstanceWindState, force: number, deltaSec: number): void {
		const acceleration = force - WIND_GUST_SPRING * wind.gustBoost - WIND_GUST_DAMPING * wind.gustVelocity
		wind.gustVelocity += acceleration * deltaSec
		wind.gustBoost += wind.gustVelocity * deltaSec
		if (wind.gustBoost < 0) {
			wind.gustBoost = 0
			if (wind.gustVelocity < 0) wind.gustVelocity = 0
		}
		if (wind.gustBoost > WIND_GUST_MAX_BOOST) {
			wind.gustBoost = WIND_GUST_MAX_BOOST
			if (wind.gustVelocity > 0) wind.gustVelocity *= 0.4
		}
	}

	private ensureAnimatedMatrixBuffer(batchKey: string, length: number): Float32Array {
		const existing = this.animatedMatricesByBatch.get(batchKey)
		if (existing && existing.length === length) return existing
		const created = new Float32Array(length)
		this.animatedMatricesByBatch.set(batchKey, created)
		return created
	}

	private computeBoundsFromWorldBounds(bounds: WorldBounds | null): TileBounds | null {
		if (!bounds) return null
		const minX = (bounds.minX + this.tileHalf) / this.tileSize
		const maxX = (bounds.maxX + this.tileHalf) / this.tileSize
		const minY = (bounds.minY + this.tileHalf) / this.tileSize
		const maxY = (bounds.maxY + this.tileHalf) / this.tileSize
		if (!Number.isFinite(minX) || !Number.isFinite(maxX) || !Number.isFinite(minY) || !Number.isFinite(maxY)) {
			return null
		}
		return {
			minX,
			maxX,
			minY,
			maxY,
			centerX: (minX + maxX) * 0.5,
			centerY: (minY + maxY) * 0.5
		}
	}

	private updateWindStrokes(deltaSec: number, bounds: TileBounds | null): void {
		if (this.activeWindStrokes.length > 0) {
			for (const stroke of this.activeWindStrokes) {
				stroke.ageSec += deltaSec
			}
			this.activeWindStrokes = this.activeWindStrokes.filter((stroke) => stroke.ageSec < stroke.durationSec)
		}
		if (!bounds) return
		this.windStrokeCooldownSec -= deltaSec
		if (this.windStrokeCooldownSec > 0) return
		this.activeWindStrokes.push(this.createWindStroke(bounds))
		this.windStrokeCooldownSec = lerp(WIND_STROKE_INTERVAL_MIN_SEC, WIND_STROKE_INTERVAL_MAX_SEC, Math.random())
	}

	private createWindStroke(bounds: TileBounds): WindStroke {
		const angle = Math.random() * Math.PI * 2
		const dirX = Math.cos(angle)
		const dirY = Math.sin(angle)
		const perpX = -dirY
		const perpY = dirX
		const spanX = Math.max(1, bounds.maxX - bounds.minX)
		const spanY = Math.max(1, bounds.maxY - bounds.minY)
		const diagonal = Math.hypot(spanX, spanY)
		const radius = diagonal * 0.68 + WIND_STROKE_OVERSCAN_TILES
		const alongCenter = bounds.centerX * dirX + bounds.centerY * dirY
		const crossCenterBase = bounds.centerX * perpX + bounds.centerY * perpY
		const crossJitter = (Math.random() - 0.5) * diagonal * 0.1
		const crossCenter = crossCenterBase + crossJitter
		const startHead = alongCenter - radius
		const endHead = alongCenter + radius
		const durationSec = lerp(WIND_STROKE_DURATION_MIN_SEC, WIND_STROKE_DURATION_MAX_SEC, Math.random())
		const distance = Math.max(1, endHead - startHead)
		const headSpeed = distance / Math.max(0.2, durationSec)
		const widthTiles = clamp(
			diagonal * lerp(WIND_STROKE_WIDTH_FACTOR_MIN, WIND_STROKE_WIDTH_FACTOR_MAX, Math.random()),
			10,
			38
		)
		const lengthTiles = clamp(
			diagonal * lerp(WIND_STROKE_LENGTH_FACTOR_MIN, WIND_STROKE_LENGTH_FACTOR_MAX, Math.random()),
			16,
			42
		)
		return {
			dirX,
			dirY,
			perpX,
			perpY,
			crossCenter,
			startHead,
			headSpeed,
			widthTiles,
			lengthTiles,
			strength: lerp(1.4, 2.1, Math.random()),
			durationSec,
			ageSec: 0
		}
	}

	private sampleWindStrokes(tileX: number, tileY: number): number {
		if (this.activeWindStrokes.length === 0) return 0
		let strongest = 0
		for (const stroke of this.activeWindStrokes) {
			const head = stroke.startHead + stroke.headSpeed * stroke.ageSec
			const along = tileX * stroke.dirX + tileY * stroke.dirY
			const cross = tileX * stroke.perpX + tileY * stroke.perpY
			const alongDelta = (along - head) / Math.max(1, stroke.lengthTiles)
			const crossDelta = (cross - stroke.crossCenter) / Math.max(1, stroke.widthTiles)
			const front = Math.exp(-(alongDelta * alongDelta))
			const lateral = Math.exp(-(crossDelta * crossDelta))
			const intensity = stroke.strength * front * lateral
			if (intensity > strongest) strongest = intensity
		}
		return clamp(strongest, 0, 2.2)
	}
}

function clamp(value: number, min: number, max: number): number {
	if (value < min) return min
	if (value > max) return max
	return value
}

function lerp(from: number, to: number, t: number): number {
	return from + (to - from) * t
}

function applyTiltToInstanceMatrix(
	buffer: Float32Array,
	index: number,
	tiltX: number,
	tiltZ: number,
	anchor: Anchor
): void {
	const tx = buffer[index + 12]
	const ty = buffer[index + 13]
	const tz = buffer[index + 14]
	const tw = buffer[index + 15]

	const a00 = buffer[index]
	const a01 = buffer[index + 1]
	const a02 = buffer[index + 2]
	const a10 = buffer[index + 4]
	const a11 = buffer[index + 5]
	const a12 = buffer[index + 6]
	const a20 = buffer[index + 8]
	const a21 = buffer[index + 9]
	const a22 = buffer[index + 10]

	const cx = Math.cos(tiltX)
	const sx = Math.sin(tiltX)
	const cz = Math.cos(tiltZ)
	const sz = Math.sin(tiltZ)

	const t00 = cz
	const t01 = -sz * cx
	const t02 = sz * sx
	const t10 = sz
	const t11 = cz * cx
	const t12 = -cz * sx
	const t20 = 0
	const t21 = sx
	const t22 = cx

	const r00 = a00 * t00 + a10 * t10 + a20 * t20
	const r01 = a01 * t00 + a11 * t10 + a21 * t20
	const r02 = a02 * t00 + a12 * t10 + a22 * t20
	const r10 = a00 * t01 + a10 * t11 + a20 * t21
	const r11 = a01 * t01 + a11 * t11 + a21 * t21
	const r12 = a02 * t01 + a12 * t11 + a22 * t21
	const r20 = a00 * t02 + a10 * t12 + a20 * t22
	const r21 = a01 * t02 + a11 * t12 + a21 * t22
	const r22 = a02 * t02 + a12 * t12 + a22 * t22

	const px = anchor.x
	const py = anchor.y
	const pz = anchor.z
	const tpx = t00 * px + t01 * py + t02 * pz
	const tpy = t10 * px + t11 * py + t12 * pz
	const tpz = t20 * px + t21 * py + t22 * pz
	const qx = px - tpx
	const qy = py - tpy
	const qz = pz - tpz
	const dx = a00 * qx + a10 * qy + a20 * qz
	const dy = a01 * qx + a11 * qy + a21 * qz
	const dz = a02 * qx + a12 * qy + a22 * qz

	buffer[index] = r00
	buffer[index + 1] = r01
	buffer[index + 2] = r02
	buffer[index + 4] = r10
	buffer[index + 5] = r11
	buffer[index + 6] = r12
	buffer[index + 8] = r20
	buffer[index + 9] = r21
	buffer[index + 10] = r22
	buffer[index + 12] = tx + dx
	buffer[index + 13] = ty + dy
	buffer[index + 14] = tz + dz
	buffer[index + 15] = tw
}

function getSeededFractionWithSalt(seedKey: string | number, salt: string): number {
	const hash = fnv1a(`${seedKey}:${salt}`)
	return hash / 0x100000000
}

function fnv1a(input: string): number {
	let hash = 0x811c9dc5
	for (let i = 0; i < input.length; i += 1) {
		hash ^= input.charCodeAt(i)
		hash = Math.imul(hash, 0x01000193)
	}
	return hash >>> 0
}
