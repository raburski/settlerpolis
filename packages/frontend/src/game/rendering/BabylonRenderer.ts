import {
	AbstractMesh,
	ArcRotateCamera,
	Color3,
	Color4,
	Engine,
	HemisphericLight,
	Matrix,
	Plane,
	StandardMaterial,
	Mesh,
	MeshBuilder,
	Scene,
	Vector3
} from '@babylonjs/core'
import { PlaceholderFactory } from './PlaceholderFactory'

export class BabylonRenderer {
	public readonly engine: Engine
	public readonly scene: Scene
	public readonly camera: ArcRotateCamera
	public readonly placeholderFactory: PlaceholderFactory
	private ground: Mesh | null = null
	private cameraTarget: Vector3 = new Vector3(0, 0, 0)
	private bounds: { minX: number; minZ: number; maxX: number; maxZ: number } | null = null
	private groundMaterial: StandardMaterial | null = null
	private readonly baseRadius = 800
	private readonly isoAlpha = Math.PI / 4
	private readonly isoBeta = Math.acos(1 / Math.sqrt(3))
	private baseOrthoScale = 1
	private fidelityScale = 1
	private highFidelityEnabled = true

	constructor(canvas: HTMLCanvasElement) {
		this.engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true })
		this.applyHardwareScaling()
		this.scene = new Scene(this.engine)
		this.scene.clearColor = new Color4(0.08, 0.08, 0.08, 1)

		this.camera = new ArcRotateCamera(
			'camera',
			this.isoAlpha,
			this.isoBeta,
			this.baseRadius,
			this.cameraTarget,
			this.scene
		)
		this.scene.activeCamera = this.camera
		this.camera.attachControl(canvas, true)
		this.camera.inputs.removeByType('ArcRotateCameraPointersInput')
		this.camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput')
		this.camera.inertia = 0
		this.camera.panningInertia = 0
		this.camera.lowerBetaLimit = this.isoBeta
		this.camera.upperBetaLimit = this.isoBeta
		this.camera.mode = ArcRotateCamera.ORTHOGRAPHIC_CAMERA
		this.camera.wheelDeltaPercentage = 0.01
		this.camera.minZ = 0.1
		this.camera.maxZ = 10000
		this.updateCameraOrtho()

		const light = new HemisphericLight('light', new Vector3(0.2, 1, 0.3), this.scene)
		light.intensity = 0.9

		this.placeholderFactory = new PlaceholderFactory(this.scene)
	}

	start(renderStep: (deltaMs: number) => void): void {
		this.engine.runRenderLoop(() => {
			const delta = this.engine.getDeltaTime()
			renderStep(delta)
			this.scene.render()
		})
		window.addEventListener('resize', this.handleResize)
	}

	stop(): void {
		this.engine.stopRenderLoop()
		window.removeEventListener('resize', this.handleResize)
	}

	dispose(): void {
		this.stop()
		this.scene.dispose()
		this.engine.dispose()
	}

	private handleResize = () => {
		this.engine.resize()
		this.applyHardwareScaling()
		this.updateCameraOrtho()
	}

	private applyHardwareScaling(): void {
		const ratio = this.highFidelityEnabled ? (window.devicePixelRatio || 1) : 1
		this.fidelityScale = ratio
		this.engine.setHardwareScalingLevel(1 / ratio)
	}

	setCameraBounds(minX: number, minZ: number, maxX: number, maxZ: number): void {
		this.bounds = { minX, minZ, maxX, maxZ }
	}

	setCameraTarget(x: number, z: number): void {
		let targetX = x
		let targetZ = z
		if (this.bounds) {
			targetX = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, targetX))
			targetZ = Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, targetZ))
		}
		this.cameraTarget.x = targetX
		this.cameraTarget.z = targetZ
		this.camera.setTarget(this.cameraTarget)
	}

	setOrthoScale(scale: number): void {
		this.baseOrthoScale = Math.max(0.25, scale)
		this.updateCameraOrtho()
	}

	setHighFidelity(enabled: boolean): void {
		this.highFidelityEnabled = enabled
		this.applyHardwareScaling()
		this.updateCameraOrtho()
	}

	private updateCameraOrtho(): void {
		const effectiveScale = this.baseOrthoScale / (this.fidelityScale || 1)
		const renderWidth = this.engine.getRenderWidth()
		const renderHeight = this.engine.getRenderHeight()
		const halfWidth = (renderWidth / 2) * effectiveScale
		const halfHeight = (renderHeight / 2) * effectiveScale
		this.camera.orthoLeft = -halfWidth
		this.camera.orthoRight = halfWidth
		this.camera.orthoTop = halfHeight
		this.camera.orthoBottom = -halfHeight
	}

	createGround(id: string, width: number, height: number): Mesh {
		if (this.ground) {
			this.ground.dispose()
		}
		this.ground = MeshBuilder.CreateGround(
			id,
			{ width, height, subdivisions: 1 },
			this.scene
		)
		this.ground.position.y = 0
		this.ground.position.x = width / 2
		this.ground.position.z = height / 2
		this.ground.isPickable = true
		if (!this.groundMaterial) {
			this.groundMaterial = new StandardMaterial('ground-mat', this.scene)
			this.groundMaterial.diffuseColor = new Color3(0.15, 0.15, 0.15)
			this.groundMaterial.specularColor = Color3.Black()
			this.groundMaterial.emissiveColor = new Color3(0.05, 0.05, 0.05)
		}
		this.ground.material = this.groundMaterial
		return this.ground
	}

	getGround(): Mesh | null {
		return this.ground
	}

	createBox(id: string, size: { width: number; length: number; height: number }): Mesh {
		const mesh = MeshBuilder.CreateBox(
			id,
			{ width: size.width, height: size.height, depth: size.length },
			this.scene
		)
		mesh.isPickable = false
		return mesh
	}

	setMeshPosition(mesh: AbstractMesh, x: number, y: number, z: number): void {
		mesh.position.set(x, y, z)
	}

	setMeshRotation(mesh: AbstractMesh, x: number, y: number, z: number): void {
		mesh.rotation.set(x, y, z)
	}

	applyEmoji(mesh: AbstractMesh, emoji: string): void {
		this.placeholderFactory.applyEmoji(mesh, emoji)
	}

	applyTint(mesh: AbstractMesh, hex: string): void {
		this.placeholderFactory.applyTint(mesh, hex)
	}

	createCollisionOverlay(id: string, grid: boolean[][], tileSize: number): AbstractMesh[] {
		const meshes: AbstractMesh[] = []
		const base = MeshBuilder.CreateBox(
			`${id}-base`,
			{ width: tileSize, height: 1, depth: tileSize },
			this.scene
		)
		base.isVisible = false
		base.isPickable = false

		const material = new StandardMaterial(`${id}-mat`, this.scene)
		material.diffuseColor = Color3.FromHexString('#c62828')
		material.emissiveColor = new Color3(0.2, 0.02, 0.02)
		material.specularColor = Color3.Black()
		base.material = material
		meshes.push(base)

		for (let row = 0; row < grid.length; row += 1) {
			const rowData = grid[row]
			if (!rowData) continue
			for (let col = 0; col < rowData.length; col += 1) {
				if (!rowData[col]) continue
				const instance = base.createInstance(`${id}-${row}-${col}`)
				instance.position.set(
					col * tileSize + tileSize / 2,
					0.51,
					row * tileSize + tileSize / 2
				)
				meshes.push(instance)
			}
		}

		return meshes
	}

	setPickable(mesh: AbstractMesh, pickable: boolean): void {
		mesh.isPickable = pickable
	}

	screenToWorld(pointerX: number, pointerY: number): Vector3 | null {
		const ground = this.ground
		if (ground) {
			const pick = this.scene.pick(pointerX, pointerY, (mesh) => mesh === ground)
			if (pick?.hit && pick.pickedPoint) {
				return pick.pickedPoint
			}
		}

		const plane = Plane.FromPositionAndNormal(Vector3.Zero(), Vector3.Up())
		const ray = this.scene.createPickingRay(pointerX, pointerY, Matrix.Identity(), this.camera)
		const distance = ray.intersectsPlane(plane)
		if (distance !== null) {
			return ray.origin.add(ray.direction.scale(distance))
		}

		return null
	}

	worldToScreen(world: Vector3): { x: number; y: number } {
		const viewport = this.camera.viewport.toGlobal(
			this.engine.getRenderWidth(),
			this.engine.getRenderHeight()
		)
		const projected = Vector3.Project(world, Matrix.Identity(), this.scene.getTransformMatrix(), viewport)
		return { x: projected.x, y: projected.y }
	}
}
