import { AssetManager } from '../../modules/Assets'
import { PhysicsWorld } from '../../world/PhysicsWorld'
import type { LoadedMap } from '../../world/MapLoader'
import { CameraController } from '../../rendering/CameraController'
import type { GameRuntime } from '../../runtime/GameRuntime'
import type { AbstractMesh } from '@babylonjs/core'

interface MapView {
	key: string
	tileWidth: number
	tileHeight: number
	widthInPixels: number
	heightInPixels: number
	getObjectLayer: (name: string) => { objects: any[] } | null
}

export abstract class MapScene {
	public runtime: GameRuntime
	protected mapKey: string
	protected mapPath: string
	protected assetManager: AssetManager
	public map: MapView | null = null
	protected loadedMap: LoadedMap | null = null
	public physics: PhysicsWorld
	public cameras: { main: CameraController }
	protected transitioning: boolean = false
	public assetsLoaded: boolean = false
	private collisionOverlay: AbstractMesh[] = []
	private groundTypeMeshes: AbstractMesh[] = []

	constructor(runtime: GameRuntime, mapKey: string, mapPath: string) {
		this.runtime = runtime
		this.mapKey = mapKey
		this.mapPath = mapPath
		this.assetManager = new AssetManager(mapKey, mapPath, this.initializeScene.bind(this))
		this.physics = new PhysicsWorld()
		this.cameras = { main: new CameraController(this.runtime.renderer, this.runtime.overlayRoot) }
	}

	start(): void {
		this.transitioning = false
		this.assetManager.preload()
	}

	update(_deltaMs: number): void {
		void _deltaMs
		this.cameras.main.update()
	}

	destroy(): void {
		this.cameras.main.destroy()
		this.physics.clearStatics()
		this.clearCollisionOverlay()
		this.clearGroundTypeMeshes()
	}

	protected initializeScene(): void {
		this.loadedMap = this.assetManager.getLoadedMap()
		if (!this.loadedMap) {
			console.warn('[MapScene] Map data not available')
			return
		}

		const { data, collisionGrid, objectLayers } = this.loadedMap
		const widthInPixels = data.width * data.tileWidth
		const heightInPixels = data.height * data.tileHeight

		this.map = {
			key: data.key,
			tileWidth: data.tileWidth,
			tileHeight: data.tileHeight,
			widthInPixels,
			heightInPixels,
			getObjectLayer: (name: string) => {
				const objects = objectLayers.get(name)
				if (!objects) return null
				return { objects }
			}
		}

		this.assetsLoaded = true
		this.physics.setWorldBounds(widthInPixels, heightInPixels)
		this.physics.setCollisionGrid({
			width: data.width,
			height: data.height,
			tileSize: data.tileWidth,
			cells: collisionGrid
		})
		this.physics.clearStatics()

		const staticObjects = objectLayers.get('static-objects') || []
		staticObjects.forEach((obj) => {
			this.physics.addStaticRect({ x: obj.x, y: obj.y - obj.height, width: obj.width, height: obj.height })
		})

		this.runtime.renderer.createGround(`${data.key}-ground`, widthInPixels, heightInPixels)
		const groundLayer = data.layers.find((layer) => layer.name === 'ground' && layer.type === 'tilelayer')
		if (groundLayer?.data?.length) {
			this.runtime.renderer.resetGroundMaterial()
			this.clearGroundTypeMeshes()
			this.groundTypeMeshes = this.runtime.renderer.createGroundTypeMeshes({
				mapUrl: this.mapPath,
				mapWidth: data.width,
				mapHeight: data.height,
				tileWidth: data.tileWidth,
				tileHeight: data.tileHeight,
				layer: groundLayer,
				tilesets: data.tilesets
			})
		} else {
			this.runtime.renderer.resetGroundMaterial()
		}
		this.runtime.renderer.setCameraTarget(widthInPixels / 2, heightInPixels / 2)
		this.runtime.renderer.logRenderState('map-init')

		this.cameras.main.setBounds(0, 0, widthInPixels, heightInPixels)

		this.clearCollisionOverlay()
		this.collisionOverlay = this.runtime.renderer.createCollisionOverlay(
			`${data.key}-collision`,
			collisionGrid,
			data.tileWidth
		)
	}

	private clearCollisionOverlay(): void {
		if (this.collisionOverlay.length === 0) return
		this.collisionOverlay.forEach((mesh) => mesh.dispose())
		this.collisionOverlay = []
	}

	private clearGroundTypeMeshes(): void {
		if (this.groundTypeMeshes.length === 0) return
		this.groundTypeMeshes.forEach((mesh) => mesh.dispose())
		this.groundTypeMeshes = []
	}
}
