import { AbstractMesh, AssetContainer, Mesh, MeshBuilder, SceneLoader, TransformNode, Vector3 } from '@babylonjs/core'
import '@babylonjs/loaders'
import type { BabylonRenderer } from './BabylonRenderer'
import type { MapObject } from '@rugged/game'
import { itemService } from '../services/ItemService'
import { resourceNodeRenderService } from '../services/ResourceNodeRenderService'

const BASE_OFFSET = 100000

interface Batch {
	type: 'emoji' | 'model'
	baseMeshes: Mesh[]
	hasBuffer: boolean
	ready: boolean
	root?: TransformNode
}

interface WorkerBatchResult {
	matrices: Float32Array
	count: number
}

type ModelRenderConfig = {
	modelSrc: string
	transform?: {
		rotation?: { x: number; y: number; z: number }
		scale?: { x: number; y: number; z: number }
		elevation?: number
	}
}

type WorkerMessage =
	| { type: 'ready' }
	| { type: 'result'; requestId: number; batches: Record<string, WorkerBatchResult> }

const DEBUG_LOAD_TIMING = String(import.meta.env.VITE_DEBUG_LOAD_TIMING || '').toLowerCase() === 'true'

export class ResourceNodeBatcher {
	private renderer: BabylonRenderer
	private tileSize: number
	private batches: Map<string, Batch> = new Map()
	private idToBatchKey: Map<string, string> = new Map()
	private objectsById: Map<string, MapObject> = new Map()
	private batchToIds: Map<string, Set<string>> = new Map()
	private pendingEmojiItems: Map<string, Set<string>> = new Map()
	private pendingEmojiUnsubscribes: Map<string, () => void> = new Map()
	private pendingResults: Map<string, WorkerBatchResult> = new Map()
	private modelLoadPromises: Map<string, Promise<Batch | null>> = new Map()
	private worker: Worker | null = null
	private workerRequestId = 0
	private awaitingResult = false
	private queuedBounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null
	private workerReady = false
	private workerInitAt = 0
	private tileHalf: number
	private renderUnsubscribe: (() => void) | null = null

	private static modelContainerCache = new Map<string, Promise<AssetContainer>>()
	private static failedModelSrcs = new Set<string>()
	private static unsupportedModelSrcs = new Set<string>()

	constructor(renderer: BabylonRenderer, tileSize: number) {
		this.renderer = renderer
		this.tileSize = tileSize
		this.tileHalf = tileSize / 2
		if (typeof Worker !== 'undefined') {
			this.worker = new Worker(new URL('./resourceNodeWorker.ts', import.meta.url), {
				type: 'module'
			})
			this.worker.onmessage = this.handleWorkerMessage
			this.worker.onerror = (event) => {
				console.warn('[ResourceNodeBatcher] Worker error', event)
			}
			this.worker.onmessageerror = (event) => {
				console.warn('[ResourceNodeBatcher] Worker message error', event)
			}
			if (DEBUG_LOAD_TIMING) {
				this.workerInitAt = performance.now()
				window.setTimeout(() => {
					if (!this.workerReady) {
						console.warn('[Perf] resource-node-worker not ready after 2000ms')
					}
				}, 2000)
			}
			this.worker.postMessage({
				type: 'init',
				tileHalf: tileSize / 2,
				baseOffset: BASE_OFFSET
			})
		}

		if (resourceNodeRenderService.isLoaded()) {
			this.refreshRenderBatches()
		} else {
			this.renderUnsubscribe = resourceNodeRenderService.subscribe(() => {
				this.refreshRenderBatches()
			})
		}
	}

