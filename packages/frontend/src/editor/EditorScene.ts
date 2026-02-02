import {
	AbstractMesh,
	ArcRotateCamera,
	Color3,
	Color4,
	Engine,
	HemisphericLight,
	LinesMesh,
	Mesh,
	MeshBuilder,
	PointerEventTypes,
	Scene,
	SceneLoader,
	StandardMaterial,
	TransformNode,
	Vector3
} from '@babylonjs/core'
import '@babylonjs/loaders'

export interface StorageSlot {
	itemType: string
	offset: { x: number; y: number }
	hidden?: boolean
	maxQuantity?: number
}

export interface EditorPlacement {
	footprint: { width: number; length: number }
	position: { x: number; y: number }
	rotation: { x: number; y: number; z: number }
	scale: { x: number; y: number; z: number }
	elevation: number
	storageSlots: StorageSlot[]
	entryPoint?: { x: number; y: number } | null
	centerPoint?: { x: number; y: number } | null
}

export type GridPickHandler = (position: { x: number; y: number }) => void

const TILE_SIZE = 1
const DEFAULT_GRID_SIZE = 12

export class EditorScene {
	public readonly engine: Engine
	public readonly scene: Scene
	public readonly camera: ArcRotateCamera
	private readonly cameraTarget = new Vector3(0, 0, 0)
	private grid: LinesMesh | null = null
	private ground: Mesh | null = null
	private groundMaterial: StandardMaterial | null = null
	private footprint: LinesMesh | null = null
	private gridSize = DEFAULT_GRID_SIZE
	private orthoScale = 0.028
	private assetTransform: TransformNode | null = null
	private assetPivot: TransformNode | null = null
	private assetMeshes: AbstractMesh[] = []
	private pickHandler: GridPickHandler | null = null
	private lastPlacement: EditorPlacement | null = null
	private lastFootprint: { width: number; length: number } | null = null
	private storageSlotMeshes: Mesh[] = []
	private storageSlotMaterials: Map<string, StandardMaterial> = new Map()
	private entryMarker: Mesh | null = null
	private centerMarker: Mesh | null = null
	private entryMaterial: StandardMaterial | null = null
	private centerMaterial: StandardMaterial | null = null

