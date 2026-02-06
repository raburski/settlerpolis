import { BaseEntityView } from '../BaseEntityView'
import type { GameScene } from '../../scenes/base/GameScene'
import type { MapObject } from '@rugged/game'
import { ConstructionStage } from '@rugged/game'
import { itemService } from '../../services/ItemService'
import { buildingService } from '../../services/BuildingService'
import { resourceNodeRenderService } from '../../services/ResourceNodeRenderService'
import { EventBus } from '../../EventBus'
import { UiEvents } from '../../uiEvents'
import { Event } from '@rugged/game'
import {
	AbstractMesh,
	AnimationGroup,
	AssetContainer,
	Color3,
	Mesh,
	MeshBuilder,
	SceneLoader,
	Skeleton,
	StandardMaterial,
	TransformNode,
	Vector3
} from '@babylonjs/core'
import '@babylonjs/loaders'

const DEBUG_LOAD_TIMING = String(import.meta.env.VITE_DEBUG_LOAD_TIMING || '').toLowerCase() === 'true'
const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())

export class MapObjectView extends BaseEntityView {
	private static debugBoundsEnabled = false
	private static debugInitialized = false
	private static debugInstances = new Set<MapObjectView>()

	private static ensureDebugSubscription(): void {
		if (MapObjectView.debugInitialized) return
		MapObjectView.debugInitialized = true
		EventBus.on(UiEvents.Debug.BoundsToggle, (data: { enabled: boolean }) => {
			MapObjectView.debugBoundsEnabled = Boolean(data?.enabled)
			MapObjectView.debugInstances.forEach((instance) => instance.applyDebugBounds())
		})
	}

	private mapObject: MapObject
	private isBuilding: boolean = false
	private isHighlighted: boolean = false
	private highlightHandler: ((data: { buildingInstanceId: string; highlighted: boolean }) => void) | null = null
	private completedHandler: ((data: { building: any }) => void) | null = null
	private progressHandler: ((data: { buildingInstanceId: string; progress: number; stage: string }) => void) | null = null
	private buildingStage: ConstructionStage | null = null
	private staticRect: { x: number; y: number; width: number; height: number } | null = null
	private unsubscribe: (() => void) | null = null
	private modelRoot: TransformNode | null = null
	private modelPivot: TransformNode | null = null
	private modelMeshes: AbstractMesh[] = []
	private modelSrc: string | null = null
	private modelFailedSrc: string | null = null
	private modelLoading: Promise<void> | null = null
	private modelInstanceRoots: TransformNode[] = []
	private modelInstanceSkeletons: Skeleton[] = []
	private modelInstanceAnimationGroups: AnimationGroup[] = []
	private invisibleMaterial: StandardMaterial | null = null
	private debugBoundsMesh: Mesh | null = null
	private debugBoundsMaterial: StandardMaterial | null = null
	private debugRootMesh: Mesh | null = null
	private debugRootMaterial: StandardMaterial | null = null
	private debugLoggedNoBounds: boolean = false
	private debugLoggedBounds: boolean = false
	private resourceRenderUnsubscribe: (() => void) | null = null

	private static modelContainerCache = new Map<string, Promise<AssetContainer>>()
	private static failedModelSrcs = new Set<string>()
	private static failedModelLogged = new Set<string>()
	private static modelLoadStats = new Map<
		string,
		{ count: number; totalMs: number; lastLogAt: number; lastMs: number }
	>()

	private static async getModelContainer(
		scene: import('@babylonjs/core').Scene,
		modelSrc: string
	): Promise<AssetContainer> {
		const cached = MapObjectView.modelContainerCache.get(modelSrc)
		if (cached) return cached
		const { rootUrl, fileName } = splitAssetUrl(modelSrc)
		const promise = SceneLoader.LoadAssetContainerAsync(rootUrl, fileName, scene)
			.then((container) => {
				container.removeAllFromScene()
				return container
			})
			.catch((error) => {
				MapObjectView.modelContainerCache.delete(modelSrc)
				throw error
			})
		MapObjectView.modelContainerCache.set(modelSrc, promise)
		return promise
	}