	add(object: MapObject): boolean {
		if (!object?.metadata?.resourceNode) return false
		this.objectsById.set(object.id, object)
		const nodeType = object?.metadata?.resourceNodeType
		const renderConfig = resourceNodeRenderService.isLoaded() ? resourceNodeRenderService.getRender(nodeType) : null
		if (renderConfig?.render?.modelSrc) {
			const render = renderConfig.render
			const modelKey = this.getModelBatchKey(render)
			if (ResourceNodeBatcher.failedModelSrcs.has(render.modelSrc)) {
				return this.addEmojiNode(object)
			}
			if (ResourceNodeBatcher.unsupportedModelSrcs.has(render.modelSrc)) {
				return this.addEmojiNode(object)
			}
			this.ensureModelBatch(modelKey, render)
			if (this.idToBatchKey.has(object.id)) return true
			const elevation = this.getNodeElevation(object, render)
			this.idToBatchKey.set(object.id, modelKey)
			this.trackBatchId(modelKey, object.id)
			this.worker?.postMessage({
				type: 'add',
				key: modelKey,
				id: object.id,
				x: object.position.x,
				y: object.position.y,
				rotation: typeof object.rotation === 'number' ? object.rotation : 0,
				elevation
			})
			return true
		}

		return this.addEmojiNode(object)
	}

	remove(objectId: string): boolean {
		const key = this.idToBatchKey.get(objectId)
		if (!key) {
			this.objectsById.delete(objectId)
			this.removePendingEmoji(objectId)
			return false
		}
		if (key.startsWith('pending-emoji:')) {
			this.idToBatchKey.delete(objectId)
			this.objectsById.delete(objectId)
			this.removePendingEmoji(objectId)
			return true
		}
		const batch = this.batches.get(key)
		if (!batch) return false
		this.idToBatchKey.delete(objectId)
		this.objectsById.delete(objectId)
		this.untrackBatchId(key, objectId)
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
		if (this.renderUnsubscribe) {
			this.renderUnsubscribe()
			this.renderUnsubscribe = null
		}
		for (const batch of this.batches.values()) {
			if (batch.hasBuffer) {
				batch.baseMeshes.forEach((mesh) => {
					mesh.thinInstanceSetBuffer('matrix', new Float32Array(0), 16)
					mesh.thinInstanceCount = 0
				})
			}
			batch.baseMeshes.forEach((mesh) => mesh.dispose())
			batch.root?.dispose()
		}
		this.batches.clear()
		this.idToBatchKey.clear()
		this.objectsById.clear()
		this.batchToIds.clear()
		this.pendingEmojiItems.clear()
		this.pendingEmojiUnsubscribes.forEach((unsubscribe) => unsubscribe())
		this.pendingEmojiUnsubscribes.clear()
		this.pendingResults.clear()
		this.modelLoadPromises.clear()
		this.worker?.terminate()
		this.worker = null
	}

