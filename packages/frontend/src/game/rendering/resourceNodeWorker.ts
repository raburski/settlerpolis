type Bounds = { minX: number; minY: number; maxX: number; maxY: number }

type WorkerMessage =
	| { type: 'init'; tileHalf: number; baseOffset: number }
	| { type: 'add'; key: string; id: string; x: number; y: number; rotation: number; elevation: number }
	| { type: 'remove'; key: string; id: string }
	| { type: 'update'; requestId: number; bounds: Bounds }

type Node = { id: string; x: number; y: number; rotation: number; elevation: number }

type Batch = {
	nodes: Node[]
	idToIndex: Map<string, number>
}

let tileHalf = 16
let baseOffset = 100000
const batches = new Map<string, Batch>()

const getBatch = (key: string): Batch => {
	let batch = batches.get(key)
	if (!batch) {
		batch = { nodes: [], idToIndex: new Map() }
		batches.set(key, batch)
	}
	return batch
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

const buildMatrices = (batch: Batch, bounds: Bounds): { matrices: Float32Array; count: number } => {
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
		matrices[offset++] = cos
		matrices[offset++] = 0
		matrices[offset++] = -sin
		matrices[offset++] = 0
		matrices[offset++] = 0
		matrices[offset++] = 1
		matrices[offset++] = 0
		matrices[offset++] = 0
		matrices[offset++] = sin
		matrices[offset++] = 0
		matrices[offset++] = cos
		matrices[offset++] = 0
		matrices[offset++] = cx + baseOffset
		matrices[offset++] = tileHalf + node.elevation + baseOffset
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
				const built = buildMatrices(batch, data.bounds)
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
