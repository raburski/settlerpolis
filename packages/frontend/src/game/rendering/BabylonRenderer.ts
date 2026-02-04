import {
	AbstractMesh,
	ArcRotateCamera,
	Color3,
	Color4,
	DynamicTexture,
	Engine,
	Effect,
	HemisphericLight,
	Matrix,
	Plane,
	ShaderMaterial,
	StandardMaterial,
	Mesh,
	MeshBuilder,
	Scene,
	Texture,
	Vector2,
	Vector3
} from '@babylonjs/core'
import { PlaceholderFactory } from './PlaceholderFactory'
import type { MapLayer, MapTileset } from '../world/MapLoader'
import earcut from 'earcut'

interface GroundTilesConfig {
	mapUrl: string
	mapWidth: number
	mapHeight: number
	tileWidth: number
	tileHeight: number
	layer: MapLayer
	tilesets: MapTileset[]
}

interface ContourSegment {
	startX: number
	startY: number
	endX: number
	endY: number
}

interface ContourPolyline {
	points: { x: number; y: number }[]
	closed: boolean
}

const GROUND_TYPE_ORDER = [
	'grass',
	'dirt',
	'sand',
	'rock',
	'mountain',
	'water_shallow',
	'water_deep',
	'mud'
] as const

type GroundType = (typeof GROUND_TYPE_ORDER)[number]

const GROUND_TYPE_COLORS: Record<GroundType, string> = {
	grass: '#4f9d4a',
	dirt: '#9a6b3f',
	sand: '#d1b36a',
	rock: '#7b7f86',
	mountain: '#4a4f55',
	water_shallow: '#4b86b8',
	water_deep: '#1f4e7a',
	mud: '#6f5a3c'
}

const GROUND_SMOOTHING_ITERATIONS = 2
const DEBUG_GROUND_CONTOURS = false
const DEBUG_GROUND_CONTOUR_TYPE: GroundType | 'all' = 'all'
const DEBUG_GROUND_CONTOUR_MAX_POINTS = 1200
const DEBUG_VALIDATE_POLYGONS = true
const DEBUG_SKIP_SELF_INTERSECTING_POLYGONS = true