	constructor(scene: GameScene, mapObject: MapObject) {
		const tileSize = scene.map?.tileWidth || 32
		const footprint = mapObject.metadata?.footprint
		const width = footprint ? footprint.width * tileSize : tileSize
		const length = footprint ? footprint.height * tileSize : tileSize
		const height = tileSize
		const mesh = scene.runtime.renderer.createBox(`map-object-${mapObject.id}`, { width, length, height })
		const centerX = mapObject.position.x + width / 2
		const centerY = mapObject.position.y + length / 2
		super(scene, mesh, { width, length, height }, { x: centerX, y: centerY })

		MapObjectView.ensureDebugSubscription()
		MapObjectView.debugInstances.add(this)

		this.mapObject = mapObject
		this.isBuilding = Boolean(mapObject.metadata?.buildingId || mapObject.metadata?.buildingInstanceId)
		this.buildingStage = mapObject.metadata?.stage || null

		this.unsubscribe = itemService.subscribeToItemMetadata(mapObject.item.itemType, () => {
			this.applyEmoji()
		})

		if (mapObject.metadata?.resourceNode) {
			this.resourceRenderUnsubscribe = resourceNodeRenderService.subscribe(() => {
				this.applyEmoji()
			})
		}

		this.applyEmoji()
		this.setupCollision()
		this.setupInteraction()
		this.setupHighlightEvents()
		this.setupBuildingEvents()
	}

	private setupCollision(): void {
		const metadata = itemService.getItemType(this.mapObject.item.itemType)
		const blocksMovement = metadata?.placement?.blocksMovement || Boolean(this.mapObject.metadata?.footprint)
		if (!blocksMovement) return
		this.staticRect = this.scene.physics.addStaticRect({
			x: this.mapObject.position.x,
			y: this.mapObject.position.y - this.length,
			width: this.width,
			height: this.length
		})
	}

	private applyEmoji(): void {
		if (this.mapObject.metadata?.resourceNode) {
			const nodeType = this.mapObject.metadata?.resourceNodeType
			const renderConfig = resourceNodeRenderService.getRender(nodeType)
			if (
				renderConfig?.render?.modelSrc &&
				this.modelFailedSrc !== renderConfig.render.modelSrc &&
				!MapObjectView.failedModelSrcs.has(renderConfig.render.modelSrc)
			) {
				this.applyInvisibleBase()
				void this.loadRenderModel(renderConfig.render)
				return
			}
		}

		if (this.isBuilding && this.buildingStage === ConstructionStage.Completed) {
			const buildingId = this.mapObject.metadata?.buildingId
			const definition = buildingId ? buildingService.getBuildingDefinition(buildingId) : null
			if (
				definition?.render?.modelSrc &&
				this.modelFailedSrc !== definition.render.modelSrc &&
				!MapObjectView.failedModelSrcs.has(definition.render.modelSrc)
			) {
				this.applyInvisibleBase()
				void this.loadRenderModel(definition.render)
				return
			}
			if (definition?.icon) {
				this.showBase()
				this.scene.runtime.renderer.applyEmoji(this.getMesh(), definition.icon)
				return
			}
		}

		const metadata = itemService.getItemType(this.mapObject.item.itemType)
		if (metadata?.emoji) {
			this.showBase()
			this.scene.runtime.renderer.applyEmoji(this.getMesh(), metadata.emoji)
		} else {
			this.showBase()
			this.scene.runtime.renderer.applyTint(this.getMesh(), '#888888')
		}
	}

