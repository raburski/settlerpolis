import { BaseEntityView } from '../BaseEntityView'
import { itemService } from '../../services/ItemService'
import { itemRenderService } from '../../services/ItemRenderService'
import type { GameScene } from '../../scenes/base/GameScene'
import {
	AbstractMesh,
	AnimationGroup,
	AssetContainer,
	Color3,
	SceneLoader,
	Skeleton,
	StandardMaterial,
	TransformNode,
	Vector3
} from '@babylonjs/core'
import '@babylonjs/loaders'

export class LootView extends BaseEntityView {
	private itemType: string
	private itemId: string
	private unsubscribe: (() => void) | null = null
	private renderUnsubscribe: (() => void) | null = null
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

	private static modelContainerCache = new Map<string, Promise<AssetContainer>>()
	private static failedModelSrcs = new Set<string>()
	private static failedModelLogged = new Set<string>()

	private static async getModelContainer(
		scene: import('@babylonjs/core').Scene,
		modelSrc: string
	): Promise<AssetContainer> {
		const cached = LootView.modelContainerCache.get(modelSrc)
		if (cached) return cached
		const { rootUrl, fileName } = splitAssetUrl(modelSrc)
		const promise = SceneLoader.LoadAssetContainerAsync(rootUrl, fileName, scene)
			.then((container) => {
				container.removeAllFromScene()
				return container
			})
			.catch((error) => {
				LootView.modelContainerCache.delete(modelSrc)
				throw error
			})
		LootView.modelContainerCache.set(modelSrc, promise)
		return promise
	}

	constructor(scene: GameScene, x: number, y: number, itemType: string, itemId: string, quantity: number = 1) {
		const size = { width: 16, length: 16, height: 16 }
		const mesh = scene.runtime.renderer.createBox(`loot-${itemType}-${x}-${y}`, size)
		super(scene, mesh, size, { x, y })
		this.itemType = itemType
		this.itemId = itemId
		this.setupItemDisplay()
	}

	private setupItemDisplay() {
		this.unsubscribe = itemService.subscribeToItemMetadata(this.itemType, () => {
			this.applyRender()
		})
		this.renderUnsubscribe = itemRenderService.subscribe(() => {
			this.applyRender()
		})
		this.applyRender()
	}

	private applyRender(): void {
		const render = itemRenderService.getRenderModel(this.itemType, this.itemId)
		if (
			render?.modelSrc &&
			this.modelFailedSrc !== render.modelSrc &&
			!LootView.failedModelSrcs.has(render.modelSrc)
		) {
			this.applyInvisibleBase()
			void this.loadRenderModel(render)
			return
		}

		this.disposeModel()
		const metadata = itemService.getItemType(this.itemType)
		if (metadata?.emoji) {
			this.showBase()
			this.scene.runtime.renderer.applyEmoji(this.getMesh(), metadata.emoji)
		} else {
			this.showBase()
			this.scene.runtime.renderer.applyTint(this.getMesh(), '#ffffff')
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
		if (LootView.failedModelSrcs.has(render.modelSrc)) {
			return
		}
		if (this.modelLoading) {
			return
		}
		this.disposeModel()
		this.modelSrc = render.modelSrc
		try {
			this.modelLoading = (async () => {
				const scene = this.scene.runtime.renderer.scene
				if (this.isSceneDisposed()) return
				const container = await LootView.getModelContainer(scene, render.modelSrc)
				if (this.isSceneDisposed()) return
				const namePrefix = `loot-model-${this.itemId}`
				const instance = container.instantiateModelsToScene(
					(name) => (name ? `${namePrefix}-${name}` : namePrefix),
					false
				)
				this.modelRoot = new TransformNode(`loot-model-${this.itemId}`, scene)
				this.modelPivot = new TransformNode(`loot-model-pivot-${this.itemId}`, scene)
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
				this.centerModel()
				this.modelRoot.parent = this.getMesh()
				this.applyModelTransform(render)
				this.applyInvisibleBase()
			})()
			await this.modelLoading
		} catch (error) {
			LootView.failedModelSrcs.add(render.modelSrc)
			if (!LootView.failedModelLogged.has(render.modelSrc)) {
				LootView.failedModelLogged.add(render.modelSrc)
				console.warn('[LootView] Failed to load model', render.modelSrc, error)
			}
			this.disposeModel()
			this.modelSrc = null
			this.modelFailedSrc = render.modelSrc
			this.applyRender()
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
		this.modelRoot.rotation = new Vector3(rotation.x ?? 0, rotation.y ?? 0, rotation.z ?? 0)
		this.modelRoot.scaling = new Vector3(
			(scale.x ?? 1) * tileSize,
			(scale.y ?? 1) * tileSize,
			(scale.z ?? 1) * tileSize
		)
	}

	private centerModel(): void {
		if (!this.modelPivot || this.modelMeshes.length === 0) return
		const bounds = getBounds(this.modelMeshes)
		if (!bounds) return
		const center = bounds.min.add(bounds.max).scale(0.5)
		this.modelPivot.position = new Vector3(-center.x, -bounds.min.y, -center.z)
	}

	private applyInvisibleBase(): void {
		const baseMesh = this.getMesh()
		if (!this.invisibleMaterial) {
			this.invisibleMaterial = new StandardMaterial(`loot-invisible-${this.itemId}`, baseMesh.getScene())
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
		this.modelInstanceAnimationGroups.forEach((group) => group.dispose())
		this.modelInstanceAnimationGroups = []
		this.modelInstanceSkeletons.forEach((skeleton) => skeleton.dispose())
		this.modelInstanceSkeletons = []
		this.modelInstanceRoots.forEach((node) => node.dispose())
		this.modelInstanceRoots = []
		this.modelMeshes = []
		if (this.modelPivot) {
			this.modelPivot.dispose()
			this.modelPivot = null
		}
		if (this.modelRoot) {
			this.modelRoot.dispose()
			this.modelRoot = null
		}
	}

	private isSceneDisposed(): boolean {
		const scene = this.scene.runtime.renderer.scene
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

	public setInteractive(callback: () => void) {
		this.setPickable(callback)
	}

	public setQuantity(quantity: number) {
			}

	public destroy() {
		this.unsubscribe?.()
		this.renderUnsubscribe?.()
		this.disposeModel()
		super.destroy()
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