export class BabylonRenderer {
	public readonly engine: Engine
	public readonly scene: Scene
	public readonly camera: ArcRotateCamera
	public readonly placeholderFactory: PlaceholderFactory
	private ground: Mesh | null = null
	private cameraTarget: Vector3 = new Vector3(0, 0, 0)
	private bounds: { minX: number; minZ: number; maxX: number; maxZ: number } | null = null
	private groundMaterial: StandardMaterial | null = null
	private groundTexture: DynamicTexture | null = null
	private groundIndexTexture: DynamicTexture | null = null
	private groundAtlasTexture: DynamicTexture | null = null
	private groundPaletteTexture: DynamicTexture | null = null
	private groundShaderMaterial: ShaderMaterial | null = null
	private groundPaletteMaterial: ShaderMaterial | null = null
	private groundTypeMaterials: Map<number, StandardMaterial> = new Map()
	private groundTypeSmoothMaterials: Map<number, StandardMaterial> = new Map()
	private groundTilesRequest = 0
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
		const radius = this.camera.radius
		let targetX = x
		let targetZ = z
		if (this.bounds) {
			targetX = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, targetX))
			targetZ = Math.max(this.bounds.minZ, Math.min(this.bounds.maxZ, targetZ))
		}
		this.cameraTarget.x = targetX
		this.cameraTarget.z = targetZ
		this.camera.setTarget(this.cameraTarget)
		if (Number.isFinite(radius) && radius > 0) {
			this.camera.radius = radius
		}
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

	fitCameraToMap(mapWidth: number, mapHeight: number): void {
		const renderWidth = this.engine.getRenderWidth()
		const renderHeight = this.engine.getRenderHeight()
		if (renderWidth <= 0 || renderHeight <= 0) {
			console.warn('[RenderDebug] fitCameraToMap skipped: render size is zero')
			return
		}
		const scaleX = mapWidth / renderWidth
		const scaleY = mapHeight / renderHeight
		const scale = Math.max(scaleX, scaleY, 0.25)
		if (Number.isFinite(scale)) {
			this.setOrthoScale(scale)
		}
		const mapDiagonal = Math.hypot(mapWidth, mapHeight)
		this.camera.maxZ = Math.max(this.camera.maxZ, mapDiagonal * 2)
		this.camera.radius = Math.max(this.baseRadius, mapDiagonal * 0.6)
	}

	logRenderState(tag: string): void {
		const position = this.camera.position
		const target = this.camera.target
		const renderWidth = this.engine.getRenderWidth()
		const renderHeight = this.engine.getRenderHeight()
		console.info(
			`[RenderDebug] ${tag} render=${renderWidth}x${renderHeight} target=${target.x.toFixed(
				1
			)},${target.z.toFixed(1)} pos=${position.x.toFixed(1)},${position.y.toFixed(
				1
			)},${position.z.toFixed(1)} ortho=${this.camera.orthoLeft?.toFixed(
				1
			)},${this.camera.orthoRight?.toFixed(1)},${this.camera.orthoTop?.toFixed(
				1
			)},${this.camera.orthoBottom?.toFixed(1)} meshes=${this.scene.meshes.length}`
		)
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

	private ensureGroundMaterial(): StandardMaterial {
		if (!this.groundMaterial) {
			this.groundMaterial = new StandardMaterial('ground-mat', this.scene)
		}
		return this.groundMaterial
	}

	resetGroundMaterial(): void {
		const material = this.ensureGroundMaterial()
		if (this.groundShaderMaterial) {
			this.groundShaderMaterial.dispose()
			this.groundShaderMaterial = null
		}
		if (this.groundPaletteMaterial) {
			this.groundPaletteMaterial.dispose()
			this.groundPaletteMaterial = null
		}
		if (this.groundIndexTexture) {
			this.groundIndexTexture.dispose()
			this.groundIndexTexture = null
		}
		if (this.groundAtlasTexture) {
			this.groundAtlasTexture.dispose()
			this.groundAtlasTexture = null
		}
		if (this.groundPaletteTexture) {
			this.groundPaletteTexture.dispose()
			this.groundPaletteTexture = null
		}
		if (this.groundTexture) {
			this.groundTexture.dispose()
			this.groundTexture = null
		}
		material.diffuseTexture = null
		material.emissiveTexture = null
		material.diffuseColor = new Color3(0.15, 0.15, 0.15)
		material.specularColor = Color3.Black()
		material.emissiveColor = new Color3(0.05, 0.05, 0.05)
		if (this.ground) {
			this.ground.material = material
		}
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
		this.resetGroundMaterial()
		return this.ground
	}

	getGround(): Mesh | null {
		return this.ground
	}

	async applyGroundPalette(config: GroundTilesConfig): Promise<void> {
		const ground = this.ground
		if (!ground) return
		if (!config.layer?.data?.length) return

		const requestId = (this.groundTilesRequest += 1)
		const indexTexture = this.buildGroundIndexTextureFromLayer(
			config.layer,
			config.mapWidth,
			config.mapHeight,
			config.tilesets
		)
		if (!indexTexture) return
		if (requestId !== this.groundTilesRequest) return
		if (!this.ground || this.ground !== ground) return

		if (!this.groundPaletteTexture) {
			this.groundPaletteTexture = this.buildGroundPaletteTexture(GROUND_TYPE_ORDER, GROUND_TYPE_COLORS)
		}

		this.groundIndexTexture?.dispose()
		this.groundIndexTexture = indexTexture

		const material = this.ensureGroundPaletteMaterial()
		material.setTexture('indexSampler', indexTexture)
		if (this.groundPaletteTexture) {
			material.setTexture('paletteSampler', this.groundPaletteTexture)
			material.setFloat('paletteSize', this.groundPaletteTexture.getSize().width)
		}
		material.setVector2('mapSize', new Vector2(config.mapWidth, config.mapHeight))
		material.setFloat('macroStrength', 0.04)
		ground.material = material
	}

	createGroundTypeMeshes(config: GroundTilesConfig): Mesh[] {
		const ground = this.ground
		if (!ground) return []
		if (!config.layer?.data?.length) return []
		if (!config.tilesets?.length) return []

		const mapWidth = config.mapWidth
		const mapHeight = config.mapHeight
		if (mapWidth <= 0 || mapHeight <= 0) return []

		console.info(
			`[GroundMesh] build start map=${mapWidth}x${mapHeight} tile=${config.tileWidth}x${config.tileHeight} tilesets=${config.tilesets.length}`
		)

		let typeGrid: number[] | null = null
		try {
			typeGrid = this.buildGroundTypeGrid(
				config.layer,
				mapWidth,
				mapHeight,
				config.tilesets
			)
		} catch (error) {
			console.error('[GroundMesh] build failed while reading ground grid:', error)
			return []
		}
		if (!typeGrid) {
			console.warn('[GroundMesh] build aborted: missing ground grid')
			return []
		}

		const typeCounts = new Array<number>(GROUND_TYPE_ORDER.length).fill(0)
		for (const entry of typeGrid) {
			if (entry > 0 && entry <= GROUND_TYPE_ORDER.length) {
				typeCounts[entry - 1] += 1
			}
		}
		const typeSummary = typeCounts
			.map((count, index) => (count ? `${GROUND_TYPE_ORDER[index]}=${count}` : null))
			.filter(Boolean)
			.join(' ')
		console.info(`[GroundMesh] type counts ${typeSummary || 'none'}`)

		const meshes: Mesh[] = []
		const tileWidth = config.tileWidth
		const tileHeight = config.tileHeight
		const baseOffset = 0.02
		const zOffsetStep = 0.0002

		for (let typeIndex = 1; typeIndex <= GROUND_TYPE_ORDER.length; typeIndex += 1) {
			const segments = this.buildTypeBoundarySegments(typeGrid, mapWidth, mapHeight, typeIndex)
			if (segments.length === 0) continue

			const polylines = this.buildPolylinesFromSegments(segments)
			if (polylines.length === 0) continue
			console.info(
				`[GroundMesh] type=${GROUND_TYPE_ORDER[typeIndex - 1]} segments=${segments.length} polylines=${polylines.length}`
			)

			const openCount = polylines.reduce((count, polyline) => count + (polyline.closed ? 0 : 1), 0)
			if (openCount > 0) {
				console.warn(
					`[GroundMesh] type=${GROUND_TYPE_ORDER[typeIndex - 1]} openContours=${openCount}`
				)
			}

			if (
				DEBUG_GROUND_CONTOURS &&
				(DEBUG_GROUND_CONTOUR_TYPE === 'all' ||
					DEBUG_GROUND_CONTOUR_TYPE === GROUND_TYPE_ORDER[typeIndex - 1])
			) {
				const debugMeshes = this.createContourDebugMeshes(
					polylines,
					tileWidth,
					tileHeight,
					baseOffset + typeIndex * zOffsetStep + 0.05,
					`ground-type-${typeIndex}`
				)
				meshes.push(...debugMeshes)
			}

			const typeLabel = GROUND_TYPE_ORDER[typeIndex - 1]
			const baseLoops = this.prepareContourLoops(polylines, typeIndex, typeLabel, 0, false)
			if (baseLoops.length === 0) continue
			const baseGroups = this.groupLoopsWithHoles(baseLoops)
			const baseY = baseOffset + typeIndex * zOffsetStep
			this.buildContourMeshes(
				baseGroups,
				typeIndex,
				baseY,
				tileWidth,
				tileHeight,
				meshes,
				'base'
			)

			if (GROUND_SMOOTHING_ITERATIONS > 0) {
				const smoothLoops = this.prepareContourLoops(
					polylines,
					typeIndex,
					typeLabel,
					GROUND_SMOOTHING_ITERATIONS,
					true
				)
				if (smoothLoops.length > 0) {
					const smoothGroups = this.groupLoopsWithHoles(smoothLoops)
					this.buildContourMeshes(
						smoothGroups,
						typeIndex,
						baseY + 0.002,
						tileWidth,
						tileHeight,
						meshes,
						'smooth'
					)
				}
			}
		}

		if (meshes.length === 0) {
			console.warn('[GroundMesh] build completed with zero meshes')
		} else {
			console.info(`[GroundMesh] build completed meshes=${meshes.length}`)
		}
		return meshes
	}

	async applyGroundShader(config: GroundTilesConfig): Promise<void> {
		const ground = this.ground
		if (!ground) return
		if (!config.layer?.data?.length) return
		if (!config.tilesets?.length) return

		const requestId = (this.groundTilesRequest += 1)
		const tilesets = config.tilesets
			.filter((tileset) => Boolean(tileset.image))
			.sort((a, b) => a.firstGid - b.firstGid)

		if (tilesets.length === 0) return

		const tilesetImages = await this.loadTilesetImages(tilesets, config.mapUrl)
		if (requestId !== this.groundTilesRequest) return
		if (!this.ground || this.ground !== ground) return

		const atlasResult = this.buildGroundAtlas(tilesets, tilesetImages, config.tileWidth, config.tileHeight)
		if (!atlasResult) return

		const { atlasTexture, atlasColumns, atlasRows, atlasWidth, atlasHeight, gidToAtlasIndex } =
			atlasResult

		const indexTexture = this.buildGroundIndexTexture(
			config.layer,
			config.mapWidth,
			config.mapHeight,
			gidToAtlasIndex
		)
		if (!indexTexture) return

		this.groundAtlasTexture?.dispose()
		this.groundIndexTexture?.dispose()
		this.groundAtlasTexture = atlasTexture
		this.groundIndexTexture = indexTexture

		const material = this.ensureGroundShaderMaterial()
		material.setTexture('atlasSampler', atlasTexture)
		material.setTexture('indexSampler', indexTexture)
		material.setVector2('mapSize', new Vector2(config.mapWidth, config.mapHeight))
		material.setVector2('atlasSize', new Vector2(atlasColumns, atlasRows))
		material.setVector2('atlasTexelSize', new Vector2(1 / atlasWidth, 1 / atlasHeight))
		material.setFloat('variationStrength', 0.05)
		ground.material = material
	}

	async applyGroundTiles(config: GroundTilesConfig): Promise<void> {
		const ground = this.ground
		if (!ground) return
		if (!config.layer?.data?.length) return
		if (!config.tilesets?.length) return

		const requestId = (this.groundTilesRequest += 1)
		const tilesets = config.tilesets
			.filter((tileset) => Boolean(tileset.image))
			.sort((a, b) => a.firstGid - b.firstGid)

		if (tilesets.length === 0) return

		const tilesetImages = await this.loadTilesetImages(tilesets, config.mapUrl)
		if (requestId !== this.groundTilesRequest) return
		if (!this.ground || this.ground !== ground) return

		const mapWidth = config.mapWidth
		const mapHeight = config.mapHeight
		if (mapWidth <= 0 || mapHeight <= 0) return

		const widthPx = mapWidth * config.tileWidth
		const heightPx = mapHeight * config.tileHeight
		if (widthPx <= 0 || heightPx <= 0) return

		const maxSize = this.engine.getCaps().maxTextureSize || 4096
		const scale = Math.min(1, maxSize / widthPx, maxSize / heightPx)
		const textureWidth = Math.max(1, Math.floor(widthPx * scale))
		const textureHeight = Math.max(1, Math.floor(heightPx * scale))
		const tileWidth = textureWidth / mapWidth
		const tileHeight = textureHeight / mapHeight

		if (this.groundTexture) {
			this.groundTexture.dispose()
			this.groundTexture = null
		}

		const texture = new DynamicTexture(
			`ground-tiles-${config.mapWidth}x${config.mapHeight}`,
			{ width: textureWidth, height: textureHeight },
			this.scene,
			false
		)
		texture.wrapU = Texture.CLAMP_ADDRESSMODE
		texture.wrapV = Texture.CLAMP_ADDRESSMODE
		texture.hasAlpha = true
		const context = texture.getContext()
		context.imageSmoothingEnabled = false
		context.clearRect(0, 0, textureWidth, textureHeight)

		const data = config.layer.data || []
		for (let index = 0; index < data.length; index += 1) {
			const rawGid = data[index]
			if (!rawGid) continue
			const gid = rawGid & 0x1fffffff
			const tileset = this.findTilesetForGid(tilesets, gid)
			if (!tileset) continue
			const image = tilesetImages.get(tileset.image)
			if (!image) continue

			const localId = gid - tileset.firstGid
			if (localId < 0) continue
			const columns = Math.max(1, tileset.columns)
			const srcCol = localId % columns
			const srcRow = Math.floor(localId / columns)
			const srcX = tileset.margin + srcCol * (tileset.tileWidth + tileset.spacing)
			const srcY = tileset.margin + srcRow * (tileset.tileHeight + tileset.spacing)
			const imageWidth = image.width || tileset.imageWidth
			const imageHeight = image.height || tileset.imageHeight
			if (srcX + tileset.tileWidth > imageWidth) continue
			if (srcY + tileset.tileHeight > imageHeight) continue

			const destCol = index % mapWidth
			const destRow = Math.floor(index / mapWidth)
			const destX = destCol * tileWidth
			const destY = destRow * tileHeight
			context.drawImage(
				image,
				srcX,
				srcY,
				tileset.tileWidth,
				tileset.tileHeight,
				destX,
				destY,
				tileWidth,
				tileHeight
			)
		}

		texture.update()
		this.groundTexture = texture

		const material = this.ensureGroundMaterial()
		material.diffuseTexture = texture
		material.emissiveColor = Color3.White()
		material.specularColor = Color3.Black()
		material.diffuseColor = Color3.White()
		ground.material = material
	}

	private ensureGroundShaderMaterial(): ShaderMaterial {
		if (!Effect.ShadersStore['groundTileVertexShader']) {
			Effect.ShadersStore['groundTileVertexShader'] = `
				precision highp float;
				attribute vec3 position;
				attribute vec2 uv;
				uniform mat4 worldViewProjection;
				varying vec2 vUV;
				void main(void) {
					vUV = uv;
					gl_Position = worldViewProjection * vec4(position, 1.0);
				}
			`
		}
		if (!Effect.ShadersStore['groundTileFragmentShader']) {
			Effect.ShadersStore['groundTileFragmentShader'] = `
				precision highp float;
				varying vec2 vUV;
				uniform sampler2D atlasSampler;
				uniform sampler2D indexSampler;
				uniform vec2 mapSize;
				uniform vec2 atlasSize;
				uniform vec2 atlasTexelSize;
				uniform float variationStrength;

				float decodeIndex(vec4 enc) {
					return enc.r * 255.0 + enc.g * 65280.0 + enc.b * 16711680.0;
				}

				float hash(vec2 p) {
					return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
				}

				void main(void) {
					vec2 mapSizeSafe = max(mapSize, vec2(1.0));
					vec2 tilePos = floor(vUV * mapSizeSafe);
					tilePos = min(tilePos, mapSizeSafe - 1.0);
					vec2 tileUV = fract(vUV * mapSizeSafe);

					vec2 indexUV = (tilePos + 0.5) / mapSizeSafe;
					vec4 enc = texture2D(indexSampler, indexUV);
					float index = floor(decodeIndex(enc) + 0.5);
					if (index < 0.5) {
						gl_FragColor = vec4(0.08, 0.08, 0.08, 1.0);
						return;
					}

					float tileIndex = index - 1.0;
					float atlasCol = mod(tileIndex, atlasSize.x);
					float atlasRow = floor(tileIndex / atlasSize.x);
					vec2 atlasUV = (vec2(atlasCol, atlasRow) + tileUV) / atlasSize;
					vec4 color = texture2D(atlasSampler, atlasUV);

					float n = hash(tilePos);
					float v = mix(1.0 - variationStrength, 1.0 + variationStrength, n);
					color.rgb *= v;

					gl_FragColor = color;
				}
			`
		}

		if (!this.groundShaderMaterial) {
			this.groundShaderMaterial = new ShaderMaterial(
				'ground-tile-shader',
				this.scene,
				{ vertex: 'groundTile', fragment: 'groundTile' },
				{
					attributes: ['position', 'uv'],
					uniforms: ['worldViewProjection', 'mapSize', 'atlasSize', 'atlasTexelSize', 'variationStrength'],
					samplers: ['atlasSampler', 'indexSampler']
				}
			)
			this.groundShaderMaterial.backFaceCulling = true
		}

		return this.groundShaderMaterial
	}

	private ensureGroundPaletteMaterial(): ShaderMaterial {
		if (!Effect.ShadersStore['groundPaletteVertexShader']) {
			Effect.ShadersStore['groundPaletteVertexShader'] = `
				precision highp float;
				attribute vec3 position;
				attribute vec2 uv;
				uniform mat4 worldViewProjection;
				varying vec2 vUV;
				void main(void) {
					vUV = uv;
					gl_Position = worldViewProjection * vec4(position, 1.0);
				}
			`
		}
		if (!Effect.ShadersStore['groundPaletteFragmentShader']) {
			Effect.ShadersStore['groundPaletteFragmentShader'] = `
				precision highp float;
				varying vec2 vUV;
				uniform sampler2D indexSampler;
				uniform sampler2D paletteSampler;
				uniform vec2 mapSize;
				uniform float paletteSize;
				uniform float macroStrength;

				float decodeIndex(vec4 enc) {
					return enc.r * 255.0 + enc.g * 65280.0 + enc.b * 16711680.0;
				}

				float hash(vec2 p) {
					return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
				}

				void main(void) {
					vec2 mapSizeSafe = max(mapSize, vec2(1.0));
					vec2 tilePos = floor(vUV * mapSizeSafe);
					tilePos = min(tilePos, mapSizeSafe - 1.0);
					vec2 indexUV = (tilePos + 0.5) / mapSizeSafe;
					vec4 enc = texture2D(indexSampler, indexUV);
					float index = floor(decodeIndex(enc) + 0.5);
					if (index < 0.5 || paletteSize <= 1.0) {
						gl_FragColor = vec4(0.08, 0.08, 0.08, 1.0);
						return;
					}
					float paletteIndex = mod(index, paletteSize);
					vec2 paletteUV = vec2((paletteIndex + 0.5) / paletteSize, 0.5);
					vec4 color = texture2D(paletteSampler, paletteUV);

					float macro = hash(floor(tilePos / 6.0));
					color.rgb *= mix(1.0 - macroStrength, 1.0 + macroStrength, macro);
					gl_FragColor = color;
				}
			`
		}

		if (!this.groundPaletteMaterial) {
			this.groundPaletteMaterial = new ShaderMaterial(
				'ground-palette-shader',
				this.scene,
				{ vertex: 'groundPalette', fragment: 'groundPalette' },
				{
					attributes: ['position', 'uv'],
					uniforms: ['worldViewProjection', 'mapSize', 'paletteSize', 'macroStrength'],
					samplers: ['indexSampler', 'paletteSampler']
				}
			)
			this.groundPaletteMaterial.backFaceCulling = true
		}

		return this.groundPaletteMaterial
	}

	private buildGroundAtlas(
		tilesets: MapTileset[],
		tilesetImages: Map<string, HTMLImageElement>,
		baseTileWidth: number,
		baseTileHeight: number
	): {
		atlasTexture: DynamicTexture
		atlasColumns: number
		atlasRows: number
		atlasWidth: number
		atlasHeight: number
		gidToAtlasIndex: Map<number, number>
	} | null {
		const tileWidth = Math.max(1, Math.floor(baseTileWidth))
		const tileHeight = Math.max(1, Math.floor(baseTileHeight))
		const tilesetMeta = tilesets.map((tileset) => {
			const image = tilesetImages.get(tileset.image)
			const columns =
				tileset.columns ||
				(image ? Math.floor(image.width / tileset.tileWidth) : 0) ||
				Math.floor(tileset.imageWidth / tileset.tileWidth)
			const rows =
				image ? Math.floor(image.height / tileset.tileHeight) : Math.floor(tileset.imageHeight / tileset.tileHeight)
			const tileCount = tileset.tileCount || Math.max(0, columns * rows)
			return { tileset, image, tileCount, columns }
		})

		const totalTiles = tilesetMeta.reduce((sum, meta) => sum + meta.tileCount, 0)
		if (totalTiles === 0) return null

		const maxSize = this.engine.getCaps().maxTextureSize || 4096
		const maxCols = Math.max(1, Math.floor(maxSize / tileWidth))
		const maxRows = Math.max(1, Math.floor(maxSize / tileHeight))
		let atlasColumns = Math.min(maxCols, Math.max(1, Math.ceil(Math.sqrt(totalTiles))))
		let atlasRows = Math.max(1, Math.ceil(totalTiles / atlasColumns))

		let atlasTileWidth = tileWidth
		let atlasTileHeight = tileHeight
		if (atlasRows > maxRows || atlasColumns > maxCols) {
			const scale = Math.min(1, maxSize / (atlasColumns * tileWidth), maxSize / (atlasRows * tileHeight))
			atlasTileWidth = Math.max(1, Math.floor(tileWidth * scale))
			atlasTileHeight = Math.max(1, Math.floor(tileHeight * scale))
		}

		const atlasWidth = atlasColumns * atlasTileWidth
		const atlasHeight = atlasRows * atlasTileHeight

		const atlasTexture = new DynamicTexture(
			`ground-atlas-${atlasColumns}x${atlasRows}`,
			{ width: atlasWidth, height: atlasHeight },
			this.scene,
			false
		)
		atlasTexture.wrapU = Texture.CLAMP_ADDRESSMODE
		atlasTexture.wrapV = Texture.CLAMP_ADDRESSMODE
		atlasTexture.hasAlpha = true
		atlasTexture.updateSamplingMode(Texture.NEAREST_NEAREST)

		const context = atlasTexture.getContext()
		context.imageSmoothingEnabled = false
		context.clearRect(0, 0, atlasWidth, atlasHeight)

		const gidToAtlasIndex = new Map<number, number>()
		let atlasIndex = 0

		for (const meta of tilesetMeta) {
			const { tileset, image, tileCount, columns } = meta
			if (!image || tileCount === 0 || columns <= 0) {
				atlasIndex += tileCount
				continue
			}

			for (let localId = 0; localId < tileCount; localId += 1) {
				const srcCol = localId % columns
				const srcRow = Math.floor(localId / columns)
				const srcX = tileset.margin + srcCol * (tileset.tileWidth + tileset.spacing)
				const srcY = tileset.margin + srcRow * (tileset.tileHeight + tileset.spacing)
				const imageWidth = image.width || tileset.imageWidth
				const imageHeight = image.height || tileset.imageHeight
				if (srcX + tileset.tileWidth > imageWidth || srcY + tileset.tileHeight > imageHeight) {
					atlasIndex += 1
					continue
				}

				const destCol = atlasIndex % atlasColumns
				const destRow = Math.floor(atlasIndex / atlasColumns)
				const destX = destCol * atlasTileWidth
				const destY = destRow * atlasTileHeight

				context.drawImage(
					image,
					srcX,
					srcY,
					tileset.tileWidth,
					tileset.tileHeight,
					destX,
					destY,
					atlasTileWidth,
					atlasTileHeight
				)

				const gid = tileset.firstGid + localId
				gidToAtlasIndex.set(gid, atlasIndex + 1)
				atlasIndex += 1
			}
		}

		atlasTexture.update()
		return { atlasTexture, atlasColumns, atlasRows, atlasWidth, atlasHeight, gidToAtlasIndex }
	}

	private buildGroundIndexTexture(
		layer: MapLayer,
		mapWidth: number,
		mapHeight: number,
		gidToAtlasIndex: Map<number, number>
	): DynamicTexture | null {
		const totalTiles = mapWidth * mapHeight
		if (totalTiles <= 0) return null
		const data = layer.data || []
		if (data.length < totalTiles) return null

		const indexTexture = new DynamicTexture(
			'ground-index',
			{ width: mapWidth, height: mapHeight },
			this.scene,
			false
		)
		indexTexture.wrapU = Texture.CLAMP_ADDRESSMODE
		indexTexture.wrapV = Texture.CLAMP_ADDRESSMODE
		indexTexture.updateSamplingMode(Texture.NEAREST_NEAREST)

		const context = indexTexture.getContext()
		const imageData = context.createImageData(mapWidth, mapHeight)
		const pixels = imageData.data

		for (let i = 0; i < totalTiles; i += 1) {
			const rawGid = data[i] || 0
			const gid = rawGid & 0x1fffffff
			const atlasIndex = gid ? gidToAtlasIndex.get(gid) || 0 : 0
			const offset = i * 4
			pixels[offset] = atlasIndex & 255
			pixels[offset + 1] = (atlasIndex >> 8) & 255
			pixels[offset + 2] = (atlasIndex >> 16) & 255
			pixels[offset + 3] = 255
		}

		context.putImageData(imageData, 0, 0)
		indexTexture.update()
		return indexTexture
	}

	private buildGroundIndexTextureFromLayer(
		layer: MapLayer,
		mapWidth: number,
		mapHeight: number,
		tilesets: MapTileset[]
	): DynamicTexture | null {
		const totalTiles = mapWidth * mapHeight
		if (totalTiles <= 0) return null
		const data = layer.data || []
		if (data.length < totalTiles) return null

		const sortedTilesets = tilesets
			.filter((tileset) => typeof tileset.firstGid === 'number')
			.sort((a, b) => a.firstGid - b.firstGid)

		const indexTexture = new DynamicTexture(
			'ground-index',
			{ width: mapWidth, height: mapHeight },
			this.scene,
			false
		)
		indexTexture.wrapU = Texture.CLAMP_ADDRESSMODE
		indexTexture.wrapV = Texture.CLAMP_ADDRESSMODE
		indexTexture.updateSamplingMode(Texture.NEAREST_NEAREST)

		const context = indexTexture.getContext()
		const imageData = context.createImageData(mapWidth, mapHeight)
		const pixels = imageData.data

		for (let i = 0; i < totalTiles; i += 1) {
			const rawGid = data[i] || 0
			const gid = rawGid & 0x1fffffff
			const typeIndex = this.getGroundTypeIndex(gid, sortedTilesets)
			const offset = i * 4
			pixels[offset] = typeIndex & 255
			pixels[offset + 1] = (typeIndex >> 8) & 255
			pixels[offset + 2] = (typeIndex >> 16) & 255
			pixels[offset + 3] = 255
		}

		context.putImageData(imageData, 0, 0)
		indexTexture.update()
		return indexTexture
	}

	private buildGroundPaletteTexture(
		order: GroundType[],
		colors: Record<GroundType, string>
	): DynamicTexture {
		const paletteSize = Math.max(2, order.length + 1)
		const texture = new DynamicTexture(
			`ground-palette-${paletteSize}`,
			{ width: paletteSize, height: 1 },
			this.scene,
			false
		)
		texture.wrapU = Texture.CLAMP_ADDRESSMODE
		texture.wrapV = Texture.CLAMP_ADDRESSMODE
		texture.updateSamplingMode(Texture.NEAREST_NEAREST)
		const context = texture.getContext()
		const imageData = context.createImageData(paletteSize, 1)
		const pixels = imageData.data

		const empty = this.hexToRgb('#151515')
		pixels[0] = empty[0]
		pixels[1] = empty[1]
		pixels[2] = empty[2]
		pixels[3] = 255

		order.forEach((type, index) => {
			const color = colors[type]
			const rgb = this.hexToRgb(color || '#ffffff')
			const offset = (index + 1) * 4
			pixels[offset] = rgb[0]
			pixels[offset + 1] = rgb[1]
			pixels[offset + 2] = rgb[2]
			pixels[offset + 3] = 255
		})

		context.putImageData(imageData, 0, 0)
		texture.update()
		return texture
	}

	private getGroundTypeIndex(gid: number, tilesets: MapTileset[]): number {
		if (!gid) return 0
		const tileset = this.findTilesetForGid(tilesets, gid)
		if (!tileset) return 0
		const localId = gid - tileset.firstGid
		if (localId < 0) return 0
		const columns =
			tileset.columns ||
			Math.max(1, Math.floor(tileset.imageWidth / Math.max(1, tileset.tileWidth)))
		if (!columns) return 0
		const column = localId % columns
		if (column < 0 || column >= GROUND_TYPE_ORDER.length) return 0
		return column + 1
	}

	private buildGroundTypeGrid(
		layer: MapLayer,
		mapWidth: number,
		mapHeight: number,
		tilesets: MapTileset[]
	): number[] | null {
		const totalTiles = mapWidth * mapHeight
		const data = layer.data || []
		if (totalTiles <= 0 || data.length < totalTiles) return null

		const sortedTilesets = tilesets
			.filter((tileset) => typeof tileset.firstGid === 'number')
			.sort((a, b) => a.firstGid - b.firstGid)

		const grid = new Array<number>(totalTiles)
		for (let i = 0; i < totalTiles; i += 1) {
			const rawGid = data[i] || 0
			const gid = rawGid & 0x1fffffff
			grid[i] = this.getGroundTypeIndex(gid, sortedTilesets)
		}
		return grid
	}

	private buildTypeBoundarySegments(
		grid: number[],
		width: number,
		height: number,
		typeIndex: number
	): ContourSegment[] {
		const segments: ContourSegment[] = []
		for (let y = 0; y < height; y += 1) {
			for (let x = 0; x < width; x += 1) {
				const idx = y * width + x
				const type = grid[idx]
				if (type !== typeIndex) continue

				const leftType = x > 0 ? grid[idx - 1] : 0
				const rightType = x + 1 < width ? grid[idx + 1] : 0
				const downType = y > 0 ? grid[idx - width] : 0
				const upType = y + 1 < height ? grid[idx + width] : 0

				if (downType !== typeIndex) {
					segments.push({ startX: x, startY: y, endX: x + 1, endY: y })
				}
				if (rightType !== typeIndex) {
					segments.push({ startX: x + 1, startY: y, endX: x + 1, endY: y + 1 })
				}
				if (upType !== typeIndex) {
					segments.push({ startX: x + 1, startY: y + 1, endX: x, endY: y + 1 })
				}
				if (leftType !== typeIndex) {
					segments.push({ startX: x, startY: y + 1, endX: x, endY: y })
				}
			}
		}
		return segments
	}

	private buildPolylinesFromSegments(segments: ContourSegment[]): ContourPolyline[] {
		const startMap = new Map<string, number[]>()
		const directions: number[] = new Array(segments.length)

		segments.forEach((segment, index) => {
			const dx = Math.sign(segment.endX - segment.startX)
			const dy = Math.sign(segment.endY - segment.startY)
			let dir = 0
			if (dx === 1 && dy === 0) dir = 0 // east
			else if (dx === 0 && dy === 1) dir = 1 // south (y increases downward in tile grid)
			else if (dx === -1 && dy === 0) dir = 2 // west
			else if (dx === 0 && dy === -1) dir = 3 // north
			directions[index] = dir

			const startKey = `${segment.startX},${segment.startY}`
			const startList = startMap.get(startKey)
			if (startList) {
				startList.push(index)
			} else {
				startMap.set(startKey, [index])
			}
		})

		const visited = new Array<boolean>(segments.length).fill(false)
		const polylines: ContourPolyline[] = []

		for (let i = 0; i < segments.length; i += 1) {
			if (visited[i]) continue
			const segment = segments[i]
			visited[i] = true
			const points = [{ x: segment.startX, y: segment.startY }, { x: segment.endX, y: segment.endY }]
			const startPoint = points[0]
			let currentX = segment.endX
			let currentY = segment.endY
			let currentDir = directions[i]
			let closed = false

			for (let safety = 0; safety < segments.length; safety += 1) {
				if (currentX === startPoint.x && currentY === startPoint.y) {
					closed = true
					break
				}
				const key = `${currentX},${currentY}`
				const list = startMap.get(key)
				if (!list || list.length === 0) break

				const turnOrder = this.getTurnOrder(currentDir)
				let nextIndex: number | undefined
				for (const dir of turnOrder) {
					for (let li = 0; li < list.length; li += 1) {
						const candidate = list[li]
						if (visited[candidate]) continue
						if (directions[candidate] === dir) {
							nextIndex = candidate
							list.splice(li, 1)
							break
						}
					}
					if (nextIndex !== undefined) break
				}
				if (nextIndex === undefined) break

				const nextSegment = segments[nextIndex]
				visited[nextIndex] = true
				points.push({ x: nextSegment.endX, y: nextSegment.endY })
				currentX = nextSegment.endX
				currentY = nextSegment.endY
				currentDir = directions[nextIndex]
			}

			if (points.length >= 2) {
				polylines.push({ points, closed })
			}
		}

		return polylines
	}

	private getTurnOrder(dir: number): number[] {
		const right = (dir + 1) % 4
		const straight = dir
		const left = (dir + 3) % 4
		const back = (dir + 2) % 4
		// Right-hand rule: edges are oriented clockwise in grid coords (y down),
		// so keep interior on the right to trace boundaries consistently.
		return [right, straight, left, back]
	}

	private prepareContourLoops(
		polylines: ContourPolyline[],
		typeIndex: number,
		typeLabel: GroundType,
		smoothingIterations: number,
		allowFallback: boolean
	): {
		points: { x: number; y: number }[]
		area: number
		absArea: number
		minX: number
		minY: number
		maxX: number
		maxY: number
		sample: { x: number; y: number }
	}[] {
		const records: {
			points: { x: number; y: number }[]
			area: number
			absArea: number
			minX: number
			minY: number
			maxX: number
			maxY: number
			sample: { x: number; y: number }
		}[] = []

		polylines.forEach((polyline, index) => {
			if (!polyline.closed) {
				return
			}
			const points = polyline.points
			if (points.length < 3) return
			const baseCleaned = this.dropDuplicatePoints(points, polyline.closed)
			if (baseCleaned.length < 3) return
			const selection = allowFallback
				? this.trySmoothLoop(
						baseCleaned,
						polyline.closed,
						smoothingIterations,
						typeLabel,
						index,
						false,
						baseCleaned
					)
				: this.trySmoothLoop(
						baseCleaned,
						polyline.closed,
						smoothingIterations,
						typeLabel,
						index,
						true
					)
			if (!selection) return
			const cleaned = selection.points

			const area = this.computePolygonArea(cleaned)
			let minX = cleaned[0].x
			let minY = cleaned[0].y
			let maxX = cleaned[0].x
			let maxY = cleaned[0].y
			for (let i = 1; i < cleaned.length; i += 1) {
				const point = cleaned[i]
				minX = Math.min(minX, point.x)
				minY = Math.min(minY, point.y)
				maxX = Math.max(maxX, point.x)
				maxY = Math.max(maxY, point.y)
			}
			if (allowFallback && selection.iterations < smoothingIterations) {
				console.info(
					`[GroundMesh] type=${typeLabel} polyline fallback index=${index} iter=${selection.iterations}`
				)
			}

			records.push({
				points: cleaned,
				area,
				absArea: Math.abs(area),
				minX,
				minY,
				maxX,
				maxY,
				sample: cleaned[0]
			})
		})

		if (records.length > 1 && smoothingIterations === 0) {
			const totalArea = records.reduce((sum, record) => sum + record.absArea, 0)
			console.info(
				`[GroundMesh] type=${typeLabel} loops=${records.length} totalArea=${totalArea.toFixed(1)}`
			)
		}

		return records
	}

	private trySmoothLoop(
		points: { x: number; y: number }[],
		closed: boolean,
		maxIterations: number,
		typeLabel: GroundType,
		index: number,
		requireExact: boolean = false,
		basePolygon?: { x: number; y: number }[]
	): { points: { x: number; y: number }[]; iterations: number } | null {
		const startIter = Math.max(0, Math.floor(maxIterations))
		const endIter = requireExact ? startIter : 0
		for (let iter = startIter; iter >= endIter; iter -= 1) {
			const smoothed = iter > 0 ? this.chaikinSmooth2D(points, closed, iter) : points
			const cleaned = this.dropDuplicatePoints(smoothed, closed)
			if (cleaned.length < 3) continue
			if (basePolygon && iter > 0) {
				let inside = true
				for (const point of cleaned) {
					if (!this.isPointInsideOrOnPolygon(point, basePolygon, 1e-3)) {
						inside = false
						break
					}
				}
				if (!inside) {
					continue
				}
			}
			if (DEBUG_VALIDATE_POLYGONS) {
				const validationPoints = this.sampleContourPoints(
					cleaned,
					DEBUG_GROUND_CONTOUR_MAX_POINTS
				)
				if (this.isSelfIntersecting(validationPoints)) {
					console.warn(
						`[GroundMesh] type=${typeLabel} polyline self-intersects index=${index} points=${validationPoints.length}`
					)
					if (DEBUG_SKIP_SELF_INTERSECTING_POLYGONS) {
						continue
					}
				}
			}
			return { points: cleaned, iterations: iter }
		}
		return null
	}

	private groupLoopsWithHoles(
		loops: {
			points: { x: number; y: number }[]
			area: number
			absArea: number
			minX: number
			minY: number
			maxX: number
			maxY: number
			sample: { x: number; y: number }
		}[]
	): { outer: { x: number; y: number }[]; holes: { x: number; y: number }[][] }[] {
		if (loops.length === 0) return []

		const depths = new Array<number>(loops.length).fill(0)
		for (let i = 0; i < loops.length; i += 1) {
			const point = loops[i].sample
			for (let j = 0; j < loops.length; j += 1) {
				if (i === j) continue
				const other = loops[j]
				if (
					point.x < other.minX ||
					point.x > other.maxX ||
					point.y < other.minY ||
					point.y > other.maxY
				) {
					continue
				}
				if (this.pointInPolygon(point, other.points)) {
					depths[i] += 1
				}
			}
		}

		const groups: { outer: { x: number; y: number }[]; holes: { x: number; y: number }[][] }[] = []
		const outers: { index: number; area: number; absArea: number }[] = []

		for (let i = 0; i < loops.length; i += 1) {
			if (depths[i] % 2 === 0) {
				outers.push({ index: i, area: loops[i].area, absArea: loops[i].absArea })
			}
		}

		outers.sort((a, b) => a.absArea - b.absArea)

		for (const outer of outers) {
			const outerLoop = loops[outer.index]
			const outerPoints = this.ensureClockwise(outerLoop.points)
			groups.push({ outer: outerPoints, holes: [] })
		}

		for (let i = 0; i < loops.length; i += 1) {
			if (depths[i] % 2 === 0) continue
			const holeLoop = loops[i]
			const point = holeLoop.sample
			let parentIndex = -1
			let parentArea = Infinity
			for (let g = 0; g < groups.length; g += 1) {
				const outer = groups[g].outer
				if (!this.pointInPolygon(point, outer)) continue
				const area = Math.abs(this.computePolygonArea(outer))
				if (area < parentArea) {
					parentArea = area
					parentIndex = g
				}
			}
			if (parentIndex >= 0) {
				groups[parentIndex].holes.push(this.ensureCounterClockwise(holeLoop.points))
			}
		}

		return groups
	}

	private buildContourMeshes(
		groups: { outer: { x: number; y: number }[]; holes: { x: number; y: number }[][] }[],
		typeIndex: number,
		y: number,
		tileWidth: number,
		tileHeight: number,
		meshes: Mesh[],
		variant: 'base' | 'smooth'
	): void {
		groups.forEach((group, index) => {
			if (group.outer.length < 3) return
			const shape = group.outer.map(
				(point) => new Vector3(point.x * tileWidth, y, point.y * tileHeight)
			)
			const holes = group.holes.map((hole) =>
				hole.map((point) => new Vector3(point.x * tileWidth, y, point.y * tileHeight))
			)
			try {
				const mesh = MeshBuilder.CreatePolygon(
					`ground-type-${typeIndex}-${index}-${Math.round(y * 1000)}`,
					{
						shape,
						holes: holes.length > 0 ? holes : undefined,
						updatable: false,
						depth: 0,
						sideOrientation: Mesh.FRONTSIDE
					},
					this.scene,
					earcut
				)
				mesh.material = this.getGroundTypeMaterial(typeIndex, variant)
				mesh.isPickable = false
				mesh.position.y = y
				meshes.push(mesh)
			} catch (error) {
				console.warn(
					`[GroundMesh] polygon failed type=${GROUND_TYPE_ORDER[typeIndex - 1]} index=${index}`,
					error
				)
			}
		})
	}

	private ensureClockwise(points: { x: number; y: number }[]): { x: number; y: number }[] {
		const area = this.computePolygonArea(points)
		if (area > 0) return points
		return points.slice().reverse()
	}

	private ensureCounterClockwise(points: { x: number; y: number }[]): { x: number; y: number }[] {
		const area = this.computePolygonArea(points)
		if (area < 0) return points
		return points.slice().reverse()
	}

	private createContourDebugMeshes(
		polylines: ContourPolyline[],
		tileWidth: number,
		tileHeight: number,
		y: number,
		label: string
	): Mesh[] {
		const closedLines: Vector3[][] = []
		const openLines: Vector3[][] = []

		for (const polyline of polylines) {
			const sampled = this.sampleContourPoints(polyline.points, DEBUG_GROUND_CONTOUR_MAX_POINTS)
			if (sampled.length < 2) continue
			const line = sampled.map((point) => new Vector3(point.x * tileWidth, y, point.y * tileHeight))
			if (polyline.closed) {
				line.push(line[0])
				closedLines.push(line)
			} else {
				openLines.push(line)
			}
		}

		const result: Mesh[] = []
		if (closedLines.length > 0) {
			const mesh = MeshBuilder.CreateLineSystem(
				`${label}-contours-closed`,
				{ lines: closedLines, updatable: false },
				this.scene
			)
			mesh.color = new Color3(1, 1, 1)
			mesh.isPickable = false
			result.push(mesh)
		}
		if (openLines.length > 0) {
			const mesh = MeshBuilder.CreateLineSystem(
				`${label}-contours-open`,
				{ lines: openLines, updatable: false },
				this.scene
			)
			mesh.color = new Color3(1, 0.2, 0.2)
			mesh.isPickable = false
			result.push(mesh)
		}
		return result
	}

	private sampleContourPoints(
		points: { x: number; y: number }[],
		maxPoints: number
	): { x: number; y: number }[] {
		if (points.length <= maxPoints) return points
		const step = Math.ceil(points.length / maxPoints)
		const sampled: { x: number; y: number }[] = []
		for (let i = 0; i < points.length; i += step) {
			sampled.push(points[i])
		}
		const last = points[points.length - 1]
		const final = sampled[sampled.length - 1]
		if (!final || final.x !== last.x || final.y !== last.y) {
			sampled.push(last)
		}
		return sampled
	}

	private pointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
		let inside = false
		for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
			const xi = polygon[i].x
			const yi = polygon[i].y
			const xj = polygon[j].x
			const yj = polygon[j].y
			const intersect =
				yi > point.y !== yj > point.y &&
				point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi
			if (intersect) inside = !inside
		}
		return inside
	}

	private isPointInsideOrOnPolygon(
		point: { x: number; y: number },
		polygon: { x: number; y: number }[],
		epsilon: number
	): boolean {
		if (this.pointInPolygon(point, polygon)) return true
		const epsilonSq = epsilon * epsilon
		for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
			const a = polygon[j]
			const b = polygon[i]
			const distSq = this.distanceSquaredPointToSegment(point, a, b)
			if (distSq <= epsilonSq) return true
		}
		return false
	}

	private distanceSquaredPointToSegment(
		point: { x: number; y: number },
		a: { x: number; y: number },
		b: { x: number; y: number }
	): number {
		const abx = b.x - a.x
		const aby = b.y - a.y
		const apx = point.x - a.x
		const apy = point.y - a.y
		const abLenSq = abx * abx + aby * aby
		if (abLenSq === 0) {
			return apx * apx + apy * apy
		}
		let t = (apx * abx + apy * aby) / abLenSq
		t = Math.max(0, Math.min(1, t))
		const closestX = a.x + abx * t
		const closestY = a.y + aby * t
		const dx = point.x - closestX
		const dy = point.y - closestY
		return dx * dx + dy * dy
	}

	private isSelfIntersecting(points: { x: number; y: number }[]): boolean {
		const count = points.length
		if (count < 4) return false

		for (let i = 0; i < count; i += 1) {
			const a = points[i]
			const b = points[(i + 1) % count]
			for (let j = i + 1; j < count; j += 1) {
				if (Math.abs(i - j) <= 1) continue
				if (i === 0 && j === count - 1) continue
				const c = points[j]
				const d = points[(j + 1) % count]
				if (this.segmentsIntersect(a, b, c, d)) {
					return true
				}
			}
		}
		return false
	}

	private segmentsIntersect(
		a: { x: number; y: number },
		b: { x: number; y: number },
		c: { x: number; y: number },
		d: { x: number; y: number }
	): boolean {
		const orient = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
			(q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
		const onSegment = (p: { x: number; y: number }, q: { x: number; y: number }, r: { x: number; y: number }) =>
			Math.min(p.x, r.x) <= q.x &&
			q.x <= Math.max(p.x, r.x) &&
			Math.min(p.y, r.y) <= q.y &&
			q.y <= Math.max(p.y, r.y)

		const o1 = orient(a, b, c)
		const o2 = orient(a, b, d)
		const o3 = orient(c, d, a)
		const o4 = orient(c, d, b)

		if (o1 === 0 && onSegment(a, c, b)) return true
		if (o2 === 0 && onSegment(a, d, b)) return true
		if (o3 === 0 && onSegment(c, a, d)) return true
		if (o4 === 0 && onSegment(c, b, d)) return true

		return (o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)
	}

	private chaikinSmooth2D(
		points: { x: number; y: number }[],
		closed: boolean,
		iterations: number
	): { x: number; y: number }[] {
		let current = points
		for (let iter = 0; iter < iterations; iter += 1) {
			if (current.length < 2) return current
			const next: { x: number; y: number }[] = []
			if (!closed) {
				next.push(current[0])
			}
			const count = current.length
			const lastIndex = closed ? count : count - 1
			for (let i = 0; i < lastIndex; i += 1) {
				const p0 = current[i]
				const p1 = current[(i + 1) % count]
				const q = { x: p0.x * 0.75 + p1.x * 0.25, y: p0.y * 0.75 + p1.y * 0.25 }
				const r = { x: p0.x * 0.25 + p1.x * 0.75, y: p0.y * 0.25 + p1.y * 0.75 }
				next.push(q, r)
			}
			if (!closed) {
				next.push(current[count - 1])
			}
			current = next
		}
		return current
	}

	private dropDuplicatePoints(
		points: { x: number; y: number }[],
		closed: boolean
	): { x: number; y: number }[] {
		if (points.length === 0) return points
		const result: { x: number; y: number }[] = []
		const epsilon = 1e-4
		const isSame = (a: { x: number; y: number }, b: { x: number; y: number }) =>
			Math.abs(a.x - b.x) < epsilon && Math.abs(a.y - b.y) < epsilon

		for (let i = 0; i < points.length; i += 1) {
			const point = points[i]
			if (result.length === 0 || !isSame(result[result.length - 1], point)) {
				result.push(point)
			}
		}
		if (closed && result.length > 1 && isSame(result[0], result[result.length - 1])) {
			result.pop()
		}
		return result
	}

	private computePolygonArea(points: { x: number; y: number }[]): number {
		let area = 0
		for (let i = 0; i < points.length; i += 1) {
			const p0 = points[i]
			const p1 = points[(i + 1) % points.length]
			area += p0.x * p1.y - p1.x * p0.y
		}
		return area * 0.5
	}

	private getGroundTypeMaterial(typeIndex: number): StandardMaterial
	private getGroundTypeMaterial(typeIndex: number, variant: 'base' | 'smooth'): StandardMaterial
	private getGroundTypeMaterial(
		typeIndex: number,
		variant: 'base' | 'smooth' = 'base'
	): StandardMaterial {
		const materials = variant === 'smooth' ? this.groundTypeSmoothMaterials : this.groundTypeMaterials
		const existing = materials.get(typeIndex)
		if (existing) return existing

		const type = GROUND_TYPE_ORDER[typeIndex - 1]
		const hex = type ? GROUND_TYPE_COLORS[type] : '#111111'
		const rgb = this.hexToRgb(hex)
		const material = new StandardMaterial(`ground-type-${typeIndex}-${variant}-mat`, this.scene)
		material.diffuseColor = new Color3(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
		material.emissiveColor = new Color3(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255)
		material.specularColor = Color3.Black()
		material.disableLighting = true
		material.backFaceCulling = false
		if (variant === 'smooth') {
			material.disableDepthWrite = true
		}
		materials.set(typeIndex, material)
		return material
	}

	private hexToRgb(hex: string): [number, number, number] {
		const clean = hex.replace('#', '').trim()
		if (clean.length === 3) {
			const r = parseInt(clean[0] + clean[0], 16)
			const g = parseInt(clean[1] + clean[1], 16)
			const b = parseInt(clean[2] + clean[2], 16)
			return [r, g, b]
		}
		const r = parseInt(clean.slice(0, 2), 16)
		const g = parseInt(clean.slice(2, 4), 16)
		const b = parseInt(clean.slice(4, 6), 16)
		return [r, g, b]
	}

	private async loadTilesetImages(
		tilesets: MapTileset[],
		mapUrl: string
	): Promise<Map<string, HTMLImageElement>> {
		const results = new Map<string, HTMLImageElement>()
		const uniqueImages = Array.from(new Set(tilesets.map((tileset) => tileset.image)))
		await Promise.all(
			uniqueImages.map(
				(imagePath) =>
					new Promise<void>((resolve) => {
						const image = new Image()
						image.crossOrigin = 'anonymous'
						image.onload = () => {
							results.set(imagePath, image)
							resolve()
						}
						image.onerror = () => resolve()
						image.src = this.resolveTilesetUrl(imagePath, mapUrl)
					})
			)
		)
		return results
	}

	private resolveTilesetUrl(imagePath: string, mapUrl: string): string {
		if (/^https?:\/\//i.test(imagePath) || imagePath.startsWith('data:')) {
			return imagePath
		}
		try {
			const baseUrl = new URL(mapUrl, window.location.href)
			return new URL(imagePath, baseUrl).toString()
		} catch (error) {
			const cleanMapUrl = mapUrl.split('?')[0]?.split('#')[0] || ''
			const lastSlash = cleanMapUrl.lastIndexOf('/')
			if (lastSlash === -1) return imagePath
			return `${cleanMapUrl.slice(0, lastSlash + 1)}${imagePath}`
		}
	}

	private findTilesetForGid(tilesets: MapTileset[], gid: number): MapTileset | null {
		for (let index = tilesets.length - 1; index >= 0; index -= 1) {
			const tileset = tilesets[index]
			if (gid >= tileset.firstGid) {
				return tileset
			}
		}
		return null
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
