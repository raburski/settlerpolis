type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

type WorkerMessage =
	| { type: 'init'; tileHalf: number; baseOffset: number }
	| { type: 'add'; key: string; id: string; x: number; y: number; rotation: number; elevation: number }
	| { type: 'remove'; key: string; id: string }
	| { type: 'update'; requestId: number; bounds: Bounds }
	| {
			type: 'config'
			key: string
			baseRotation?: { x?: number; y?: number; z?: number }
			scale?: { x?: number; y?: number; z?: number }
			baseYOffset?: number
	  }

type Node = { id: string; x: number; y: number; rotation: number; elevation: number }

type Batch = {
	nodes: Node[]
	idToIndex: Map<string, number>
}

type BatchConfig = {
	b00: number
	b01: number
	b02: number
	b10: number
	b11: number
	b12: number
	b20: number
	b21: number
	b22: number
	sx: number
	sy: number
	sz: number
	baseYOffset: number
}

let tileHalf = 16
let baseOffset = 100000
const batches = new Map<string, Batch>()
const configs = new Map<string, BatchConfig>()

const getBatch = (key: string): Batch => {
	let batch = batches.get(key)
	if (!batch) {
		batch = { nodes: [], idToIndex: new Map() }
		batches.set(key, batch)
	}
	return batch
}

const getConfig = (key: string): BatchConfig => {
	let config = configs.get(key)
	if (!config) {
		config = {
			b00: 1,
			b01: 0,
			b02: 0,
			b10: 0,
			b11: 1,
			b12: 0,
			b20: 0,
			b21: 0,
			b22: 1,
			sx: 1,
			sy: 1,
			sz: 1,
			baseYOffset: tileHalf
		}
		configs.set(key, config)
	}
	return config
}

const setConfig = (
	key: string,
	options: { baseRotation?: { x?: number; y?: number; z?: number }; scale?: { x?: number; y?: number; z?: number }; baseYOffset?: number }
): void => {
	const rot = options.baseRotation || {}
	const rx = rot.x ?? 0
	const ry = rot.y ?? 0
	const rz = rot.z ?? 0

	const cx = Math.cos(rx)
	const sx = Math.sin(rx)
	const cy = Math.cos(ry)
	const sy = Math.sin(ry)
	const cz = Math.cos(rz)
	const sz = Math.sin(rz)

	// Rz * Ry * Rx
	const b00 = cz * cy
	const b01 = cz * sy * sx - sz * cx
	const b02 = cz * sy * cx + sz * sx
	const b10 = sz * cy
	const b11 = sz * sy * sx + cz * cx
	const b12 = sz * sy * cx - cz * sx
	const b20 = -sy
	const b21 = cy * sx
	const b22 = cy * cx

	const scale = options.scale || {}
	const config: BatchConfig = {
		b00,
		b01,
		b02,
		b10,
		b11,
		b12,
		b20,
		b21,
		b22,
		sx: scale.x ?? 1,
		sy: scale.y ?? 1,
		sz: scale.z ?? 1,
		baseYOffset: options.baseYOffset ?? tileHalf
	}
	configs.set(key, config)
}

const addNode = (key: string, node: Node): void => {
	const batch = getBatch(key)
	if (batch.idToIndex.has(node.id)) return
	const index = batch.nodes.length
	batch.nodes.push(node)
	batch.idToIndex.set(node.id, index)
}

const removeNode = (key: string, id: string): void => {
	const batch = batches.get(key)
	if (!batch) return
	const index = batch.idToIndex.get(id)
	if (index === undefined) return
	const lastIndex = batch.nodes.length - 1
	const lastNode = batch.nodes[lastIndex]
	batch.nodes[index] = lastNode
	batch.nodes.pop()
	batch.idToIndex.delete(id)
	if (index !== lastIndex) {
		batch.idToIndex.set(lastNode.id, index)
	}
}

const buildMatrices = (key: string, batch: Batch, bounds: Bounds): { matrices: Float32Array; count: number } => {
	const config = getConfig(key)
	let visibleCount = 0
	for (const node of batch.nodes) {
		const cx = node.x + tileHalf
		const cy = node.y + tileHalf
		if (cx < bounds.minX || cx > bounds.maxX || cy < bounds.minY || cy > bounds.maxY) continue
		visibleCount += 1
	}

	if (visibleCount === 0) {
		return { matrices: new Float32Array(0), count: 0 }
	}

	const matrices = new Float32Array(visibleCount * 16)
	let offset = 0
	for (const node of batch.nodes) {
		const cx = node.x + tileHalf
		const cy = node.y + tileHalf
		if (cx < bounds.minX || cx > bounds.maxX || cy < bounds.minY || cy > bounds.maxY) continue
		const rotation = typeof node.rotation === 'number' ? node.rotation : 0
		const cos = Math.cos(rotation)
		const sin = Math.sin(rotation)
		const r00 = config.b00 * cos + config.b02 * sin
		const r01 = config.b01
		const r02 = -config.b00 * sin + config.b02 * cos
		const r10 = config.b10 * cos + config.b12 * sin
		const r11 = config.b11
		const r12 = -config.b10 * sin + config.b12 * cos
		const r20 = config.b20 * cos + config.b22 * sin
		const r21 = config.b21
		const r22 = -config.b20 * sin + config.b22 * cos
		matrices[offset++] = r00 * config.sx
		matrices[offset++] = r01 * config.sy
		matrices[offset++] = r02 * config.sz
		matrices[offset++] = 0
		matrices[offset++] = r10 * config.sx
		matrices[offset++] = r11 * config.sy
		matrices[offset++] = r12 * config.sz
		matrices[offset++] = 0
		matrices[offset++] = r20 * config.sx
		matrices[offset++] = r21 * config.sy
		matrices[offset++] = r22 * config.sz
		matrices[offset++] = 0
		matrices[offset++] = cx + baseOffset
		matrices[offset++] = config.baseYOffset + node.elevation + baseOffset
		matrices[offset++] = cy + baseOffset
		matrices[offset++] = 1
	}
	return { matrices, count: visibleCount }
}

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
	const data = event.data
	if (!data) return
	switch (data.type) {
		case 'init':
			tileHalf = data.tileHalf
			baseOffset = data.baseOffset
			self.postMessage({ type: 'ready' })
			return
		case 'config':
			setConfig(data.key, {
				baseRotation: data.baseRotation,
				scale: data.scale,
				baseYOffset: data.baseYOffset
			})
			return
		case 'add':
			addNode(data.key, {
				id: data.id,
				x: data.x,
				y: data.y,
				rotation: data.rotation,
				elevation: data.elevation
			})
			return
		case 'remove':
			removeNode(data.key, data.id)
			return
		case 'update': {
			const results: Record<string, { matrices: Float32Array; count: number }> = {}
			const transfer: ArrayBuffer[] = []
			for (const [key, batch] of batches.entries()) {
				const built = buildMatrices(key, batch, data.bounds)
				results[key] = built
				transfer.push(built.matrices.buffer)
			}
			self.postMessage(
				{
					type: 'result',
					requestId: data.requestId,
					batches: results
				},
				transfer
			)
			return
		}
		default:
			return
	}
}