	constructor(canvas: HTMLCanvasElement) {
		this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true })
		this.scene = new Scene(this.engine)
		this.scene.clearColor = new Color4(0.05, 0.06, 0.08, 1)

		this.camera = new ArcRotateCamera(
			'editor-camera',
			Math.PI / 4,
			Math.PI / 3,
			30,
			this.cameraTarget,
			this.scene
		)
		this.scene.activeCamera = this.camera
		this.camera.attachControl(canvas, true)
		this.camera.inputs.removeByType('ArcRotateCameraPointersInput')
		this.camera.mode = ArcRotateCamera.ORTHOGRAPHIC_CAMERA
		this.camera.wheelDeltaPercentage = 0.01
		this.camera.minZ = 0.1
		this.camera.maxZ = 2000
		this.updateCameraOrtho()

		const light = new HemisphericLight('editor-light', new Vector3(0.2, 1, 0.3), this.scene)
		light.intensity = 0.85

		this.createGrid()
		this.createFootprint({ width: 2, length: 2 }, { x: 0, y: 0 })
		this.setCameraTargetToGrid()

		this.scene.onPointerObservable.add((pointerInfo) => {
			if (pointerInfo.type !== PointerEventTypes.POINTERDOWN) return
			const pick = pointerInfo.pickInfo
			if (!pick?.hit || pick.pickedMesh !== this.ground || !pick.pickedPoint) return
			const snappedX = Math.floor(pick.pickedPoint.x / TILE_SIZE)
			const snappedY = Math.floor(pick.pickedPoint.z / TILE_SIZE)
			this.pickHandler?.({ x: snappedX, y: snappedY })
		})

		this.engine.runRenderLoop(() => {
			this.scene.render()
		})
		window.addEventListener('resize', this.handleResize)
	}

	dispose(): void {
		window.removeEventListener('resize', this.handleResize)
		this.engine.stopRenderLoop()
		this.disposeAsset()
		this.storageSlotMeshes.forEach((mesh) => mesh.dispose())
		this.storageSlotMeshes = []
		this.storageSlotMaterials.forEach((material) => material.dispose())
		this.storageSlotMaterials.clear()
		this.entryMarker?.dispose()
		this.centerMarker?.dispose()
		this.entryMarker = null
		this.centerMarker = null
		if (this.entryMaterial) {
			this.entryMaterial.dispose()
			this.entryMaterial = null
		}
		if (this.centerMaterial) {
			this.centerMaterial.dispose()
			this.centerMaterial = null
		}
		this.grid?.dispose()
		this.footprint?.dispose()
		this.ground?.dispose()
		this.scene.dispose()
		this.engine.dispose()
	}

	setPickHandler(handler: GridPickHandler | null): void {
		this.pickHandler = handler
	}

	updatePlacement(placement: EditorPlacement): void {
		this.lastPlacement = placement
		this.ensureFootprint(placement.footprint, placement.position)
		const centerX = (placement.position.x + placement.footprint.width / 2) * TILE_SIZE
		const centerZ = (placement.position.y + placement.footprint.length / 2) * TILE_SIZE
		if (this.footprint) {
			this.footprint.position.set(centerX, 0.02, centerZ)
		}
		if (this.assetTransform) {
			this.assetTransform.position.set(centerX, placement.elevation, centerZ)
			this.assetTransform.rotation.set(
				placement.rotation.x,
				placement.rotation.y,
				placement.rotation.z
			)
			this.assetTransform.scaling.set(
				placement.scale.x,
				placement.scale.y,
				placement.scale.z
			)
		}
		this.updateStorageSlots(placement.storageSlots, placement.position)
		this.updateAccessPoints(placement.entryPoint ?? null, placement.centerPoint ?? null, placement.position)
	}

	async loadAsset(url: string): Promise<void> {
		this.disposeAsset()
		if (!url) return
		const { rootUrl, fileName } = splitAssetUrl(url)
		const result = await SceneLoader.ImportMeshAsync('', rootUrl, fileName, this.scene)
		this.assetTransform = new TransformNode('asset-transform', this.scene)
		this.assetPivot = new TransformNode('asset-pivot', this.scene)
		this.assetPivot.parent = this.assetTransform

		this.assetMeshes = result.meshes
		this.assetMeshes.forEach((mesh) => {
			if (mesh.parent === null) {
				mesh.parent = this.assetPivot
			}
			mesh.isPickable = false
		})

		this.centerAsset()
		if (this.lastPlacement) {
			this.updatePlacement(this.lastPlacement)
		}
	}

	private handleResize = () => {
		this.engine.resize()
		this.updateCameraOrtho()
	}

	private updateCameraOrtho(): void {
		const renderWidth = this.engine.getRenderWidth()
		const renderHeight = this.engine.getRenderHeight()
		const halfWidth = (renderWidth / 2) * this.orthoScale
		const halfHeight = (renderHeight / 2) * this.orthoScale
		this.camera.orthoLeft = -halfWidth
		this.camera.orthoRight = halfWidth
		this.camera.orthoTop = halfHeight
		this.camera.orthoBottom = -halfHeight
	}

	private createGrid(): void {
		this.grid?.dispose()
		this.ground?.dispose()

		const size = this.gridSize * TILE_SIZE
		this.ground = MeshBuilder.CreateGround('editor-ground', { width: size, height: size }, this.scene)
		this.ground.position.set(size / 2, 0, size / 2)
		this.ground.isPickable = true
		if (!this.groundMaterial) {
			this.groundMaterial = new StandardMaterial('editor-ground-mat', this.scene)
			this.groundMaterial.diffuseColor = new Color3(0.12, 0.14, 0.17)
			this.groundMaterial.emissiveColor = new Color3(0.05, 0.06, 0.08)
			this.groundMaterial.specularColor = Color3.Black()
		}
		this.ground.material = this.groundMaterial

		const lines: Vector3[][] = []
		for (let i = 0; i <= this.gridSize; i += 1) {
			const offset = i * TILE_SIZE
			lines.push([new Vector3(0, 0.01, offset), new Vector3(size, 0.01, offset)])
			lines.push([new Vector3(offset, 0.01, 0), new Vector3(offset, 0.01, size)])
		}
		this.grid = MeshBuilder.CreateLineSystem('editor-grid', { lines }, this.scene)
		this.grid.color = new Color3(0.18, 0.24, 0.3)
		this.grid.isPickable = false
	}

	private createFootprint(
		footprint: { width: number; length: number },
		position: { x: number; y: number }
	): void {
		this.footprint?.dispose()
		this.lastFootprint = { ...footprint }
		const width = Math.max(footprint.width, 1) * TILE_SIZE
		const height = Math.max(footprint.length, 1) * TILE_SIZE
		const halfWidth = width / 2
		const halfHeight = height / 2
		const lines: Vector3[][] = []
		for (let i = 0; i <= footprint.width; i += 1) {
			const offset = -halfWidth + i * TILE_SIZE
			lines.push([
				new Vector3(offset, 0.03, -halfHeight),
				new Vector3(offset, 0.03, halfHeight)
			])
		}
		for (let i = 0; i <= footprint.length; i += 1) {
			const offset = -halfHeight + i * TILE_SIZE
			lines.push([
				new Vector3(-halfWidth, 0.03, offset),
				new Vector3(halfWidth, 0.03, offset)
			])
		}
		this.footprint = MeshBuilder.CreateLineSystem('editor-footprint', { lines }, this.scene)
		this.footprint.color = new Color3(0.3, 0.85, 0.75)
		this.footprint.isPickable = false
		const centerX = (position.x + footprint.width / 2) * TILE_SIZE
		const centerZ = (position.y + footprint.length / 2) * TILE_SIZE
		this.footprint.position.set(centerX, 0.02, centerZ)
	}

	private ensureFootprint(footprint: { width: number; length: number }, position: { x: number; y: number }) {
		if (
			!this.lastFootprint ||
			this.lastFootprint.width !== footprint.width ||
			this.lastFootprint.length !== footprint.length
		) {
			this.lastFootprint = { ...footprint }
			this.createFootprint(footprint, position)
			return
		}
	}

	private disposeAsset(): void {
		if (this.assetMeshes.length > 0) {
			this.assetMeshes.forEach((mesh) => mesh.dispose(false, true))
		}
		this.assetMeshes = []
		this.assetPivot?.dispose()
		this.assetTransform?.dispose()
		this.assetPivot = null
		this.assetTransform = null
	}

	private updateStorageSlots(slots: StorageSlot[], origin: { x: number; y: number }): void {
		this.storageSlotMeshes.forEach((mesh) => mesh.dispose())
		this.storageSlotMeshes = []
		if (!slots || slots.length === 0) return
		slots.forEach((slot, index) => {
			const mesh = MeshBuilder.CreateBox(
				`editor-storage-slot-${index}`,
				{ width: 0.75, height: 0.18, depth: 0.75 },
				this.scene
			)
			const centerX = (origin.x + slot.offset.x + 0.5) * TILE_SIZE
			const centerZ = (origin.y + slot.offset.y + 0.5) * TILE_SIZE
			mesh.position.set(centerX, 0.12, centerZ)
			mesh.isPickable = false
			mesh.material = this.getSlotMaterial(slot.itemType || 'slot', Boolean(slot.hidden))
			this.storageSlotMeshes.push(mesh)
		})
	}

	private updateAccessPoints(
		entryPoint: { x: number; y: number } | null,
		centerPoint: { x: number; y: number } | null,
		origin: { x: number; y: number }
	): void {
		if (entryPoint) {
			if (!this.entryMarker) {
				this.entryMarker = MeshBuilder.CreateBox('editor-entry-point', { width: 0.35, height: 0.2, depth: 0.35 }, this.scene)
				this.entryMarker.isPickable = false
			}
			if (!this.entryMaterial) {
				this.entryMaterial = new StandardMaterial('editor-entry-material', this.scene)
				this.entryMaterial.diffuseColor = new Color3(0.2, 0.9, 0.6)
				this.entryMaterial.emissiveColor = new Color3(0.08, 0.3, 0.2)
				this.entryMaterial.specularColor = Color3.Black()
			}
			this.entryMarker.material = this.entryMaterial
			this.entryMarker.isVisible = true
			const centerX = (origin.x + entryPoint.x) * TILE_SIZE
			const centerZ = (origin.y + entryPoint.y) * TILE_SIZE
			this.entryMarker.position.set(centerX, 0.16, centerZ)
		} else if (this.entryMarker) {
			this.entryMarker.isVisible = false
		}

		if (centerPoint) {
			if (!this.centerMarker) {
				this.centerMarker = MeshBuilder.CreateBox('editor-center-point', { width: 0.42, height: 0.22, depth: 0.42 }, this.scene)
				this.centerMarker.isPickable = false
			}
			if (!this.centerMaterial) {
				this.centerMaterial = new StandardMaterial('editor-center-material', this.scene)
				this.centerMaterial.diffuseColor = new Color3(0.95, 0.78, 0.2)
				this.centerMaterial.emissiveColor = new Color3(0.3, 0.2, 0.05)
				this.centerMaterial.specularColor = Color3.Black()
			}
			this.centerMarker.material = this.centerMaterial
			this.centerMarker.isVisible = true
			const centerX = (origin.x + centerPoint.x) * TILE_SIZE
			const centerZ = (origin.y + centerPoint.y) * TILE_SIZE
			this.centerMarker.position.set(centerX, 0.14, centerZ)
		} else if (this.centerMarker) {
			this.centerMarker.isVisible = false
		}
	}

	private getSlotMaterial(itemType: string, hidden: boolean): StandardMaterial {
		const key = `${itemType}:${hidden ? 'hidden' : 'visible'}`
		const cached = this.storageSlotMaterials.get(key)
		if (cached) return cached
		const material = new StandardMaterial(`editor-storage-slot-${key}`, this.scene)
		const hue = stringToHue(itemType)
		const base = Color3.FromHSV(hue, 0.65, 0.95)
		material.diffuseColor = base
		material.emissiveColor = base.scale(0.35)
		material.specularColor = Color3.Black()
		material.alpha = hidden ? 0.35 : 0.85
		this.storageSlotMaterials.set(key, material)
		return material
	}

	private centerAsset(): void {
		if (!this.assetPivot || this.assetMeshes.length === 0) return
		const bounds = getBounds(this.assetMeshes)
		if (!bounds) return
		const center = bounds.min.add(bounds.max).scale(0.5)
		this.assetPivot.position = new Vector3(-center.x, -bounds.min.y, -center.z)
	}

	private setCameraTargetToGrid(): void {
		const size = this.gridSize * TILE_SIZE
		this.cameraTarget.set(size / 2, 0, size / 2)
		this.camera.setTarget(this.cameraTarget)
		this.camera.radius = Math.max(20, size * 0.9)
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

function stringToHue(value: string): number {
	let hash = 0
	for (let i = 0; i < value.length; i += 1) {
		hash = (hash * 31 + value.charCodeAt(i)) % 360
	}
	return hash < 0 ? hash + 360 : hash
}
