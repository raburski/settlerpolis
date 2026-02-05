import { Mesh, MeshBuilder } from '@babylonjs/core'
import type { BabylonRenderer } from './BabylonRenderer'
import type { MapObject } from '@rugged/game'
import { itemService } from '../services/ItemService'

const BASE_OFFSET = 100000

interface Batch {
	base: Mesh
	hasBuffer: boolean
}

interface WorkerBatchResult {
	matrices: Float32Array
	count: number
}

interface WorkerMessage {
	type: 'result'
	requestId: number
	batches: Record<string, WorkerBatchResult>
}

export class ResourceNodeBatcher {
	private renderer: BabylonRenderer
	private tileSize: number
	private batches: Map<string, Batch> = new Map()
	private idToBatchKey: Map<string, string> = new Map()
	private worker: Worker | null = null
	private workerRequestId = 0
	private awaitingResult = false
	private queuedBounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null

	constructor(renderer: BabylonRenderer, tileSize: number) {
		this.renderer = renderer
		this.tileSize = tileSize
		if (typeof Worker !== 'undefined') {
			this.worker = new Worker(new URL('./resourceNodeWorker.ts', import.meta.url), {
				type: 'module'
			})
			this.worker.onmessage = this.handleWorkerMessage
			this.worker.postMessage({
				type: 'init',
				tileHalf: tileSize / 2,
				baseOffset: BASE_OFFSET
			})
		}
	}

	add(object: MapObject): boolean {
		if (!object?.metadata?.resourceNode) return false
		const itemMeta = itemService.getItemType(object.item.itemType)
		const emoji = itemMeta?.emoji
		if (!emoji) return false

		const elevation = this.renderer.getGroundHeightAt(
			object.position.x + this.tileSize / 2,
			object.position.y + this.tileSize / 2
		)

		const key = `${object.item.itemType}:${emoji}`
		let batch = this.batches.get(key)
		if (!batch) {
			const base = MeshBuilder.CreateBox(
				`resource-node-${key}`,
				{ width: this.tileSize, height: this.tileSize, depth: this.tileSize },
				this.renderer.scene
			)
			base.isVisible = true
			base.isPickable = false
			base.alwaysSelectAsActiveMesh = true
			base.position.set(-BASE_OFFSET, -BASE_OFFSET, -BASE_OFFSET)
			this.renderer.applyEmoji(base, emoji)
			batch = {
				base,
				hasBuffer: false
			}
			this.batches.set(key, batch)
		}
		this.idToBatchKey.set(object.id, key)
		this.worker?.postMessage({
			type: 'add',
			key,
			id: object.id,
			x: object.position.x,
			y: object.position.y,
			rotation: typeof object.rotation === 'number' ? object.rotation : 0,
			elevation
		})
		return true
	}

	remove(objectId: string): boolean {
		const key = this.idToBatchKey.get(objectId)
		if (!key) return false
		const batch = this.batches.get(key)
		if (!batch) return false
		this.idToBatchKey.delete(objectId)
		this.worker?.postMessage({ type: 'remove', key, id: objectId })
		return true
	}

	updateVisible(bounds: { minX: number; minY: number; maxX: number; maxY: number }): void {
		this.requestUpdate(bounds)
	}

	updateAll(): void {
		const huge = 1e9
		this.requestUpdate({ minX: -huge, minY: -huge, maxX: huge, maxY: huge })
	}

	dispose(): void {
		for (const batch of this.batches.values()) {
			if (batch.hasBuffer) {
				batch.base.thinInstanceSetBuffer('matrix', new Float32Array(0), 16)
			}
			batch.base.dispose()
		}
		this.batches.clear()
		this.idToBatchKey.clear()
		this.worker?.terminate()
		this.worker = null
	}

	private requestUpdate(bounds: { minX: number; minY: number; maxX: number; maxY: number }): void {
		if (!this.worker) return
		if (this.awaitingResult) {
			this.queuedBounds = bounds
			return
		}
		this.awaitingResult = true
		const requestId = (this.workerRequestId += 1)
		this.worker.postMessage({ type: 'update', requestId, bounds })
	}

	private handleWorkerMessage = (event: MessageEvent<WorkerMessage>) => {
		const data = event.data
		if (!data || data.type !== 'result') return
		if (data.requestId < this.workerRequestId) {
			this.awaitingResult = false
			if (this.queuedBounds) {
				const next = this.queuedBounds
				this.queuedBounds = null
				this.updateVisible(next)
			}
			return
		}

		for (const [key, batch] of this.batches.entries()) {
			const result = data.batches[key]
			if (!result || result.count === 0) {
				if (batch.hasBuffer) {
					batch.base.thinInstanceCount = 0
				}
				continue
			}
			batch.base.thinInstanceSetBuffer('matrix', result.matrices, 16, true)
			batch.base.thinInstanceCount = result.count
			batch.hasBuffer = true
		}

		this.awaitingResult = false
		if (this.queuedBounds) {
			const next = this.queuedBounds
			this.queuedBounds = null
			this.updateVisible(next)
		}
	}
}