	private async loadRenderModel(render: {
		modelSrc: string
		transform?: {
			rotation?: { x: number; y: number; z: number }
			scale?: { x: number; y: number; z: number }
			elevation?: number
		}
	}): Promise<void> {
		if (!render.modelSrc) return
		if (this.isSceneDisposed()) return
		if (this.modelFailedSrc && this.modelFailedSrc !== render.modelSrc) {
			this.modelFailedSrc = null
		}
		if (this.modelSrc === render.modelSrc && this.modelRoot) {
			this.applyModelTransform(render)
			this.applyInvisibleBase()
			return
		}
		if (MapObjectView.failedModelSrcs.has(render.modelSrc)) {
			return
		}
		if (this.modelLoading) {
			return
		}
		this.disposeModel()
		this.modelSrc = render.modelSrc
		try {
			this.modelLoading = (async () => {
				const loadStart = DEBUG_LOAD_TIMING ? perfNow() : 0
				const scene = this.scene.runtime.renderer.scene
				if (this.isSceneDisposed()) return
				const container = await MapObjectView.getModelContainer(scene, render.modelSrc)
				if (this.isSceneDisposed()) return
				const namePrefix = `map-object-model-${this.mapObject.id}`
				const useInstancing = Boolean(this.mapObject.metadata?.resourceNode)
				const instance = container.instantiateModelsToScene(
					(name) => {
						if (!name) return namePrefix
						return `${namePrefix}-${name}`
					},
					false,
					{ doNotInstantiate: !useInstancing }
				)
				this.modelRoot = new TransformNode(`map-object-model-${this.mapObject.id}`, scene)
				this.modelPivot = new TransformNode(`map-object-model-pivot-${this.mapObject.id}`, scene)
				this.modelPivot.parent = this.modelRoot
				this.modelInstanceRoots = (instance.rootNodes || []) as TransformNode[]
				this.modelInstanceSkeletons = instance.skeletons || []
				this.modelInstanceAnimationGroups = instance.animationGroups || []
				const meshSet = new Set<AbstractMesh>()
				this.modelInstanceRoots.forEach((node) => {
					if (node.parent === null) {
						node.parent = this.modelPivot
					}
					node.setEnabled(true)
					if (node instanceof AbstractMesh) {
						meshSet.add(node)
					}
					if ('getChildMeshes' in node && typeof node.getChildMeshes === 'function') {
						node.getChildMeshes(false).forEach((mesh) => meshSet.add(mesh))
					}
				})
				this.modelMeshes = Array.from(meshSet)
				this.modelMeshes.forEach((mesh) => {
					mesh.isPickable = false
					mesh.isVisible = true
					mesh.visibility = 1
					mesh.setEnabled(true)
					mesh.refreshBoundingInfo()
					mesh.computeWorldMatrix(true)
				})
				if (MapObjectView.debugBoundsEnabled && !this.debugLoggedBounds) {
					const meshInfo = this.modelMeshes.map((mesh) => ({
						name: mesh.name,
						type: mesh.getClassName?.() ?? 'unknown',
						vertices: mesh.getTotalVertices(),
						isVisible: mesh.isVisible
					}))
					console.info('[MapObjectView] Debug model load', {
						id: this.mapObject.id,
						modelSrc: render.modelSrc,
						meshCount: this.modelMeshes.length,
						transformNodeCount: this.modelInstanceRoots.length,
						meshes: meshInfo
					})
					this.debugLoggedBounds = true
				}
				this.centerModel()
				this.modelRoot.parent = this.getMesh()
				this.applyModelTransform(render)
				this.applyInvisibleBase()
				this.applyDebugBounds()
				if (DEBUG_LOAD_TIMING) {
					const elapsed = perfNow() - loadStart
					const stats = MapObjectView.modelLoadStats.get(render.modelSrc) || {
						count: 0,
						totalMs: 0,
						lastLogAt: 0,
						lastMs: 0
					}
					stats.count += 1
					stats.totalMs += elapsed
					stats.lastMs = elapsed
					const now = perfNow()
					const shouldLog =
						stats.count === 1 ||
						stats.count % 100 === 0 ||
						elapsed > 50 ||
						now - stats.lastLogAt > 2000
					if (shouldLog) {
						const avg = stats.totalMs / Math.max(1, stats.count)
						console.info(
							`[Perf] model-load src=${render.modelSrc} count=${stats.count} avg=${avg.toFixed(
								1
							)}ms last=${stats.lastMs.toFixed(1)}ms meshes=${this.modelMeshes.length} nodes=${
								this.modelInstanceRoots.length
							}`
						)
						stats.lastLogAt = now
					}
					MapObjectView.modelLoadStats.set(render.modelSrc, stats)
				}
				this.modelFailedSrc = null
			})()
			await this.modelLoading
		} catch (error) {
			if (isSceneDisposedError(error)) {
				return
			}
			MapObjectView.failedModelSrcs.add(render.modelSrc)
			if (!MapObjectView.failedModelLogged.has(render.modelSrc)) {
				MapObjectView.failedModelLogged.add(render.modelSrc)
				console.warn('[MapObjectView] Failed to load model', render.modelSrc, error)
			}
			this.disposeModel()
			this.modelSrc = null
			this.modelFailedSrc = render.modelSrc
			this.applyEmoji()
		} finally {
			this.modelLoading = null
		}
	}

