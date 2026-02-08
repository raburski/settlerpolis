import { BaseEntityView } from '../BaseEntityView'
import type { GameScene } from '../../scenes/base/GameScene'
import type { MapObject, BuildingDefinition } from '@rugged/game'
import { ConstructionStage } from '@rugged/game'
import { itemService } from '../../services/ItemService'
import { buildingService } from '../../services/BuildingService'
import { resourceNodeRenderService } from '../../services/ResourceNodeRenderService'
import { itemRenderService } from '../../services/ItemRenderService'
import { EventBus } from '../../EventBus'
import { UiEvents } from '../../uiEvents'
import { Event } from '@rugged/game'
import { rotateVec3 } from '../../../shared/transform'
import {
	AbstractMesh,
	AnimationGroup,
	AssetContainer,
	Color3,
	DynamicTexture,
	Mesh,
	MeshBuilder,
	SceneLoader,
	Skeleton,
	StandardMaterial,
	TransformNode,
	Vector3
} from '@babylonjs/core'
import type { Scene } from '@babylonjs/core'
import '@babylonjs/loaders'

const DEBUG_LOAD_TIMING = String(import.meta.env.VITE_DEBUG_LOAD_TIMING || '').toLowerCase() === 'true'
const perfNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
const BUILDING_HIGHLIGHT_TINT = '#fff9c4'
const BUILDING_HIGHLIGHT_EMISSIVE = new Color3(0.9, 0.85, 0.5)
const BUILDING_HIGHLIGHT_ALPHA = 0.35

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
	private highlightMaterial: StandardMaterial | null = null
	private debugBoundsMesh: Mesh | null = null
	private debugBoundsMaterial: StandardMaterial | null = null
	private debugRootMesh: Mesh | null = null
	private debugRootMaterial: StandardMaterial | null = null
	private debugLoggedNoBounds: boolean = false
	private debugLoggedBounds: boolean = false
	private resourceRenderUnsubscribe: (() => void) | null = null
	private itemRenderUnsubscribe: (() => void) | null = null
	private constructionRoot: TransformNode | null = null
	private constructionMeshes: AbstractMesh[] = []

	private static modelContainerCache = new Map<string, Promise<AssetContainer>>()
	private static failedModelSrcs = new Set<string>()
	private static failedModelLogged = new Set<string>()
	private static modelLoadStats = new Map<
		string,
		{ count: number; totalMs: number; lastLogAt: number; lastMs: number }
	>()
	private static constructionMaterialCache = new WeakMap<Scene, ConstructionMaterialSet>()

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
		this.itemRenderUnsubscribe = itemRenderService.subscribe(() => {
			this.applyEmoji()
		})

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
		const isConstruction = this.isBuilding && this.buildingStage !== ConstructionStage.Completed
		if (isConstruction) {
			this.disposeModel()
			this.applyConstructionPlaceholder()
			return
		}
		this.disposeConstructionPlaceholder(true)

		if (this.mapObject.metadata?.resourceNode) {
			const nodeType = this.mapObject.metadata?.resourceNodeType
			const renderConfig = resourceNodeRenderService.getRenderModel(nodeType, this.mapObject.id)
			if (
				renderConfig?.modelSrc &&
				this.modelFailedSrc !== renderConfig.modelSrc &&
				!MapObjectView.failedModelSrcs.has(renderConfig.modelSrc)
			) {
				this.applyInvisibleBase()
				void this.loadRenderModel(renderConfig)
				return
			}
		}

		if (this.isBuilding && this.buildingStage === ConstructionStage.Completed) {
			const buildingId = this.mapObject.metadata?.buildingId
			const definition = buildingId ? buildingService.getBuildingDefinition(buildingId) : null
			const renderConfig = resolveBuildingRender(definition, this.mapObject.id)
			if (
				renderConfig?.modelSrc &&
				this.modelFailedSrc !== renderConfig.modelSrc &&
				!MapObjectView.failedModelSrcs.has(renderConfig.modelSrc)
			) {
				this.applyInvisibleBase()
				void this.loadRenderModel(renderConfig)
				return
			}
			if (definition?.icon) {
				this.showBase()
				this.scene.runtime.renderer.applyEmoji(this.getMesh(), definition.icon)
				return
			}
		}

		const itemRender = itemRenderService.getRenderModel(this.mapObject.item.itemType, this.mapObject.id)
		if (
			itemRender?.modelSrc &&
			this.modelFailedSrc !== itemRender.modelSrc &&
			!MapObjectView.failedModelSrcs.has(itemRender.modelSrc)
		) {
			this.applyInvisibleBase()
			void this.loadRenderModel(itemRender)
			return
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
			offset?: { x: number; y: number; z: number }
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
			offset?: { x: number; y: number; z: number }
		}
	}): void {
		if (!this.modelRoot) return
		const transform = render.transform || {}
		const rotation = transform.rotation ?? { x: 0, y: 0, z: 0 }
		const scale = transform.scale ?? { x: 1, y: 1, z: 1 }
		const elevation = transform.elevation ?? 0
		const offset = transform.offset ?? { x: 0, y: 0, z: 0 }
		const tileSize = this.scene.map?.tileWidth || 32
		const instanceRotation = typeof this.mapObject.rotation === 'number' ? this.mapObject.rotation : 0
		const finalRotation = {
			x: rotation.x ?? 0,
			y: (rotation.y ?? 0) + instanceRotation,
			z: rotation.z ?? 0
		}
		const rotatedOffset = rotateVec3(offset, finalRotation)
		this.modelRoot.position = new Vector3(
			rotatedOffset.x * tileSize,
			-this.height / 2 + (elevation + rotatedOffset.y) * tileSize,
			rotatedOffset.z * tileSize
		)
		this.modelRoot.rotation = new Vector3(finalRotation.x, finalRotation.y, finalRotation.z)
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

	private applyHighlightBase(): void {
		const baseMesh = this.getMesh()
		if (!this.highlightMaterial) {
			this.highlightMaterial = new StandardMaterial(`map-object-highlight-${this.mapObject.id}`, baseMesh.getScene())
			this.highlightMaterial.diffuseColor = Color3.FromHexString(BUILDING_HIGHLIGHT_TINT)
			this.highlightMaterial.emissiveColor = BUILDING_HIGHLIGHT_EMISSIVE
			this.highlightMaterial.specularColor = Color3.Black()
			this.highlightMaterial.alpha = BUILDING_HIGHLIGHT_ALPHA
			this.highlightMaterial.disableDepthWrite = true
		}
		baseMesh.material = this.highlightMaterial
		baseMesh.visibility = 1
	}

	private showBase(): void {
		this.getMesh().visibility = 1
	}

	private applyConstructionPlaceholder(): void {
		if (this.constructionRoot) {
			this.applyInvisibleBase()
			return
		}
		const scene = this.scene.runtime.renderer.scene
		const tileSize = this.scene.map?.tileWidth || 32
		const groundOffset = -this.height / 2
		const patchHeight = Math.max(0.08 * tileSize, 1)
		const patchInset = tileSize * 0.18
		const patchWidth = Math.max(tileSize * 0.6, this.width - patchInset * 2)
		const patchLength = Math.max(tileSize * 0.6, this.length - patchInset * 2)
		const patchY = groundOffset + patchHeight / 2 + tileSize * 0.02

		const materials = this.getConstructionMaterials()
		const root = new TransformNode(`construction-root-${this.mapObject.id}`, scene)
		root.parent = this.getMesh()
		this.constructionRoot = root

		const patch = MeshBuilder.CreateBox(
			`construction-patch-${this.mapObject.id}`,
			{ width: patchWidth, height: patchHeight, depth: patchLength },
			scene
		)
		patch.material = materials.ground
		patch.isPickable = false
		patch.parent = root
		patch.position.set(0, patchY, 0)
		this.constructionMeshes.push(patch)

		const poleRadius = tileSize * 0.05
		const poleHeight = tileSize * 0.385
		const poleInset = poleRadius * 1.4 + tileSize * 0.04
		const innerWidth = Math.max(0, patchWidth - poleInset * 2)
		const innerLength = Math.max(0, patchLength - poleInset * 2)
		const leftX = -innerWidth / 2
		const rightX = innerWidth / 2
		const topZ = -innerLength / 2
		const bottomZ = innerLength / 2
		const poleY = groundOffset + patchHeight + poleHeight / 2 + tileSize * 0.02

		const poleBase = MeshBuilder.CreateCylinder(
			`construction-pole-base-${this.mapObject.id}`,
			{ height: poleHeight, diameter: poleRadius * 2, tessellation: 8 },
			scene
		)
		poleBase.isVisible = false
		poleBase.isPickable = false
		poleBase.material = materials.pole
		this.constructionMeshes.push(poleBase)

		const rng = createSeededRandom(hashSeed(`${this.mapObject.id}-construction`))
		const placePole = (x: number, z: number) => {
			const instance = poleBase.createInstance(
				`construction-pole-${this.mapObject.id}-${this.constructionMeshes.length}`
			)
			instance.parent = root
			instance.isPickable = false
			instance.position.set(
				x + (rng() - 0.5) * tileSize * 0.06,
				poleY + (rng() - 0.5) * tileSize * 0.02,
				z + (rng() - 0.5) * tileSize * 0.06
			)
			const heightScale = 0.85 + rng() * 0.3
			instance.scaling.y = heightScale
			instance.rotation.y = (rng() - 0.5) * 0.6
			instance.rotation.x = (rng() - 0.5) * 0.08
			instance.rotation.z = (rng() - 0.5) * 0.08
			this.constructionMeshes.push(instance)
		}

		const poleSpacing = tileSize * 0.55
		const countW = innerWidth < poleSpacing ? 1 : Math.max(2, Math.floor(innerWidth / poleSpacing) + 1)
		const countL = innerLength < poleSpacing ? 1 : Math.max(2, Math.floor(innerLength / poleSpacing) + 1)

		for (let i = 0; i < countW; i += 1) {
			const t = countW === 1 ? 0.5 : i / (countW - 1)
			const x = leftX + (rightX - leftX) * t
			placePole(x, topZ)
			placePole(x, bottomZ)
		}

		if (countL > 1) {
			for (let i = 1; i < countL - 1; i += 1) {
				const t = countL === 1 ? 0.5 : i / (countL - 1)
				const z = topZ + (bottomZ - topZ) * t
				placePole(leftX, z)
				placePole(rightX, z)
			}
		}

		this.applyInvisibleBase()
	}

	private disposeConstructionPlaceholder(disposeRoot: boolean): void {
		if (!this.constructionRoot) return
		if (disposeRoot) {
			for (let i = this.constructionMeshes.length - 1; i >= 0; i -= 1) {
				this.constructionMeshes[i].dispose()
			}
			this.constructionMeshes = []
			this.constructionRoot.dispose()
			this.constructionRoot = null
			return
		}
	}

	private getConstructionMaterials(): ConstructionMaterialSet {
		const scene = this.scene.runtime.renderer.scene
		const cached = MapObjectView.constructionMaterialCache.get(scene)
		if (cached) return cached

		const groundTexture = createConstructionTexture(scene, `construction-ground-${this.mapObject.id}`, 192)
		const groundMaterial = new StandardMaterial(`construction-ground-mat-${this.mapObject.id}`, scene)
		groundMaterial.diffuseTexture = groundTexture
		groundMaterial.specularColor = Color3.Black()
		groundMaterial.emissiveColor = new Color3(0.08, 0.06, 0.04)

		const poleMaterial = new StandardMaterial(`construction-pole-mat-${this.mapObject.id}`, scene)
		poleMaterial.diffuseColor = new Color3(0.52, 0.33, 0.18)
		poleMaterial.emissiveColor = new Color3(0.15, 0.09, 0.04)
		poleMaterial.specularColor = new Color3(0.1, 0.08, 0.06)

		const materials = { ground: groundMaterial, pole: poleMaterial }
		MapObjectView.constructionMaterialCache.set(scene, materials)
		return materials
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
			if (highlighted) {
				this.applyHighlightBase()
			} else {
				this.applyInvisibleBase()
			}
			return
		}
		if (this.constructionRoot) {
			this.scene.runtime.renderer.applyTint(this.getMesh(), highlighted ? BUILDING_HIGHLIGHT_TINT : '#888888')
			this.getMesh().visibility = highlighted ? 0.35 : 0
			if (!highlighted) {
				this.applyEmoji()
			}
			return
		}
		this.scene.runtime.renderer.applyTint(this.getMesh(), highlighted ? BUILDING_HIGHLIGHT_TINT : '#888888')
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
		this.disposeConstructionPlaceholder(true)
		this.disposeModel()
		if (this.highlightMaterial) {
			this.highlightMaterial.dispose()
			this.highlightMaterial = null
		}
		this.resourceRenderUnsubscribe?.()
		this.itemRenderUnsubscribe?.()
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

type BuildingRenderModel = {
	modelSrc: string
	transform?: {
		rotation?: { x: number; y: number; z: number }
		scale?: { x: number; y: number; z: number }
		elevation?: number
		offset?: { x: number; y: number; z: number }
	}
	weight?: number
}

function resolveBuildingRender(
	definition: BuildingDefinition | null,
	seedKey?: string | number
): BuildingRenderModel | null {
	if (!definition) return null
	const variants = Array.isArray(definition.renders)
		? definition.renders.filter((entry) => Boolean(entry?.modelSrc))
		: []
	if (variants.length > 0) {
		if (variants.length === 1) {
			return variants[0]
		}
		const weights = variants.map((entry) => normalizeWeight(entry.weight))
		const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
		if (totalWeight <= 0) {
			return variants[0]
		}
		const target = getSeededFraction(seedKey) * totalWeight
		let cursor = 0
		for (let i = 0; i < variants.length; i += 1) {
			cursor += weights[i]
			if (target <= cursor) {
				return variants[i]
			}
		}
		return variants[variants.length - 1]
	}
	if (definition.render?.modelSrc) {
		return definition.render
	}
	return null
}

function normalizeWeight(weight?: number): number {
	if (typeof weight !== 'number' || !Number.isFinite(weight)) return 1
	if (weight <= 0) return 0
	return weight
}

function getSeededFraction(seedKey?: string | number): number {
	if (seedKey === undefined || seedKey === null) {
		return Math.random()
	}
	const seed = typeof seedKey === 'string' ? seedKey : String(seedKey)
	const hash = fnv1a(seed)
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

interface ConstructionMaterialSet {
	ground: StandardMaterial
	pole: StandardMaterial
}

function createConstructionTexture(scene: Scene, name: string, size: number): DynamicTexture {
	const texture = new DynamicTexture(name, { width: size, height: size }, scene, true)
	const context = texture.getContext()
	context.fillStyle = '#7a4f2f'
	context.fillRect(0, 0, size, size)
	context.globalAlpha = 0.15
	context.fillStyle = '#6a4329'
	for (let i = 0; i < size * 1.2; i += 1) {
		const x = Math.random() * size
		const y = Math.random() * size
		const r = 2 + Math.random() * 4
		context.beginPath()
		context.arc(x, y, r, 0, Math.PI * 2)
		context.fill()
	}
	context.globalAlpha = 0.2
	context.fillStyle = '#8c5c34'
	for (let i = 0; i < size * 0.8; i += 1) {
		const x = Math.random() * size
		const y = Math.random() * size
		const w = 1 + Math.random() * 3
		const h = 1 + Math.random() * 3
		context.fillRect(x, y, w, h)
	}
	context.globalAlpha = 1
	texture.update()
	return texture
}

function hashSeed(value: string): number {
	let hash = 2166136261
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i)
		hash = Math.imul(hash, 16777619)
	}
	return hash >>> 0
}

function createSeededRandom(seed: number): () => number {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}
