import { EventBus } from '../EventBus'
import { Event, BuildingDefinition, ResourceNodeDefinition, MapObject } from '@rugged/game'
import { UiEvents } from '../uiEvents'
import { AbstractMesh, Color3, SceneLoader, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core'
import '@babylonjs/loaders'
import type { GameScene } from '../scenes/base/GameScene'
import type { PointerState } from '../input/InputManager'
import { rotateVec3 } from '../../shared/transform'
import { itemService } from '../services/ItemService'

const CONTENT_FOLDER = import.meta.env.VITE_GAME_CONTENT || 'settlerpolis'
const contentModules = import.meta.glob('../../../../../content/*/index.ts', { eager: true })
const content = contentModules[`../../../../../content/${CONTENT_FOLDER}/index.ts`]
const HALF_PI = Math.PI / 2
const GHOST_VISIBILITY = 1
const GHOST_TINT_VALID = '#6fbf6a'
const GHOST_TINT_INVALID = '#e05c5c'
const GHOST_EMISSIVE_VALID = new Color3(0.2, 0.6, 0.2)
const GHOST_EMISSIVE_INVALID = new Color3(0.7, 0.2, 0.2)
const GHOST_MODEL_ALPHA = 0.6

interface BuildingPlacementState {
	selectedBuildingId: string | null
	isValidPosition: boolean
	lastMousePosition: { x: number; y: number } | null
	rotationStep: number
}

export class BuildingPlacementManager {
	private scene: GameScene
	private state: BuildingPlacementState = {
		selectedBuildingId: null,
		isValidPosition: true,
		lastMousePosition: null,
		rotationStep: 0
	}
	private buildings: Map<string, BuildingDefinition> = new Map()
	private resourceNodes: Map<string, ResourceNodeDefinition> = new Map()
	private tileSize: number = 32
	private ghostRoot: TransformNode | null = null
	private ghostBaseMesh: AbstractMesh | null = null
	private ghostBaseMaterial: StandardMaterial | null = null
	private ghostModelMaterialValid: StandardMaterial | null = null
	private ghostModelMaterialInvalid: StandardMaterial | null = null
	private ghostModelRoot: TransformNode | null = null
	private ghostModelPivot: TransformNode | null = null
	private ghostMeshes: AbstractMesh[] = []
	private ghostRender: BuildingDefinition['render'] | null = null
	private ghostLoadToken = 0
	private selectHandler: ((data: { buildingId: string }) => void) | null = null
	private cancelHandler: (() => void) | null = null
	private placedHandler: (() => void) | null = null
	private handlersActive = false

	constructor(scene: GameScene) {
		this.scene = scene
		this.loadBuildings()
		this.loadResourceNodes()
		this.setupEventListeners()
	}

	private loadBuildings() {
		if (content?.buildings) {
			content.buildings.forEach((building: BuildingDefinition) => {
				this.buildings.set(building.id, building)
			})
		}
	}

	private loadResourceNodes() {
		if (content?.resourceNodeDefinitions) {
			content.resourceNodeDefinitions.forEach((node: ResourceNodeDefinition) => {
				this.resourceNodes.set(node.id, node)
			})
		}
	}

	private setupEventListeners() {
		const catalogHandler = (data: { buildings: BuildingDefinition[] }) => {
			if (data.buildings) {
				this.buildings.clear()
				data.buildings.forEach((building: BuildingDefinition) => {
					this.buildings.set(building.id, building)
				})
			}
		}
		EventBus.on(Event.Buildings.SC.Catalog, catalogHandler)

		this.selectHandler = (data: { buildingId: string }) => {
			this.selectBuilding(data.buildingId)
		}
		EventBus.on(UiEvents.Construction.Select, this.selectHandler)

		this.cancelHandler = () => {
			this.cancelSelection()
		}
		EventBus.on(UiEvents.Construction.Cancel, this.cancelHandler)

		this.placedHandler = () => {
			this.cancelSelection()
		}
		EventBus.on(Event.Buildings.SC.Placed, this.placedHandler)
	}

	private selectBuilding(buildingId: string) {
		this.state.selectedBuildingId = buildingId
		this.state.rotationStep = 0
		this.createGhostMesh()
		this.setupMouseHandlers()
	}

	private cancelSelection() {
		this.state.selectedBuildingId = null
		this.destroyGhostMesh()
		this.removeMouseHandlers()
	}

	private createGhostMesh() {
		if (!this.state.selectedBuildingId) return
		const building = this.buildings.get(this.state.selectedBuildingId)
		if (!building) return

		this.destroyGhostMesh()

		this.ghostRoot = new TransformNode('building-ghost-root', this.scene.runtime.renderer.scene)
		this.ghostRoot.setEnabled(true)
		this.ghostRender = building.render || null

		this.rebuildGhostBaseMesh(building)
		if (building.render?.modelSrc) {
			void this.loadGhostModel(building)
		}

		this.setInitialGhostPosition()
	}

	private destroyGhostMesh() {
		this.ghostLoadToken += 1
		this.ghostRender = null
		if (this.ghostRoot) {
			this.ghostRoot.dispose()
		}
		this.ghostRoot = null
		this.ghostBaseMesh = null
		if (this.ghostBaseMaterial) {
			this.ghostBaseMaterial.dispose()
		}
		this.ghostBaseMaterial = null
		if (this.ghostModelMaterialValid) {
			this.ghostModelMaterialValid.dispose()
		}
		if (this.ghostModelMaterialInvalid) {
			this.ghostModelMaterialInvalid.dispose()
		}
		this.ghostModelMaterialValid = null
		this.ghostModelMaterialInvalid = null
		this.ghostModelRoot = null
		this.ghostModelPivot = null
		this.ghostMeshes = []
	}

	private updateGhostPosition(worldX: number, worldY: number) {
		if (!this.ghostRoot || !this.state.selectedBuildingId) return
		const building = this.buildings.get(this.state.selectedBuildingId)
		if (!building) return

		const tileSize = this.scene.map?.tileWidth || this.tileSize
		const snappedX = Math.floor(worldX / tileSize) * tileSize
		const snappedY = Math.floor(worldY / tileSize) * tileSize
		this.state.lastMousePosition = { x: snappedX, y: snappedY }
		this.state.isValidPosition = this.isPlacementValid(snappedX, snappedY, building)

		const footprint = this.getRotatedFootprint(building)
		const centerX = snappedX + (footprint.width * tileSize) / 2
		const centerY = snappedY + (footprint.height * tileSize) / 2
		this.ghostRoot.position = new Vector3(centerX, tileSize * 0.5, centerY)
		this.updateGhostTint()
	}

	private setInitialGhostPosition(): void {
		const world = this.scene.runtime.input.getWorldPoint()
		if (world) {
			this.updateGhostPosition(world.x, world.z)
			return
		}
		const player = this.scene.player?.view
		if (player) {
			this.updateGhostPosition(player.x, player.y)
			return
		}
		this.updateGhostPosition(0, 0)
	}

	private getPlacementRotation(): number {
		return this.state.rotationStep * HALF_PI
	}

	private getRotatedFootprint(building: BuildingDefinition): { width: number; height: number } {
		if (this.state.rotationStep % 2 === 0) {
			return { width: building.footprint.width, height: building.footprint.height }
		}
		return { width: building.footprint.height, height: building.footprint.width }
	}

	private rotatePlacement(): void {
		if (!this.state.selectedBuildingId) return
		const building = this.buildings.get(this.state.selectedBuildingId)
		if (!building) return
		this.state.rotationStep = (this.state.rotationStep + 1) % 4
		if (!building.render?.modelSrc) {
			this.rebuildGhostBaseMesh(building)
		}
		this.applyGhostTransform()
		if (this.state.lastMousePosition) {
			this.updateGhostPosition(this.state.lastMousePosition.x, this.state.lastMousePosition.y)
		}
	}

	private rebuildGhostBaseMesh(building: BuildingDefinition): void {
		if (!this.ghostRoot) return
		if (this.ghostBaseMesh) {
			this.ghostBaseMesh.dispose()
		}
		const tileSize = this.scene.map?.tileWidth || this.tileSize
		const footprint = this.getRotatedFootprint(building)
		const width = footprint.width * tileSize
		const length = footprint.height * tileSize
		const size = { width, length, height: tileSize }
		const mesh = this.scene.runtime.renderer.createBox('building-ghost', size)
		mesh.parent = this.ghostRoot
		mesh.visibility = GHOST_VISIBILITY
		mesh.isPickable = false
		mesh.isVisible = true
		mesh.setEnabled(true)
		mesh.alwaysSelectAsActiveMesh = true
		mesh.renderOutline = true
		mesh.outlineWidth = 0.08
		mesh.outlineColor = Color3.White()
		if (!this.ghostBaseMaterial) {
			this.ghostBaseMaterial = new StandardMaterial('building-ghost-base', this.scene.runtime.renderer.scene)
			this.ghostBaseMaterial.diffuseColor = Color3.FromHexString(GHOST_TINT_VALID)
			this.ghostBaseMaterial.emissiveColor = GHOST_EMISSIVE_VALID
			this.ghostBaseMaterial.specularColor = Color3.Black()
			this.ghostBaseMaterial.alpha = 0.25
			this.ghostBaseMaterial.disableDepthWrite = true
		}
		mesh.material = this.ghostBaseMaterial
		this.ghostBaseMesh = mesh
		this.updateGhostTint()
	}

	private async loadGhostModel(building: BuildingDefinition): Promise<void> {
		if (!this.ghostRoot || !building.render?.modelSrc) return
		const token = ++this.ghostLoadToken
		this.ghostRender = building.render
		const { rootUrl, fileName } = splitAssetUrl(building.render.modelSrc)
		try {
			await (async () => {
				const scene = this.scene.runtime.renderer.scene
				if (isSceneDisposed(scene)) {
					return
				}
				const result = await SceneLoader.ImportMeshAsync('', rootUrl, fileName, scene)
				if (!this.ghostRoot || token !== this.ghostLoadToken || isSceneDisposed(scene)) {
					result.meshes.forEach((mesh) => mesh.dispose(false, true))
					result.transformNodes?.forEach((node) => node.dispose())
					return
				}
				this.ghostModelRoot = new TransformNode(`building-ghost-model-${building.id}`, scene)
				this.ghostModelPivot = new TransformNode(`building-ghost-pivot-${building.id}`, scene)
				this.ghostModelPivot.parent = this.ghostModelRoot
				this.ghostMeshes = result.meshes
				this.ghostMeshes.forEach((mesh) => {
					this.applyGhostMeshAppearance(mesh)
					mesh.setEnabled(true)
					mesh.refreshBoundingInfo()
					mesh.computeWorldMatrix(true)
				})
				result.meshes.forEach((mesh) => {
					if (mesh.parent === null) {
						mesh.parent = this.ghostModelPivot
					}
				})
				result.transformNodes?.forEach((node) => {
					if (node.parent === null) {
						node.parent = this.ghostModelPivot
					}
					node.setEnabled(true)
				})
				this.centerGhostModel()
				this.ghostModelRoot.parent = this.ghostRoot
				this.applyGhostTransform()
				this.updateGhostTint()
				if (this.ghostBaseMesh && this.ghostMeshes.length > 0) {
					this.ghostBaseMesh.visibility = 0
				}
			})()
		} catch (error) {
			if (this.ghostRoot) {
				this.rebuildGhostBaseMesh(building)
			}
		}
	}

	private applyGhostTransform(): void {
		if (!this.ghostModelRoot || !this.ghostRender) return
		const transform = this.ghostRender.transform || {}
		const rotation = transform.rotation ?? { x: 0, y: 0, z: 0 }
		const placementRotation = this.getPlacementRotation()
		const scale = transform.scale ?? { x: 1, y: 1, z: 1 }
		const elevation = transform.elevation ?? 0
		const offset = transform.offset ?? { x: 0, y: 0, z: 0 }
		const tileSize = this.scene.map?.tileWidth || this.tileSize
		const finalRotation = {
			x: rotation.x ?? 0,
			y: (rotation.y ?? 0) + placementRotation,
			z: rotation.z ?? 0
		}
		const rotatedOffset = rotateVec3(offset, finalRotation)
		this.ghostModelRoot.position = new Vector3(
			rotatedOffset.x * tileSize,
			-tileSize * 0.5 + (elevation + rotatedOffset.y) * tileSize,
			rotatedOffset.z * tileSize
		)
		this.ghostModelRoot.rotation = new Vector3(finalRotation.x, finalRotation.y, finalRotation.z)
		this.ghostModelRoot.scaling = new Vector3(
			(scale.x ?? 1) * tileSize,
			(scale.y ?? 1) * tileSize,
			(scale.z ?? 1) * tileSize
		)
	}

	private centerGhostModel(): void {
		if (!this.ghostModelPivot || this.ghostMeshes.length === 0) return
		const bounds = getBounds(this.ghostMeshes)
		if (!bounds) return
		const center = bounds.min.add(bounds.max).scale(0.5)
		this.ghostModelPivot.position = new Vector3(-center.x, -bounds.min.y, -center.z)
	}

	private applyGhostMeshAppearance(mesh: AbstractMesh): void {
		mesh.isPickable = false
		mesh.isVisible = true
		mesh.visibility = GHOST_VISIBILITY
		mesh.alwaysSelectAsActiveMesh = true
		mesh.material = this.getGhostModelMaterial(this.state.isValidPosition)
	}

	private getGhostModelMaterial(isValid: boolean): StandardMaterial {
		if (isValid) {
			if (!this.ghostModelMaterialValid) {
				const material = new StandardMaterial('building-ghost-model-valid', this.scene.runtime.renderer.scene)
				material.diffuseColor = Color3.FromHexString(GHOST_TINT_VALID)
				material.emissiveColor = GHOST_EMISSIVE_VALID
				material.specularColor = Color3.Black()
				material.alpha = GHOST_MODEL_ALPHA
				this.ghostModelMaterialValid = material
			}
			return this.ghostModelMaterialValid
		}
		if (!this.ghostModelMaterialInvalid) {
			const material = new StandardMaterial('building-ghost-model-invalid', this.scene.runtime.renderer.scene)
			material.diffuseColor = Color3.FromHexString(GHOST_TINT_INVALID)
			material.emissiveColor = GHOST_EMISSIVE_INVALID
			material.specularColor = Color3.Black()
			material.alpha = GHOST_MODEL_ALPHA
			this.ghostModelMaterialInvalid = material
		}
		return this.ghostModelMaterialInvalid
	}

	private updateGhostTint(): void {
		const isValid = this.state.isValidPosition
		if (this.ghostBaseMesh) {
			if (this.ghostBaseMaterial) {
				this.ghostBaseMaterial.diffuseColor = Color3.FromHexString(isValid ? GHOST_TINT_VALID : GHOST_TINT_INVALID)
				this.ghostBaseMaterial.emissiveColor = isValid ? GHOST_EMISSIVE_VALID : GHOST_EMISSIVE_INVALID
			} else {
				this.scene.runtime.renderer.applyTint(this.ghostBaseMesh, isValid ? GHOST_TINT_VALID : GHOST_TINT_INVALID)
			}
		}
		if (this.ghostMeshes.length > 0) {
			const material = this.getGhostModelMaterial(isValid)
			this.ghostMeshes.forEach((mesh) => {
				mesh.material = material
			})
		}
	}

	private isPlacementValid(worldX: number, worldY: number, building: BuildingDefinition): boolean {
		const map = this.scene.map
		if (!map) {
			return true
		}

		const tileSize = map.tileWidth || this.tileSize
		const footprint = this.getRotatedFootprint(building)
		const startTileX = Math.floor(worldX / tileSize)
		const startTileY = Math.floor(worldY / tileSize)
		const mapWidthTiles = Math.floor(map.widthInPixels / tileSize)
		const mapHeightTiles = Math.floor(map.heightInPixels / tileSize)
		const collisionGrid = this.scene.getCollisionGrid()
		const allowedGroundTypes = building.allowedGroundTypes || []
		const enforceGroundTypes = allowedGroundTypes.length > 0

		for (let tileY = 0; tileY < footprint.height; tileY += 1) {
			for (let tileX = 0; tileX < footprint.width; tileX += 1) {
				const checkTileX = startTileX + tileX
				const checkTileY = startTileY + tileY

				if (
					checkTileX < 0 ||
					checkTileY < 0 ||
					checkTileX >= mapWidthTiles ||
					checkTileY >= mapHeightTiles
				) {
					return false
				}

				if (this.scene.hasRoadAt(checkTileX, checkTileY) || this.scene.hasPendingRoadAt(checkTileX, checkTileY)) {
					return false
				}

				const groundType = this.scene.runtime.renderer.getGroundTypeNameAtTile(checkTileX, checkTileY)
				if (groundType === 'mountain' || groundType === 'water_shallow' || groundType === 'water_deep') {
					return false
				}

				if (enforceGroundTypes) {
					if (!groundType || !allowedGroundTypes.includes(groundType)) {
						return false
					}
				} else if (collisionGrid?.[checkTileY]?.[checkTileX]) {
					return false
				}
			}
		}

		const placementWidth = footprint.width * tileSize
		const placementHeight = footprint.height * tileSize
		const seenObjects = new Set<string>()
		const mapObjects = this.scene.getMapObjects().map((entry) => entry.mapObject)
		const resourceNodes = this.scene.getResourceNodeObjects()
		for (const obj of [...mapObjects, ...resourceNodes]) {
			if (!obj) continue
			if (seenObjects.has(obj.id)) continue
			seenObjects.add(obj.id)

			const isResourceNode = Boolean(obj.metadata?.resourceNode)
			const metadata = itemService.getItemType(obj.item.itemType)
			const blocksPlacement = isResourceNode
				? this.shouldBlockResourceNode(obj)
				: Boolean(obj.metadata?.buildingId || obj.metadata?.buildingInstanceId) ||
				  Boolean(metadata?.placement?.blocksPlacement)
			if (!blocksPlacement) continue

			let objWidth = tileSize
			let objHeight = tileSize
			if (obj.metadata?.footprint) {
				objWidth = obj.metadata.footprint.width * tileSize
				objHeight = obj.metadata.footprint.height * tileSize
			} else {
				const placementSize = metadata?.placement?.size
				objWidth = (placementSize?.width || 1) * tileSize
				objHeight = (placementSize?.height || 1) * tileSize
			}

			if (this.doRectanglesOverlap(
				{ x: worldX, y: worldY },
				placementWidth,
				placementHeight,
				obj.position,
				objWidth,
				objHeight
			)) {
				return false
			}
		}

		for (const loot of this.scene.getLootBounds()) {
			if (this.doRectanglesOverlap(
				{ x: worldX, y: worldY },
				placementWidth,
				placementHeight,
				{ x: loot.x, y: loot.y },
				loot.width,
				loot.height
			)) {
				return false
			}
		}

		return true
	}

	private shouldBlockResourceNode(node: MapObject): boolean {
		const nodeType = node.metadata?.resourceNodeType
		const def = nodeType ? this.resourceNodes.get(nodeType) : null
		if (def) {
			return def.blocksMovement ?? def.id === 'tree'
		}
		return true
	}

	private doRectanglesOverlap(
		pos1: { x: number; y: number },
		width1: number,
		height1: number,
		pos2: { x: number; y: number },
		width2: number,
		height2: number
	): boolean {
		const rect1Right = pos1.x + width1
		const rect2Right = pos2.x + width2
		if (rect1Right <= pos2.x || rect2Right <= pos1.x) {
			return false
		}

		const rect1Bottom = pos1.y + height1
		const rect2Bottom = pos2.y + height2
		if (rect1Bottom <= pos2.y || rect2Bottom <= pos1.y) {
			return false
		}

		return true
	}

	private setupMouseHandlers() {
		if (this.handlersActive) return
		this.scene.runtime.input.on('pointermove', this.handleMouseMove)
		this.scene.runtime.input.on('pointerdown', this.handleMouseClick)
		window.addEventListener('keydown', this.handleKeyDown)
		this.handlersActive = true
	}

	private removeMouseHandlers() {
		if (!this.handlersActive) return
		this.scene.runtime.input.off('pointermove', this.handleMouseMove)
		this.scene.runtime.input.off('pointerdown', this.handleMouseClick)
		window.removeEventListener('keydown', this.handleKeyDown)
		this.handlersActive = false
	}

	private handleMouseMove = (pointer: PointerState) => {
		if (!this.state.selectedBuildingId) return
		const world = pointer.world ?? this.scene.runtime.input.getWorldPoint()
		if (!world) {
			return
		}
		this.updateGhostPosition(world.x, world.z)
	}

	private handleMouseClick = (pointer: PointerState) => {
		if (pointer.button !== 0) return
		if (!this.state.selectedBuildingId || !this.state.isValidPosition) return
		if (!this.state.lastMousePosition) {
			const world = pointer.world ?? this.scene.runtime.input.getWorldPoint()
			if (!world) {
				return
			}
			this.updateGhostPosition(world.x, world.z)
		}
		if (!this.state.lastMousePosition) return
		this.placeBuilding(this.state.lastMousePosition.x, this.state.lastMousePosition.y)
	}

	private handleKeyDown = (event: KeyboardEvent) => {
		if (event.code === 'Escape') {
			this.cancelSelection()
			EventBus.emit(UiEvents.Construction.Cancel, {})
			return
		}
		if (event.code === 'KeyR') {
			this.rotatePlacement()
		}
	}

	private placeBuilding(x: number, y: number) {
		if (!this.state.selectedBuildingId) return

		const position = {
			x: Math.floor(x),
			y: Math.floor(y)
		}

		EventBus.emit(Event.Buildings.CS.Place, {
			buildingId: this.state.selectedBuildingId,
			position,
			rotation: this.getPlacementRotation()
		})
	}

	public update() {
		// no-op
	}

	public destroy(): void {
		this.cancelSelection()
		if (this.selectHandler) {
			EventBus.off(UiEvents.Construction.Select, this.selectHandler)
		}
		if (this.cancelHandler) {
			EventBus.off(UiEvents.Construction.Cancel, this.cancelHandler)
		}
		if (this.placedHandler) {
			EventBus.off(Event.Buildings.SC.Placed, this.placedHandler)
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

function isSceneDisposed(scene: { isDisposed?: (() => boolean) | boolean } | null): boolean {
	if (!scene) return true
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