	private applyModelTransform(render: {
		transform?: {
			rotation?: { x: number; y: number; z: number }
			scale?: { x: number; y: number; z: number }
			elevation?: number
		}
	}): void {
		if (!this.modelRoot) return
		const transform = render.transform || {}
		const rotation = transform.rotation ?? { x: 0, y: 0, z: 0 }
		const scale = transform.scale ?? { x: 1, y: 1, z: 1 }
		const elevation = transform.elevation ?? 0
		const tileSize = this.scene.map?.tileWidth || 32
		this.modelRoot.position = new Vector3(0, -this.height / 2 + elevation * tileSize, 0)
		const instanceRotation = typeof this.mapObject.rotation === 'number' ? this.mapObject.rotation : 0
		this.modelRoot.rotation = new Vector3(rotation.x ?? 0, (rotation.y ?? 0) + instanceRotation, rotation.z ?? 0)
		this.modelRoot.scaling = new Vector3(
			(scale.x ?? 1) * tileSize,
			(scale.y ?? 1) * tileSize,
			(scale.z ?? 1) * tileSize
		)
		if (MapObjectView.debugBoundsEnabled) {
			this.applyDebugBounds()
		}
	}

	private applyInvisibleBase(): void {
		const baseMesh = this.getMesh()
		if (!this.invisibleMaterial) {
			this.invisibleMaterial = new StandardMaterial(`map-object-invisible-${this.mapObject.id}`, baseMesh.getScene())
			this.invisibleMaterial.diffuseColor = Color3.Black()
			this.invisibleMaterial.emissiveColor = Color3.Black()
			this.invisibleMaterial.specularColor = Color3.Black()
			this.invisibleMaterial.alpha = 0
			this.invisibleMaterial.disableDepthWrite = true
		}
		baseMesh.material = this.invisibleMaterial
		baseMesh.visibility = 1
	}

	private showBase(): void {
		this.getMesh().visibility = 1
	}

	private disposeModel(): void {
		if (this.modelMeshes.length > 0) {
			this.modelMeshes.forEach((mesh) => {
				mesh.showBoundingBox = false
			})
		}
		this.modelInstanceAnimationGroups.forEach((group) => group.dispose())
		this.modelInstanceAnimationGroups = []
		this.modelInstanceSkeletons.forEach((skeleton) => skeleton.dispose())
		this.modelInstanceSkeletons = []
		this.modelInstanceRoots.forEach((node) => node.dispose())
		this.modelInstanceRoots = []
		this.modelMeshes = []
		this.modelPivot?.dispose()
		this.modelRoot?.dispose()
		this.modelPivot = null
		this.modelRoot = null
		this.modelSrc = null
		this.modelLoading = null
		if (this.invisibleMaterial) {
			this.invisibleMaterial.dispose()
			this.invisibleMaterial = null
		}
		if (this.debugBoundsMesh) {
			this.debugBoundsMesh.dispose()
			this.debugBoundsMesh = null
		}
		if (this.debugBoundsMaterial) {
			this.debugBoundsMaterial.dispose()
			this.debugBoundsMaterial = null
		}
		if (this.debugRootMesh) {
			this.debugRootMesh.dispose()
			this.debugRootMesh = null
		}
		if (this.debugRootMaterial) {
			this.debugRootMaterial.dispose()
			this.debugRootMaterial = null
		}
		this.debugLoggedNoBounds = false
		this.debugLoggedBounds = false
	}