	private refreshRenderBatches(): void {
		if (!resourceNodeRenderService.isLoaded()) return
		const toUpgrade: MapObject[] = []
		for (const [id, obj] of this.objectsById.entries()) {
			if (!obj?.metadata?.resourceNode) continue
			const nodeType = obj.metadata?.resourceNodeType
			const renderConfig = resourceNodeRenderService.getRender(nodeType)
			if (!renderConfig?.render?.modelSrc) continue
			const key = this.idToBatchKey.get(id)
			if (!key || key.startsWith('emoji:') || key.startsWith('pending-emoji:')) {
				toUpgrade.push(obj)
			}
		}

		toUpgrade.forEach((obj) => {
			this.remove(obj.id)
			this.add(obj)
		})
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
		if (!data) return
		if (data.type === 'ready') {
			this.workerReady = true
			if (DEBUG_LOAD_TIMING && this.workerInitAt > 0) {
				const elapsed = performance.now() - this.workerInitAt
				console.info(`[Perf] resource-node-worker ready time=${elapsed.toFixed(1)}ms`)
			}
			return
		}
		if (data.type !== 'result') return
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
					batch.baseMeshes.forEach((mesh) => {
						mesh.thinInstanceCount = 0
					})
				}
				continue
			}
			if (!batch.ready) {
				this.pendingResults.set(key, result)
				continue
			}
			batch.baseMeshes.forEach((mesh) => {
				mesh.thinInstanceSetBuffer('matrix', result.matrices, 16, true)
				mesh.thinInstanceCount = result.count
			})
			batch.hasBuffer = true
		}

		this.awaitingResult = false
		if (this.queuedBounds) {
			const next = this.queuedBounds
			this.queuedBounds = null
			this.updateVisible(next)
		}
	}

	private addEmojiNode(object: MapObject): boolean {
		const itemMeta = itemService.getItemType(object.item.itemType)
		const emoji = itemMeta?.emoji
		if (!emoji) {
			this.queueEmojiFallback(object)
			return true
		}

		const elevation = this.renderer.getGroundHeightAt(
			object.position.x + this.tileHalf,
			object.position.y + this.tileHalf
		)

		const key = `emoji:${object.item.itemType}:${emoji}`
		let batch = this.batches.get(key)
		if (!batch) {
			const base = MeshBuilder.CreateBox(
				`resource-node-${key}`,
				{ width: this.tileSize, height: this.tileSize, depth: this.tileSize },
				this.renderer.scene
			)
			base.isVisible = true
			base.isPickable = false
			base.thinInstanceEnablePicking = false
			base.alwaysSelectAsActiveMesh = true
			base.position.set(-BASE_OFFSET, -BASE_OFFSET, -BASE_OFFSET)
			this.renderer.applyEmoji(base, emoji)
			batch = {
				type: 'emoji',
				baseMeshes: [base],
				hasBuffer: false,
				ready: true
			}
			this.batches.set(key, batch)
		}
		const existingKey = this.idToBatchKey.get(object.id)
		if (existingKey && !existingKey.startsWith('pending-emoji:')) return true
		this.idToBatchKey.set(object.id, key)
		this.trackBatchId(key, object.id)
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

	private ensureModelBatch(batchKey: string, renderConfig: ModelRenderConfig): void {
		if (this.batches.has(batchKey)) return
		if (this.modelLoadPromises.has(batchKey)) return

		const placeholder: Batch = {
			type: 'model',
			baseMeshes: [],
			hasBuffer: false,
			ready: false
		}
		this.batches.set(batchKey, placeholder)
		this.worker?.postMessage({
			type: 'config',
			key: batchKey,
			baseRotation: {
				x: renderConfig.transform?.rotation?.x ?? 0,
				y: renderConfig.transform?.rotation?.y ?? 0,
				z: renderConfig.transform?.rotation?.z ?? 0
			},
			scale: {
				x: (renderConfig.transform?.scale?.x ?? 1) * this.tileSize,
				y: (renderConfig.transform?.scale?.y ?? 1) * this.tileSize,
				z: (renderConfig.transform?.scale?.z ?? 1) * this.tileSize
			},
			baseYOffset: 0
		})

		const promise = this.loadModelBatch(batchKey, renderConfig)
		this.modelLoadPromises.set(batchKey, promise)
		void promise.then((batch) => {
			this.modelLoadPromises.delete(batchKey)
			if (!batch) {
				this.batches.delete(batchKey)
				this.fallbackBatchToEmoji(batchKey)
				return
			}
			this.batches.set(batchKey, batch)
			const pending = this.pendingResults.get(batchKey)
			if (pending) {
				batch.baseMeshes.forEach((mesh) => {
					mesh.thinInstanceSetBuffer('matrix', pending.matrices, 16, true)
					mesh.thinInstanceCount = pending.count
				})
				batch.hasBuffer = pending.count > 0
				this.pendingResults.delete(batchKey)
			}
		})
	}

	private async loadModelBatch(batchKey: string, renderConfig: ModelRenderConfig): Promise<Batch | null> {
		const modelSrc = renderConfig.modelSrc
		if (!modelSrc) return null
		const scene = this.renderer.scene
		try {
			const container = await ResourceNodeBatcher.getModelContainer(scene, modelSrc)
			if (container.skeletons?.length) {
				ResourceNodeBatcher.unsupportedModelSrcs.add(modelSrc)
				ResourceNodeBatcher.modelContainerCache.delete(modelSrc)
				container.dispose()
				return null
			}

			container.addAllToScene()
			const root = new TransformNode(`resource-node-root-${batchKey}`, scene)
			const pivot = new TransformNode(`resource-node-pivot-${batchKey}`, scene)
			pivot.parent = root

			const meshSet = new Set<Mesh>()
			container.meshes.forEach((mesh) => {
				if (mesh instanceof Mesh) {
					meshSet.add(mesh)
				}
			})

			container.rootNodes.forEach((node) => {
				if (node.parent === null) {
					node.parent = pivot
				}
				node.setEnabled(true)
				if ('getChildMeshes' in node && typeof node.getChildMeshes === 'function') {
					node.getChildMeshes(false).forEach((mesh) => {
						if (mesh instanceof Mesh) {
							meshSet.add(mesh)
						}
					})
				}
			})

			const meshes = Array.from(meshSet)
			if (meshes.length === 0) {
				ResourceNodeBatcher.unsupportedModelSrcs.add(modelSrc)
				ResourceNodeBatcher.modelContainerCache.delete(modelSrc)
				container.dispose()
				return null
			}
			meshes.forEach((mesh) => {
				mesh.computeWorldMatrix(true)
				const world = mesh.getWorldMatrix().clone()
				mesh.bakeTransformIntoVertices(world)
				mesh.rotationQuaternion = null
				mesh.position.set(0, 0, 0)
				mesh.rotation.set(0, 0, 0)
				mesh.scaling.set(1, 1, 1)
				mesh.parent = pivot
				mesh.isPickable = false
				mesh.isVisible = true
				mesh.visibility = 1
				mesh.thinInstanceEnablePicking = false
				mesh.alwaysSelectAsActiveMesh = true
				mesh.refreshBoundingInfo()
				mesh.computeWorldMatrix(true)
			})

			const bounds = getBounds(meshes)
			const transform = renderConfig.transform || {}
			const scale = transform.scale ?? { x: 1, y: 1, z: 1 }
			const scaleX = (scale.x ?? 1) * this.tileSize
			const scaleY = (scale.y ?? 1) * this.tileSize
			const scaleZ = (scale.z ?? 1) * this.tileSize
			if (bounds) {
				const center = bounds.min.add(bounds.max).scale(0.5)
				pivot.position = new Vector3(-center.x * scaleX, -bounds.min.y * scaleY, -center.z * scaleZ)
			}
			root.position = new Vector3(-BASE_OFFSET, -BASE_OFFSET, -BASE_OFFSET)

			return {
				type: 'model',
				baseMeshes: meshes,
				hasBuffer: false,
				ready: true,
				root
			}
		} catch (error) {
			ResourceNodeBatcher.failedModelSrcs.add(modelSrc)
			ResourceNodeBatcher.modelContainerCache.delete(modelSrc)
			console.warn('[ResourceNodeBatcher] Failed to load model', modelSrc, error)
			return null
		}
	}

	private getModelBatchKey(render: ModelRenderConfig): string {
		const rotation = render.transform?.rotation ?? {}
		const scale = render.transform?.scale ?? {}
		const elevation = render.transform?.elevation ?? 0
		return `model:${render.modelSrc}:${rotation.x ?? 0},${rotation.y ?? 0},${rotation.z ?? 0}:${scale.x ?? 1},${scale.y ?? 1},${scale.z ?? 1}:${elevation}`
	}

	private getNodeElevation(object: MapObject, renderConfig: ModelRenderConfig): number {
		const base = this.renderer.getGroundHeightAt(
			object.position.x + this.tileHalf,
			object.position.y + this.tileHalf
		)
		const elevation = renderConfig.transform?.elevation ?? 0
		return base + elevation * this.tileSize
	}

	private static async getModelContainer(
		scene: import('@babylonjs/core').Scene,
		modelSrc: string
	): Promise<AssetContainer> {
		const cached = ResourceNodeBatcher.modelContainerCache.get(modelSrc)
		if (cached) return cached
		const { rootUrl, fileName } = splitAssetUrl(modelSrc)
		const promise = SceneLoader.LoadAssetContainerAsync(rootUrl, fileName, scene)
			.then((container) => {
				container.removeAllFromScene()
				return container
			})
			.catch((error) => {
				ResourceNodeBatcher.modelContainerCache.delete(modelSrc)
				throw error
			})
		ResourceNodeBatcher.modelContainerCache.set(modelSrc, promise)
		return promise
	}

	private trackBatchId(batchKey: string, objectId: string): void {
		let set = this.batchToIds.get(batchKey)
		if (!set) {
			set = new Set()
			this.batchToIds.set(batchKey, set)
		}
		set.add(objectId)
	}

	private untrackBatchId(batchKey: string, objectId: string): void {
		const set = this.batchToIds.get(batchKey)
		if (!set) return
		set.delete(objectId)
		if (set.size === 0) {
			this.batchToIds.delete(batchKey)
		}
	}

	private fallbackBatchToEmoji(batchKey: string): void {
		const ids = this.batchToIds.get(batchKey)
		if (!ids) return
		const list = Array.from(ids)
		list.forEach((id) => {
			this.worker?.postMessage({ type: 'remove', key: batchKey, id })
			this.idToBatchKey.delete(id)
			this.untrackBatchId(batchKey, id)
			const obj = this.objectsById.get(id)
			if (obj) {
				this.addEmojiNode(obj)
			}
		})
	}

	private queueEmojiFallback(object: MapObject): void {
		const itemType = object.item.itemType
		let set = this.pendingEmojiItems.get(itemType)
		if (!set) {
			set = new Set()
			this.pendingEmojiItems.set(itemType, set)
		}
		set.add(object.id)
		this.idToBatchKey.set(object.id, `pending-emoji:${itemType}`)
		if (this.pendingEmojiUnsubscribes.has(itemType)) return
		let fired = false
		const unsubscribe = itemService.subscribeToItemMetadata(itemType, () => {
			if (fired) return
			fired = true
			const pending = this.pendingEmojiItems.get(itemType)
			if (!pending) return
			pending.forEach((id) => {
				const obj = this.objectsById.get(id)
				if (obj) {
					this.addEmojiNode(obj)
				}
			})
			this.pendingEmojiItems.delete(itemType)
			const unsub = this.pendingEmojiUnsubscribes.get(itemType)
			if (unsub) unsub()
			this.pendingEmojiUnsubscribes.delete(itemType)
		})
		this.pendingEmojiUnsubscribes.set(itemType, unsubscribe)
		if (fired) {
			unsubscribe()
			this.pendingEmojiUnsubscribes.delete(itemType)
		}
	}

	private removePendingEmoji(objectId: string): void {
		for (const [itemType, set] of this.pendingEmojiItems.entries()) {
			if (!set.has(objectId)) continue
			set.delete(objectId)
			if (set.size === 0) {
				this.pendingEmojiItems.delete(itemType)
				const unsub = this.pendingEmojiUnsubscribes.get(itemType)
				if (unsub) unsub()
				this.pendingEmojiUnsubscribes.delete(itemType)
			}
			break
		}
	}
}

function splitAssetUrl(url: string): { rootUrl: string; fileName: string } {
	const trimmed = url.trim()
	if (!trimmed) return { rootUrl: '', fileName: '' }
	const lastSlash = trimmed.lastIndexOf('/')
	if (lastSlash === -1) {
		return { rootUrl: '/', fileName: trimmed }
	}
	return {
		rootUrl: trimmed.slice(0, lastSlash + 1),
		fileName: trimmed.slice(lastSlash + 1)
	}
}

function getBounds(meshes: AbstractMesh[]): { min: Vector3; max: Vector3 } | null {
	let min = new Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
	let max = new Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY)
	let found = false
	meshes.forEach((mesh) => {
		if (mesh.getTotalVertices() === 0) return
		mesh.computeWorldMatrix(true)
		const bounds = mesh.getBoundingInfo().boundingBox
		min = Vector3.Minimize(min, bounds.minimumWorld)
		max = Vector3.Maximize(max, bounds.maximumWorld)
		found = true
	})
	return found ? { min, max } : null
}
