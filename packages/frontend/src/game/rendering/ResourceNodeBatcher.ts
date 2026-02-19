import { AbstractMesh, AssetContainer, Mesh, MeshBuilder, SceneLoader, TransformNode, Vector3 } from '@babylonjs/core'
import '@babylonjs/loaders'
import type { BabylonRenderer } from './BabylonRenderer'
import type { MapObject } from '@rugged/game'
import { itemService } from '../services/ItemService'
import { resourceNodeRenderService } from '../services/ResourceNodeRenderService'

const BASE_OFFSET = 100000
const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
const TREE_GROWTH_SCALES = [0.4, 0.7, 1]

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
		offset?: { x: number; y: number; z: number }
	}
}

type GrowthState = {
	startMs: number
	durationMs: number
	stageIndex: number
	baseScale: number
	stageScales: number[]
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
	private batchIdOrder: Map<string, string[]> = new Map()
	private batchIdIndex: Map<string, Map<string, number>> = new Map()
	private meshToBatchKey: Map<number, string> = new Map()
	private batchKeyNodeTypes: Map<string, Set<string>> = new Map()
	private pickableNodeTypes: Set<string> = new Set()
	private pickableBatchKeys: Set<string> = new Set()
	private pendingEmojiItems: Map<string, Set<string>> = new Map()
	private pendingEmojiUnsubscribes: Map<string, () => void> = new Map()
	private pendingResults: Map<string, WorkerBatchResult> = new Map()
	private modelLoadPromises: Map<string, Promise<Batch | null>> = new Map()
	private visibleBatchKeys: Set<string> = new Set()
	private visibleIdOrder: Map<string, string[]> = new Map()
	private growthStates: Map<string, GrowthState> = new Map()
	private worker: Worker | null = null
	private workerRequestId = 0
	private awaitingResult = false
	private queuedBounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null
	private lastUpdateBounds: { minX: number; minY: number; maxX: number; maxY: number } | null = null
	private workerReady = false
	private workerInitAt = 0
	private tileHalf: number
	private renderUnsubscribe: (() => void) | null = null
	private shadowRebakePending = false

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
		const baseScale = getSeededScale(object.id)
		const growthState = this.resolveGrowthState(object, baseScale)
		const scale = growthState ? baseScale * (growthState.stageScales[growthState.stageIndex] ?? 1) : baseScale
		const nodeType = object?.metadata?.resourceNodeType
		const render = resourceNodeRenderService.isLoaded()
			? resourceNodeRenderService.getRenderModel(nodeType, object.id)
			: null
		if (render?.modelSrc) {
			const modelKey = this.getModelBatchKey(render)
			this.trackBatchNodeType(modelKey, nodeType)
			if (ResourceNodeBatcher.failedModelSrcs.has(render.modelSrc)) {
				return this.addEmojiNode(object, scale)
			}
			if (ResourceNodeBatcher.unsupportedModelSrcs.has(render.modelSrc)) {
				return this.addEmojiNode(object, scale)
			}
			this.ensureModelBatch(modelKey, render)
			if (this.idToBatchKey.has(object.id)) return true
			const elevation = this.getNodeElevation(object, render)
			const rotationOffset = getSeededRotation(object.id)
			const rotation = (typeof object.rotation === 'number' ? object.rotation : 0) + rotationOffset
			this.idToBatchKey.set(object.id, modelKey)
			this.trackBatchId(modelKey, object.id)
			this.worker?.postMessage({
				type: 'add',
				key: modelKey,
				id: object.id,
				x: object.position.x,
				y: object.position.y,
				rotation,
				elevation,
				scale
			})
			return true
		}

		return this.addEmojiNode(object, scale)
	}

	remove(objectId: string): boolean {
		const key = this.idToBatchKey.get(objectId)
		if (!key) {
			this.objectsById.delete(objectId)
			this.removePendingEmoji(objectId)
			this.growthStates.delete(objectId)
			return false
		}
		if (key.startsWith('pending-emoji:')) {
			this.idToBatchKey.delete(objectId)
			this.objectsById.delete(objectId)
			this.removePendingEmoji(objectId)
			this.growthStates.delete(objectId)
			return true
		}
		const batch = this.batches.get(key)
		if (!batch) return false
		this.idToBatchKey.delete(objectId)
		this.objectsById.delete(objectId)
		this.untrackBatchId(key, objectId)
		this.growthStates.delete(objectId)
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

	updateGrowthStages(nowMs: number): boolean {
		let updated = false
		for (const [id, state] of this.growthStates.entries()) {
			if (state.durationMs <= 0) continue
			const progress = clamp((nowMs - state.startMs) / state.durationMs, 0, 1)
			const nextStage = getGrowthStageIndex(progress, state.stageScales.length)
			if (nextStage === state.stageIndex) continue
			state.stageIndex = nextStage
			const key = this.idToBatchKey.get(id)
			if (!key || key.startsWith('pending-emoji:')) continue
			const scale = state.baseScale * (state.stageScales[nextStage] ?? 1)
			this.worker?.postMessage({ type: 'scale', key, id, scale })
			updated = true
		}
		return updated
	}

	public getObjects(): MapObject[] {
		return Array.from(this.objectsById.values())
	}

	public setPickableNodeTypes(types: string[]): void {
		this.pickableNodeTypes = new Set(types.filter(Boolean))
		for (const [batchKey, nodeTypes] of this.batchKeyNodeTypes.entries()) {
			for (const nodeType of nodeTypes) {
				if (this.pickableNodeTypes.has(nodeType)) {
					this.markBatchPickable(batchKey)
					break
				}
			}
		}
	}

	public getObjectForPick(mesh: AbstractMesh, thinInstanceIndex?: number): MapObject | null {
		if (!mesh || thinInstanceIndex === undefined || thinInstanceIndex === null) {
			return null
		}
		if (thinInstanceIndex < 0) return null
		const batchKey = (mesh.metadata as { resourceNodeBatchKey?: string } | undefined)?.resourceNodeBatchKey
			|| this.meshToBatchKey.get(mesh.uniqueId)
		if (!batchKey) return null
		const order = this.visibleIdOrder.get(batchKey) || this.batchIdOrder.get(batchKey)
		if (!order || thinInstanceIndex >= order.length) return null
		const objectId = order[thinInstanceIndex]
		if (!objectId) return null
		return this.objectsById.get(objectId) ?? null
	}

	public requestShadowRebake(): void {
		this.shadowRebakePending = true
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
		this.batchIdOrder.clear()
		this.batchIdIndex.clear()
		this.meshToBatchKey.clear()
		this.batchKeyNodeTypes.clear()
		this.pickableNodeTypes.clear()
		this.pickableBatchKeys.clear()
		this.visibleIdOrder.clear()
		this.pendingEmojiItems.clear()
		this.pendingEmojiUnsubscribes.forEach((unsubscribe) => unsubscribe())
		this.pendingEmojiUnsubscribes.clear()
		this.pendingResults.clear()
		this.modelLoadPromises.clear()
		this.visibleBatchKeys.clear()
		this.growthStates.clear()
		this.worker?.terminate()
		this.worker = null
	}

	private refreshRenderBatches(): void {
		if (!resourceNodeRenderService.isLoaded()) return
		const toUpgrade: MapObject[] = []
		for (const [id, obj] of this.objectsById.entries()) {
			if (!obj?.metadata?.resourceNode) continue
			const nodeType = obj.metadata?.resourceNodeType
			const render = resourceNodeRenderService.getRenderModel(nodeType, id)
			if (!render?.modelSrc) continue
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
		this.lastUpdateBounds = bounds
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

		const nextVisibleKeys = new Set<string>()
		let appliedVisibleChange = false
		for (const [key, result] of Object.entries(data.batches)) {
			if (!result || result.count <= 0) continue
			const batch = this.batches.get(key)
			if (!batch) continue
			nextVisibleKeys.add(key)
			if (!batch.ready) {
				this.pendingResults.set(key, result)
				continue
			}
			batch.baseMeshes.forEach((mesh) => {
				mesh.thinInstanceSetBuffer('matrix', result.matrices, 16, true)
				mesh.thinInstanceCount = result.count
				mesh.thinInstanceRefreshBoundingInfo(true)
			})
			batch.hasBuffer = true
			appliedVisibleChange = true
			if (this.pickableBatchKeys.has(key)) {
				const visibleIds = this.buildVisibleIdOrder(key, this.lastUpdateBounds)
				this.visibleIdOrder.set(
					key,
					visibleIds.length === result.count ? visibleIds : visibleIds.slice(0, result.count)
				)
			} else {
				this.visibleIdOrder.set(key, [])
			}
		}

		for (const key of this.visibleBatchKeys) {
			if (nextVisibleKeys.has(key)) continue
			const batch = this.batches.get(key)
			if (!batch || !batch.hasBuffer) continue
			batch.baseMeshes.forEach((mesh) => {
				mesh.thinInstanceCount = 0
				mesh.thinInstanceRefreshBoundingInfo(true)
			})
			batch.hasBuffer = false
			appliedVisibleChange = true
			this.visibleIdOrder.set(key, [])
		}
		this.visibleBatchKeys = nextVisibleKeys

		if (appliedVisibleChange && this.shadowRebakePending) {
			this.shadowRebakePending = false
			this.renderer.rebakeEnvironmentShadowsSoon()
		}

		this.awaitingResult = false
		if (this.queuedBounds) {
			const next = this.queuedBounds
			this.queuedBounds = null
			this.updateVisible(next)
		}
	}

	private resolveGrowthState(object: MapObject, baseScale: number): GrowthState | null {
		const growth = getTreeGrowthMetadata(object)
		if (!growth) {
			this.growthStates.delete(object.id)
			return null
		}
		const durationMs = growth.durationMs
		if (durationMs <= 0) {
			this.growthStates.delete(object.id)
			return null
		}
		const existing = this.growthStates.get(object.id)
		if (existing && existing.durationMs === durationMs) {
			return existing
		}
		const elapsedMs = clamp(growth.elapsedMs, 0, durationMs)
		const stageIndex = getGrowthStageIndex(elapsedMs / durationMs, TREE_GROWTH_SCALES.length)
		const state: GrowthState = {
			startMs: perfNow() - elapsedMs,
			durationMs,
			stageIndex,
			baseScale,
			stageScales: TREE_GROWTH_SCALES
		}
		this.growthStates.set(object.id, state)
		return state
	}

	private resolveNodeScale(object: MapObject): number {
		const baseScale = getSeededScale(object.id)
		const growthState = this.resolveGrowthState(object, baseScale)
		return growthState ? baseScale * (growthState.stageScales[growthState.stageIndex] ?? 1) : baseScale
	}

	private addEmojiNode(object: MapObject, scaleOverride?: number): boolean {
		const itemMeta = itemService.getItemType(object.item.itemType)
		const emoji = itemMeta?.emoji
		if (!emoji) {
			this.queueEmojiFallback(object)
			return true
		}

		const scale = this.resolveEmojiScale(object, scaleOverride)
		const elevation = this.renderer.getGroundHeightAt(
			object.position.x + this.tileHalf,
			object.position.y + this.tileHalf
		)

		const key = `emoji:${object.item.itemType}:${emoji}`
		this.trackBatchNodeType(key, object?.metadata?.resourceNodeType)
		let batch = this.batches.get(key)
		if (!batch) {
			const base = MeshBuilder.CreateBox(
				`resource-node-${key}`,
				{ width: this.tileSize, height: this.tileSize, depth: this.tileSize },
				this.renderer.scene
			)
			base.isVisible = true
			const isPickable = this.pickableBatchKeys.has(key)
			base.isPickable = isPickable
			base.thinInstanceEnablePicking = isPickable
			base.alwaysSelectAsActiveMesh = true
			base.metadata = { ...(base.metadata || {}), resourceNodeBatchKey: key }
			this.meshToBatchKey.set(base.uniqueId, key)
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
			elevation,
			scale
		})
		return true
	}

	private resolveEmojiScale(object: MapObject, scaleOverride?: number): number {
		const baseScale = Number.isFinite(scaleOverride) ? (scaleOverride as number) : getSeededScale(object.id)
		const footprintScale = this.getFootprintScale(object)
		if (object?.metadata?.resourceNodeType === 'resource_deposit') {
			return footprintScale || baseScale
		}
		return footprintScale > 1 ? baseScale * footprintScale : baseScale
	}

	private getFootprintScale(object: MapObject): number {
		const metadata = object?.metadata as { footprint?: { width?: number; height?: number; length?: number } } | undefined
		const footprint = metadata?.footprint
		let width = Number(footprint?.width)
		let height = Number(footprint?.height ?? footprint?.length)
		if (!Number.isFinite(width) || width <= 0) width = 1
		if (!Number.isFinite(height) || height <= 0) height = width
		return Math.max(width, height)
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
			baseYOffset: 0,
			pivotOffset: { x: 0, y: 0, z: 0 },
			offset: {
				x: (renderConfig.transform?.offset?.x ?? 0) * this.tileSize,
				y: (renderConfig.transform?.offset?.y ?? 0) * this.tileSize,
				z: (renderConfig.transform?.offset?.z ?? 0) * this.tileSize
			}
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
					mesh.thinInstanceRefreshBoundingInfo(true)
				})
				batch.hasBuffer = pending.count > 0
				this.pendingResults.delete(batchKey)
				if (batch.hasBuffer && this.shadowRebakePending) {
					this.shadowRebakePending = false
					this.renderer.rebakeEnvironmentShadowsSoon()
				}
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
			const isPickable = this.pickableBatchKeys.has(batchKey)
			meshes.forEach((mesh) => {
				mesh.computeWorldMatrix(true)
				const world = mesh.getWorldMatrix().clone()
				mesh.bakeTransformIntoVertices(world)
				mesh.rotationQuaternion = null
				mesh.position.set(0, 0, 0)
				mesh.rotation.set(0, 0, 0)
				mesh.scaling.set(1, 1, 1)
				mesh.parent = pivot
				mesh.isPickable = isPickable
				mesh.isVisible = true
				mesh.visibility = 1
				mesh.thinInstanceEnablePicking = isPickable
				mesh.alwaysSelectAsActiveMesh = true
				mesh.metadata = { ...(mesh.metadata || {}), resourceNodeBatchKey: batchKey }
				this.meshToBatchKey.set(mesh.uniqueId, batchKey)
				mesh.refreshBoundingInfo()
				mesh.computeWorldMatrix(true)
			})

			const bounds = getBounds(meshes)
			const transform = renderConfig.transform || {}
			const scale = transform.scale ?? { x: 1, y: 1, z: 1 }
			const offset = transform.offset ?? { x: 0, y: 0, z: 0 }
			const scaleX = (scale.x ?? 1) * this.tileSize
			const scaleY = (scale.y ?? 1) * this.tileSize
			const scaleZ = (scale.z ?? 1) * this.tileSize
			let pivotOffset = new Vector3(0, 0, 0)
			if (bounds) {
				const center = bounds.min.add(bounds.max).scale(0.5)
				pivotOffset = new Vector3(-center.x * scaleX, -bounds.min.y * scaleY, -center.z * scaleZ)
				pivot.position.copyFrom(pivotOffset)
			}
			root.position = new Vector3(-BASE_OFFSET, -BASE_OFFSET, -BASE_OFFSET)

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
				baseYOffset: 0,
				pivotOffset: { x: pivotOffset.x, y: pivotOffset.y, z: pivotOffset.z },
				offset: {
					x: (offset.x ?? 0) * this.tileSize,
					y: (offset.y ?? 0) * this.tileSize,
					z: (offset.z ?? 0) * this.tileSize
				}
			})

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
		const offset = render.transform?.offset ?? {}
		return `model:${render.modelSrc}:${rotation.x ?? 0},${rotation.y ?? 0},${rotation.z ?? 0}:${scale.x ?? 1},${scale.y ?? 1},${scale.z ?? 1}:${elevation}:${offset.x ?? 0},${offset.y ?? 0},${offset.z ?? 0}`
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
		if (set.has(objectId)) {
			return
		}
		set.add(objectId)

		let order = this.batchIdOrder.get(batchKey)
		if (!order) {
			order = []
			this.batchIdOrder.set(batchKey, order)
		}
		let indexMap = this.batchIdIndex.get(batchKey)
		if (!indexMap) {
			indexMap = new Map()
			this.batchIdIndex.set(batchKey, indexMap)
		}
		indexMap.set(objectId, order.length)
		order.push(objectId)
	}

	private untrackBatchId(batchKey: string, objectId: string): void {
		const set = this.batchToIds.get(batchKey)
		if (!set) return
		if (set.delete(objectId) && set.size === 0) {
			this.batchToIds.delete(batchKey)
		}

		const order = this.batchIdOrder.get(batchKey)
		const indexMap = this.batchIdIndex.get(batchKey)
		if (!order || !indexMap) return
		const index = indexMap.get(objectId)
		if (index === undefined) return
		const lastIndex = order.length - 1
		const lastId = order[lastIndex]
		order[index] = lastId
		order.pop()
		indexMap.delete(objectId)
		if (index !== lastIndex) {
			indexMap.set(lastId, index)
		}
		if (order.length === 0) {
			this.batchIdOrder.delete(batchKey)
			this.batchIdIndex.delete(batchKey)
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
				this.addEmojiNode(obj, this.resolveNodeScale(obj))
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
					this.addEmojiNode(obj, this.resolveNodeScale(obj))
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

	private trackBatchNodeType(batchKey: string, nodeType?: string | null): void {
		if (!nodeType) return
		let set = this.batchKeyNodeTypes.get(batchKey)
		if (!set) {
			set = new Set()
			this.batchKeyNodeTypes.set(batchKey, set)
		}
		if (!set.has(nodeType)) {
			set.add(nodeType)
		}
		if (this.pickableNodeTypes.has(nodeType)) {
			this.markBatchPickable(batchKey)
		}
	}

	private markBatchPickable(batchKey: string): void {
		if (this.pickableBatchKeys.has(batchKey)) return
		this.pickableBatchKeys.add(batchKey)
		const batch = this.batches.get(batchKey)
		if (!batch || !batch.baseMeshes.length) return
		batch.baseMeshes.forEach((mesh) => {
			mesh.isPickable = true
			mesh.thinInstanceEnablePicking = true
			mesh.metadata = { ...(mesh.metadata || {}), resourceNodeBatchKey: batchKey }
			this.meshToBatchKey.set(mesh.uniqueId, batchKey)
		})
	}

	private buildVisibleIdOrder(
		batchKey: string,
		bounds: { minX: number; minY: number; maxX: number; maxY: number } | null
	): string[] {
		const order = this.batchIdOrder.get(batchKey)
		if (!order || order.length === 0) {
			return []
		}
		if (!bounds) {
			return [...order]
		}
		const results: string[] = []
		for (const objectId of order) {
			const obj = this.objectsById.get(objectId)
			if (!obj) continue
			const cx = obj.position.x + this.tileHalf
			const cy = obj.position.y + this.tileHalf
			if (cx < bounds.minX || cx > bounds.maxX || cy < bounds.minY || cy > bounds.maxY) {
				continue
			}
			results.push(objectId)
		}
		return results
	}
}

function getTreeGrowthMetadata(object: MapObject): { durationMs: number; elapsedMs: number } | null {
	if (object?.metadata?.resourceNodeType !== 'tree') return null
	const growth = object?.metadata?.growth
	const durationMs = Number(growth?.durationMs)
	if (!Number.isFinite(durationMs) || durationMs <= 0) return null
	const elapsedMs = Number(growth?.elapsedMs)
	const safeElapsed = Number.isFinite(elapsedMs) ? elapsedMs : 0
	return { durationMs, elapsedMs: safeElapsed }
}

function getGrowthStageIndex(progress: number, stages: number): number {
	if (!Number.isFinite(progress) || stages <= 0) return 0
	const clamped = clamp(progress, 0, 1)
	return Math.min(stages - 1, Math.floor(clamped * stages))
}

function clamp(value: number, min: number, max: number): number {
	if (value < min) return min
	if (value > max) return max
	return value
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

function getSeededScale(seedKey: string | number): number {
	const fraction = getSeededFractionWithSalt(seedKey, 'scale')
	return 0.8 + 0.4 * fraction
}

function getSeededRotation(seedKey: string | number): number {
	const fraction = getSeededFractionWithSalt(seedKey, 'rotation')
	return fraction * Math.PI * 2
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