	private isSceneDisposed(): boolean {
		if (isMeshDisposed(this.getMesh())) return true
		return isSceneDisposed(this.scene.runtime.renderer.scene)
	}

	private centerModel(): void {
		if (!this.modelPivot || this.modelMeshes.length === 0) return
		const bounds = getBounds(this.modelMeshes)
		if (!bounds) return
		const center = bounds.min.add(bounds.max).scale(0.5)
		this.modelPivot.position = new Vector3(-center.x, -bounds.min.y, -center.z)
	}

	private setupInteraction(): void {
		if (!this.isBuilding) return
		this.setPickable(() => this.handleBuildingClick())
	}

	private handleBuildingClick = () => {
		EventBus.emit(UiEvents.Building.Click, {
			buildingInstanceId: this.mapObject.metadata?.buildingInstanceId,
			buildingId: this.mapObject.metadata?.buildingId
		})
	}

	private setupHighlightEvents(): void {
		this.highlightHandler = (data: { buildingInstanceId: string; highlighted: boolean }) => {
			if (!this.isBuilding) return
			if (this.mapObject.metadata?.buildingInstanceId !== data.buildingInstanceId) return
			this.setHighlighted(data.highlighted)
		}
		EventBus.on(UiEvents.Building.Highlight, this.highlightHandler)
	}

	private setupBuildingEvents(): void {
		if (!this.isBuilding) return
		this.progressHandler = (data: { buildingInstanceId: string; progress: number; stage: string }) => {
			if (this.mapObject.metadata?.buildingInstanceId === data.buildingInstanceId) {
				this.buildingStage = data.stage as ConstructionStage
			}
		}
		EventBus.on(Event.Buildings.SC.Progress, this.progressHandler)

		this.completedHandler = (data: { building: any }) => {
			if (this.mapObject.metadata?.buildingInstanceId === data.building.id) {
				this.buildingStage = ConstructionStage.Completed
				this.applyEmoji()
			}
		}
		EventBus.on(Event.Buildings.SC.Completed, this.completedHandler)
	}

	public setHighlighted(highlighted: boolean): void {
		if (this.isHighlighted === highlighted) return
		this.isHighlighted = highlighted
		if (this.modelRoot || this.modelLoading || this.modelSrc) {
			this.applyInvisibleBase()
			return
		}
		this.scene.runtime.renderer.applyTint(this.getMesh(), highlighted ? '#ffeb3b' : '#888888')
		if (!highlighted) {
			this.applyEmoji()
		}
	}

	public update(): void {
		// no-op
	}

	public destroy(): void {
		MapObjectView.debugInstances.delete(this)
		if (this.highlightHandler) {
			EventBus.off(UiEvents.Building.Highlight, this.highlightHandler)
		}
		if (this.progressHandler) {
			EventBus.off(Event.Buildings.SC.Progress, this.progressHandler)
		}
		if (this.completedHandler) {
			EventBus.off(Event.Buildings.SC.Completed, this.completedHandler)
		}
		if (this.staticRect) {
			this.scene.physics.removeStaticRect(this.staticRect)
			this.staticRect = null
		}
		this.disposeModel()
		this.resourceRenderUnsubscribe?.()
		this.unsubscribe?.()
		super.destroy()
	}

	public getMapObject(): MapObject {
		return this.mapObject
	}

	private applyDebugBounds(): void {
		const enabled = MapObjectView.debugBoundsEnabled
		this.getMesh().showBoundingBox = enabled
		this.modelMeshes.forEach((mesh) => {
			mesh.showBoundingBox = enabled
		})
		if (enabled && this.modelRoot) {
			if (!this.debugRootMesh) {
				const scene = this.scene.runtime.renderer.scene
				this.debugRootMesh = MeshBuilder.CreateBox(
					`debug-model-root-${this.mapObject.id}`,
					{ size: 4 },
					scene
				)
				this.debugRootMesh.isPickable = false
				if (!this.debugRootMaterial) {
					this.debugRootMaterial = new StandardMaterial(`debug-model-root-mat-${this.mapObject.id}`, scene)
					this.debugRootMaterial.diffuseColor = new Color3(0.2, 0.9, 0.4)
					this.debugRootMaterial.emissiveColor = new Color3(0.2, 0.9, 0.4)
					this.debugRootMaterial.specularColor = Color3.Black()
					this.debugRootMaterial.wireframe = true
				}
				this.debugRootMesh.material = this.debugRootMaterial
				this.debugRootMesh.parent = this.getMesh()
			}
			this.debugRootMesh.isVisible = true
			this.debugRootMesh.position.copyFrom(this.modelRoot.position)
		} else if (this.debugRootMesh) {
			this.debugRootMesh.isVisible = false
		}
		if (!enabled) {
			if (this.debugBoundsMesh) {
				this.debugBoundsMesh.dispose()
				this.debugBoundsMesh = null
			}
			return
		}

		const bounds = getBounds(this.modelMeshes)
		if (!bounds) {
			if (this.debugBoundsMesh) {
				this.debugBoundsMesh.isVisible = false
			}
			if (!this.debugLoggedNoBounds && this.modelSrc) {
				this.debugLoggedNoBounds = true
				const meshSummary = this.modelMeshes.map((mesh) => ({
					name: mesh.name,
					type: mesh.getClassName?.() ?? 'unknown',
					vertices: mesh.getTotalVertices(),
					isVisible: mesh.isVisible
				}))
				console.info('[MapObjectView] Debug bounds: no mesh bounds', {
					id: this.mapObject.id,
					modelSrc: this.modelSrc,
					meshCount: this.modelMeshes.length,
					meshes: meshSummary
				})
			}
			return
		}

		if (!this.debugBoundsMesh) {
			const scene = this.scene.runtime.renderer.scene
			this.debugBoundsMesh = MeshBuilder.CreateBox(`debug-model-bounds-${this.mapObject.id}`, { size: 1 }, scene)
			this.debugBoundsMesh.isPickable = false
			if (!this.debugBoundsMaterial) {
				this.debugBoundsMaterial = new StandardMaterial(`debug-model-mat-${this.mapObject.id}`, scene)
				this.debugBoundsMaterial.diffuseColor = new Color3(0.9, 0.25, 0.2)
				this.debugBoundsMaterial.emissiveColor = new Color3(0.9, 0.25, 0.2)
				this.debugBoundsMaterial.specularColor = Color3.Black()
				this.debugBoundsMaterial.wireframe = true
			}
			this.debugBoundsMesh.material = this.debugBoundsMaterial
		}

		const size = bounds.max.subtract(bounds.min)
		const center = bounds.min.add(bounds.max).scale(0.5)
		this.debugBoundsMesh.isVisible = true
		this.debugBoundsMesh.position.copyFrom(center)
		this.debugBoundsMesh.scaling.set(size.x || 0.01, size.y || 0.01, size.z || 0.01)
		if (!this.debugLoggedBounds && this.modelSrc) {
			this.debugLoggedBounds = true
			console.info('[MapObjectView] Debug bounds size', {
				id: this.mapObject.id,
				modelSrc: this.modelSrc,
				center: { x: center.x, y: center.y, z: center.z },
				size: { x: size.x, y: size.y, z: size.z }
			})
		}
	}
}

function isSceneDisposedError(error: unknown): boolean {
	if (error instanceof Error) {
		return error.message.includes('Scene has been disposed')
	}
	return false
}

function isSceneDisposed(scene: { isDisposed?: (() => boolean) | boolean } | null): boolean {
	if (!scene) return false
	if (typeof scene.isDisposed === 'function') {
		try {
			return scene.isDisposed()
		} catch {
			return false
		}
	}
	if (typeof scene.isDisposed === 'boolean') {
		return scene.isDisposed
	}
	return false
}

function isMeshDisposed(mesh: { isDisposed?: (() => boolean) | boolean } | null): boolean {
	if (!mesh) return false
	if (typeof mesh.isDisposed === 'function') {
		try {
			return mesh.isDisposed()
		} catch {
			return false
		}
	}
	if (typeof mesh.isDisposed === 'boolean') {
		return mesh.isDisposed
	}
	return false
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
