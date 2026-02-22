import { EventBus } from '../EventBus'
import { Event, BuildingDefinition, ResourceNodeDefinition, MapObject, ConstructionStage } from '@rugged/game'
import { UiEvents } from '../uiEvents'
import { shouldIgnoreKeyboardEvent } from '../utils/inputGuards'
import { AbstractMesh, Color3, SceneLoader, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core'
import '@babylonjs/loaders'
import type { GameScene } from '../scenes/base/GameScene'
import type { PointerState } from '../input/InputManager'
import { rotateVec3 } from '../../shared/transform'
import { itemService } from '../services/ItemService'
import { buildingService } from '../services/BuildingService'
import { playerService } from '../services/PlayerService'

const CONTENT_FOLDER = import.meta.env.VITE_GAME_CONTENT || 'settlerpolis'
const contentModules = import.meta.glob('../../../../../content/*/index.ts', { eager: true })
const content = contentModules[`../../../../../content/${CONTENT_FOLDER}/index.ts`]
const HALF_PI = Math.PI / 2
const GHOST_VISIBILITY = 1
const GHOST_TINT_VALID = '#6fbf6a'
const GHOST_TINT_CLEARABLE = '#e3be54'
const GHOST_TINT_INVALID = '#e05c5c'
const GHOST_EMISSIVE_VALID = new Color3(0.2, 0.6, 0.2)
const GHOST_EMISSIVE_CLEARABLE = new Color3(0.7, 0.55, 0.2)
const GHOST_EMISSIVE_INVALID = new Color3(0.7, 0.2, 0.2)
const GHOST_MODEL_ALPHA = 0.6

interface BuildingPlacementState {
	selectedBuildingId: string | null
	isValidPosition: boolean
	requiresTreeClearance: boolean
	lastMousePosition: { x: number; y: number } | null
	rotationStep: number
	dragStartTile: { x: number; y: number } | null
	dragCurrentTile: { x: number; y: number } | null
}

interface LinePlacement {
	tile: { x: number; y: number }
	worldX: number
	worldY: number
	isValid: boolean
	requiresTreeClearance: boolean
}

export class BuildingPlacementManager {
	private scene: GameScene
	private state: BuildingPlacementState = {
		selectedBuildingId: null,
		isValidPosition: true,
		requiresTreeClearance: false,
		lastMousePosition: null,
		rotationStep: 0,
		dragStartTile: null,
		dragCurrentTile: null
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
	private linePreviewMeshes: AbstractMesh[] = []
	private lineModelRoots: TransformNode[] = []
	private linePreviewMaterialValid: StandardMaterial | null = null
	private linePreviewMaterialInvalid: StandardMaterial | null = null
	private ghostRender: BuildingDefinition['render'] | null = null
	private ghostLoadToken = 0
	private selectHandler: ((data: { buildingId: string }) => void) | null = null
	private cancelHandler: (() => void) | null = null
	private placedHandler: (() => void) | null = null
	private handlersActive = false
	private rotationLocked = false
	private lastMissingWoodcutterNotificationAt = 0

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
		this.state.dragStartTile = null
		this.state.dragCurrentTile = null
		this.rotationLocked = false
		const building = this.buildings.get(buildingId)
		if (!building?.marketDistribution) {
			this.clearServiceRangePreview()
		}
		this.createGhostMesh()
		this.setupMouseHandlers()
	}

	private cancelSelection() {
		this.state.selectedBuildingId = null
		this.state.requiresTreeClearance = false
		this.state.dragStartTile = null
		this.state.dragCurrentTile = null
		this.rotationLocked = false
		this.destroyGhostMesh()
		this.removeMouseHandlers()
		this.clearServiceRangePreview()
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
		this.clearLinePreview()
		this.disposeLinePreviewMaterials()
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

	private clearLinePreview(): void {
		this.linePreviewMeshes.forEach((mesh) => mesh.dispose())
		this.linePreviewMeshes = []
		this.lineModelRoots.forEach((root) => root.dispose())
		this.lineModelRoots = []
	}

	private disposeLinePreviewMaterials(): void {
		if (this.linePreviewMaterialValid) {
			this.linePreviewMaterialValid.dispose()
		}
		if (this.linePreviewMaterialInvalid) {
			this.linePreviewMaterialInvalid.dispose()
		}
		this.linePreviewMaterialValid = null
		this.linePreviewMaterialInvalid = null
	}

	private updateGhostPosition(worldX: number, worldY: number) {
		if (!this.ghostRoot || !this.state.selectedBuildingId) return
		const building = this.buildings.get(this.state.selectedBuildingId)
		if (!building) return

		const tileSize = this.scene.map?.tileWidth || this.tileSize
		const snappedX = Math.floor(worldX / tileSize) * tileSize
		const snappedY = Math.floor(worldY / tileSize) * tileSize
		this.state.lastMousePosition = { x: snappedX, y: snappedY }
		let rotationChanged = false
		if (!this.rotationLocked) {
			const autoStep = this.getAutoRotationStep(snappedX, snappedY, building)
			if (autoStep !== null && autoStep !== this.state.rotationStep) {
				this.state.rotationStep = autoStep
				rotationChanged = true
				if (!building.render?.modelSrc) {
					this.rebuildGhostBaseMesh(building)
				}
				this.applyGhostTransform()
			}
		}
		const placement = this.evaluatePlacement(snappedX, snappedY, building)
		this.state.isValidPosition = placement.isValid
		this.state.requiresTreeClearance = placement.requiresTreeClearance

		const footprint = this.getRotatedFootprint(building)
		const centerX = snappedX + (footprint.width * tileSize) / 2
		const centerY = snappedY + (footprint.height * tileSize) / 2
		this.ghostRoot.position = new Vector3(centerX, tileSize * 0.5, centerY)
		if (building.marketDistribution) {
			this.emitServiceRangePreview(building, snappedX, snappedY)
		}
		this.updateGhostTint()
		if (rotationChanged && this.state.dragStartTile && this.state.dragCurrentTile) {
			this.updateLinePreview()
		}
	}

	private emitServiceRangePreview(building: BuildingDefinition, worldX: number, worldY: number): void {
		EventBus.emit(UiEvents.Construction.ServiceRangePreview, {
			buildingDefinition: building,
			position: { x: worldX, y: worldY }
		})
	}

	private clearServiceRangePreview(): void {
		EventBus.emit(UiEvents.Construction.ServiceRangeClear, {})
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
		return this.getRotatedFootprintForStep(building, this.state.rotationStep)
	}

	private getRotatedFootprintForStep(building: BuildingDefinition, rotationStep: number): { width: number; height: number } {
		if (rotationStep % 2 === 0) {
			return { width: building.footprint.width, height: building.footprint.height }
		}
		return { width: building.footprint.height, height: building.footprint.width }
	}

	private rotatePlacement(): void {
		if (!this.state.selectedBuildingId) return
		const building = this.buildings.get(this.state.selectedBuildingId)
		if (!building) return
		this.rotationLocked = true
		this.state.rotationStep = (this.state.rotationStep + 1) % 4
		if (!building.render?.modelSrc) {
			this.rebuildGhostBaseMesh(building)
		}
		this.applyGhostTransform()
		if (this.state.lastMousePosition) {
			this.updateGhostPosition(this.state.lastMousePosition.x, this.state.lastMousePosition.y)
		}
		if (this.state.dragStartTile && this.state.dragCurrentTile) {
			this.updateLinePreview()
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
				if (this.state.dragStartTile && this.state.dragCurrentTile) {
					this.updateLinePreview()
				}
			})()
		} catch (error) {
			if (this.ghostRoot) {
				this.rebuildGhostBaseMesh(building)
			}
		}
	}

	private applyGhostTransform(): void {
		this.applyGhostTransformTo(this.ghostModelRoot)
	}

	private applyGhostTransformTo(target: TransformNode | null): void {
		if (!target || !this.ghostRender) return
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
		target.position = new Vector3(
			rotatedOffset.x * tileSize,
			-tileSize * 0.5 + (elevation + rotatedOffset.y) * tileSize,
			rotatedOffset.z * tileSize
		)
		target.rotation = new Vector3(finalRotation.x, finalRotation.y, finalRotation.z)
		target.scaling = new Vector3(
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

	private applyGhostMeshAppearance(mesh: AbstractMesh, isValid: boolean = this.state.isValidPosition): void {
		mesh.isPickable = false
		mesh.isVisible = true
		mesh.visibility = GHOST_VISIBILITY
		mesh.alwaysSelectAsActiveMesh = true
		mesh.material = this.getGhostModelMaterial(isValid)
	}

	private applyGhostAppearanceToNode(root: TransformNode, isValid: boolean): void {
		const descendants = root.getDescendants(true)
		for (const node of descendants) {
			if (node instanceof AbstractMesh) {
				this.applyGhostMeshAppearance(node, isValid)
			}
		}
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
		const tint = !isValid
			? GHOST_TINT_INVALID
			: (this.state.requiresTreeClearance ? GHOST_TINT_CLEARABLE : GHOST_TINT_VALID)
		const emissive = !isValid
			? GHOST_EMISSIVE_INVALID
			: (this.state.requiresTreeClearance ? GHOST_EMISSIVE_CLEARABLE : GHOST_EMISSIVE_VALID)
		if (this.ghostBaseMesh) {
			if (this.ghostBaseMaterial) {
				this.ghostBaseMaterial.diffuseColor = Color3.FromHexString(tint)
				this.ghostBaseMaterial.emissiveColor = emissive
			} else {
				this.scene.runtime.renderer.applyTint(this.ghostBaseMesh, tint)
			}
		}
		if (this.ghostMeshes.length > 0) {
			const material = this.getGhostModelMaterial(isValid)
			if (isValid) {
				material.diffuseColor = Color3.FromHexString(tint)
				material.emissiveColor = emissive
			}
			this.ghostMeshes.forEach((mesh) => {
				mesh.material = material
			})
		}
	}

	private getLinePreviewMaterial(isValid: boolean): StandardMaterial {
		if (isValid) {
			if (!this.linePreviewMaterialValid) {
				const material = new StandardMaterial('building-line-preview-valid', this.scene.runtime.renderer.scene)
				material.diffuseColor = Color3.FromHexString(GHOST_TINT_VALID)
				material.emissiveColor = GHOST_EMISSIVE_VALID
				material.specularColor = Color3.Black()
				material.alpha = 0.25
				material.disableDepthWrite = true
				this.linePreviewMaterialValid = material
			}
			return this.linePreviewMaterialValid
		}
		if (!this.linePreviewMaterialInvalid) {
			const material = new StandardMaterial('building-line-preview-invalid', this.scene.runtime.renderer.scene)
			material.diffuseColor = Color3.FromHexString(GHOST_TINT_INVALID)
			material.emissiveColor = GHOST_EMISSIVE_INVALID
			material.specularColor = Color3.Black()
			material.alpha = 0.25
			material.disableDepthWrite = true
			this.linePreviewMaterialInvalid = material
		}
		return this.linePreviewMaterialInvalid
	}

	private updateLinePreview(): void {
		if (!this.state.dragStartTile || !this.state.dragCurrentTile || !this.state.selectedBuildingId) {
			this.clearLinePreview()
			return
		}
		const building = this.buildings.get(this.state.selectedBuildingId)
		if (!building) {
			this.clearLinePreview()
			return
		}

		const placements = this.getLinePlacements(this.state.dragStartTile, this.state.dragCurrentTile, building)
		this.clearLinePreview()

		const tileSize = this.getTileSize()
		const footprint = this.getRotatedFootprint(building)
		const width = footprint.width * tileSize
		const length = footprint.height * tileSize
		const canUseModel = Boolean(this.ghostModelRoot && this.ghostRender?.modelSrc)

		for (const placement of placements) {
			if (!placement.isValid) {
				continue
			}

			const centerX = placement.worldX + width / 2
			const centerY = placement.worldY + length / 2

			if (canUseModel && this.ghostModelRoot) {
				const root = new TransformNode(`building-line-model-root-${placement.tile.x}-${placement.tile.y}`, this.scene.runtime.renderer.scene)
				root.position = new Vector3(centerX, tileSize * 0.5, centerY)
				const clone = this.ghostModelRoot.clone(`building-line-model-${placement.tile.x}-${placement.tile.y}`, root)
				if (clone) {
					this.applyGhostTransformTo(clone)
					this.applyGhostAppearanceToNode(clone, true)
					this.lineModelRoots.push(root)
				} else {
					root.dispose()
				}
				continue
			}

			const size = { width, length, height: tileSize }
			const mesh = this.scene.runtime.renderer.createBox(`building-line-preview-${placement.tile.x}-${placement.tile.y}`, size)
			mesh.isPickable = false
			mesh.visibility = GHOST_VISIBILITY
			mesh.isVisible = true
			mesh.alwaysSelectAsActiveMesh = true
			mesh.renderOutline = true
			mesh.outlineWidth = 0.08
			mesh.outlineColor = Color3.White()
			mesh.material = this.getLinePreviewMaterial(true)
			this.scene.runtime.renderer.setMeshPosition(mesh, centerX, tileSize * 0.5, centerY)
			this.linePreviewMeshes.push(mesh)
		}
	}

	private getTileSize(): number {
		return this.scene.map?.tileWidth || this.tileSize
	}

	private getAutoRotationStep(worldX: number, worldY: number, building: BuildingDefinition): number | null {
		const tileSize = this.getTileSize()
		const originX = Math.floor(worldX / tileSize)
		const originY = Math.floor(worldY / tileSize)
		const accessTiles = building.accessTiles ?? []
		const hasAccessTiles = accessTiles.length > 0
		const entryPoint = building.entryPoint ?? null
		const baseWidth = building.footprint.width
		const baseHeight = building.footprint.height
		const normalizedAccess = accessTiles.map((tile) => ({
			x: Math.round(tile.x),
			y: Math.round(tile.y)
		}))
		let best: { step: number; accessDist: number; entryDist: number } | null = null

		for (let step = 0; step < 4; step += 1) {
			const footprint = this.getRotatedFootprintForStep(building, step)
			const roadTiles = this.getAdjacentRoadTiles(originX, originY, footprint.width, footprint.height)
			if (roadTiles.length === 0) {
				continue
			}

			let accessDist = Number.POSITIVE_INFINITY
			if (hasAccessTiles) {
				const accessPoints = normalizedAccess.map((tile) => {
					const rotated = this.rotatePointOffset(tile, baseWidth, baseHeight, step)
					return { x: originX + rotated.x, y: originY + rotated.y }
				})
				accessDist = this.getMinDistanceToRoad(roadTiles, accessPoints)
			}

			let entryDist = Number.POSITIVE_INFINITY
			if (entryPoint) {
				const rotatedEntry = this.rotatePointOffset(entryPoint, baseWidth, baseHeight, step)
				entryDist = this.getMinDistanceToRoad(roadTiles, [{ x: originX + rotatedEntry.x, y: originY + rotatedEntry.y }])
			}

			const candidate = { step, accessDist, entryDist }
			if (!best) {
				best = candidate
				continue
			}
			if (hasAccessTiles) {
				if (candidate.accessDist < best.accessDist) {
					best = candidate
					continue
				}
				if (candidate.accessDist === best.accessDist && entryPoint) {
					if (candidate.entryDist < best.entryDist) {
						best = candidate
					}
				}
				continue
			}
			if (entryPoint && candidate.entryDist < best.entryDist) {
				best = candidate
			}
		}

		if (!best) {
			return null
		}
		if (hasAccessTiles && !Number.isFinite(best.accessDist)) {
			if (entryPoint && Number.isFinite(best.entryDist)) {
				return best.step
			}
			return null
		}
		if (!hasAccessTiles && entryPoint && !Number.isFinite(best.entryDist)) {
			return null
		}
		return best.step
	}

	private getAdjacentRoadTiles(originX: number, originY: number, width: number, height: number): Array<{ x: number; y: number }> {
		const tiles: Array<{ x: number; y: number }> = []
		const seen = new Set<string>()
		const pushIfRoad = (tileX: number, tileY: number) => {
			if (this.scene.hasRoadAt(tileX, tileY) || this.scene.hasPendingRoadAt(tileX, tileY)) {
				const key = `${tileX},${tileY}`
				if (seen.has(key)) return
				seen.add(key)
				tiles.push({ x: tileX, y: tileY })
			}
		}

		const maxX = originX + width - 1
		const maxY = originY + height - 1
		for (let tileX = originX; tileX <= maxX; tileX += 1) {
			pushIfRoad(tileX, originY - 1)
			pushIfRoad(tileX, maxY + 1)
		}
		for (let tileY = originY; tileY <= maxY; tileY += 1) {
			pushIfRoad(originX - 1, tileY)
			pushIfRoad(maxX + 1, tileY)
		}
		return tiles
	}

	private getMinDistanceToRoad(
		roadTiles: Array<{ x: number; y: number }>,
		points: Array<{ x: number; y: number }>
	): number {
		let best = Number.POSITIVE_INFINITY
		for (const point of points) {
			for (const road of roadTiles) {
				const distance = Math.abs(point.x - road.x) + Math.abs(point.y - road.y)
				if (distance < best) {
					best = distance
				}
			}
		}
		return best
	}

	private rotatePointOffset(
		offset: { x: number; y: number },
		width: number,
		height: number,
		rotationStep: number
	): { x: number; y: number } {
		const turns = ((rotationStep % 4) + 4) % 4
		if (turns === 0) {
			return { x: offset.x, y: offset.y }
		}
		if (turns === 1) {
			return { x: offset.y, y: width - offset.x }
		}
		if (turns === 2) {
			return { x: width - offset.x, y: height - offset.y }
		}
		return { x: height - offset.y, y: offset.x }
	}

	private getTileFromWorld(worldX: number, worldY: number): { x: number; y: number } {
		const tileSize = this.getTileSize()
		return {
			x: Math.floor(worldX / tileSize),
			y: Math.floor(worldY / tileSize)
		}
	}

	private getWorldFromTile(tile: { x: number; y: number }): { x: number; y: number } {
		const tileSize = this.getTileSize()
		return {
			x: tile.x * tileSize,
			y: tile.y * tileSize
		}
	}

	private getLinePlacements(
		startTile: { x: number; y: number },
		endTile: { x: number; y: number },
		building: BuildingDefinition
	): LinePlacement[] {
		const placements: LinePlacement[] = []
		const footprint = this.getRotatedFootprint(building)
		const tileSize = this.getTileSize()
		const placementWidth = footprint.width * tileSize
		const placementHeight = footprint.height * tileSize
		const accepted: Array<{ x: number; y: number; width: number; height: number }> = []
		const tiles: Array<{ x: number; y: number }> = []

		const dx = endTile.x - startTile.x
		const dy = endTile.y - startTile.y
		const distance = Math.hypot(dx, dy)
		if (distance === 0) {
			tiles.push({ x: startTile.x, y: startTile.y })
		} else {
			const dirX = dx / distance
			const dirY = dy / distance
			const stepTiles = dx === 0
				? footprint.height
				: dy === 0
					? footprint.width
					: Math.max(footprint.width, footprint.height)
			const seen = new Set<string>()
			for (let dist = 0; dist <= distance + 0.001; dist += stepTiles) {
				const tileX = Math.round(startTile.x + dirX * dist)
				const tileY = Math.round(startTile.y + dirY * dist)
				const key = `${tileX},${tileY}`
				if (seen.has(key)) continue
				seen.add(key)
				tiles.push({ x: tileX, y: tileY })
			}
			const endKey = `${endTile.x},${endTile.y}`
			if (!seen.has(endKey)) {
				tiles.push({ x: endTile.x, y: endTile.y })
			}
		}

		for (const tile of tiles) {
			const world = this.getWorldFromTile(tile)
			const placement = this.evaluatePlacement(world.x, world.y, building)
			let isValid = placement.isValid

			if (isValid) {
				for (const placed of accepted) {
					if (this.doRectanglesOverlap(
						{ x: world.x, y: world.y },
						placementWidth,
						placementHeight,
						{ x: placed.x, y: placed.y },
						placed.width,
						placed.height
					)) {
						isValid = false
						break
					}
				}
			}

			if (isValid) {
				accepted.push({ x: world.x, y: world.y, width: placementWidth, height: placementHeight })
			}

			placements.push({
				tile,
				worldX: world.x,
				worldY: world.y,
				isValid,
				requiresTreeClearance: placement.requiresTreeClearance
			})
		}

		return placements
	}

	private evaluatePlacement(
		worldX: number,
		worldY: number,
		building: BuildingDefinition
	): { isValid: boolean; requiresTreeClearance: boolean } {
		const map = this.scene.map
		if (!map) {
			return { isValid: true, requiresTreeClearance: false }
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
		const requiresConstructedRoad = Boolean(building.requiresConstructedRoad)

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
					return { isValid: false, requiresTreeClearance: false }
				}

				const hasRoad = this.scene.hasRoadAt(checkTileX, checkTileY)
				const hasPendingRoad = this.scene.hasPendingRoadAt(checkTileX, checkTileY)
				if (requiresConstructedRoad) {
					if (!hasRoad || hasPendingRoad) {
						return { isValid: false, requiresTreeClearance: false }
					}
				} else if (hasRoad || hasPendingRoad) {
					return { isValid: false, requiresTreeClearance: false }
				}

				const groundType = this.scene.runtime.renderer.getGroundTypeNameAtTile(checkTileX, checkTileY)
				if (groundType === 'mountain' || groundType === 'water_shallow' || groundType === 'water_deep') {
					return { isValid: false, requiresTreeClearance: false }
				}

				if (enforceGroundTypes) {
					if (!groundType || !allowedGroundTypes.includes(groundType)) {
						return { isValid: false, requiresTreeClearance: false }
					}
				} else if (collisionGrid?.[checkTileY]?.[checkTileX]) {
					if (!this.hasClearableTreeAtTile(checkTileX, checkTileY)) {
						return { isValid: false, requiresTreeClearance: false }
					}
				}
			}
		}

		let requiresTreeClearance = false
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

			if (!this.doRectanglesOverlap(
				{ x: worldX, y: worldY },
				placementWidth,
				placementHeight,
				obj.position,
				objWidth,
				objHeight
			)) {
				continue
			}
			if (this.isClearableTreeNode(obj)) {
				requiresTreeClearance = true
				continue
			}
			if (blocksPlacement) {
				return { isValid: false, requiresTreeClearance: false }
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
				return { isValid: false, requiresTreeClearance: false }
			}
		}

		return { isValid: true, requiresTreeClearance }
	}

	private isClearableTreeNode(node: MapObject): boolean {
		return Boolean(node.metadata?.resourceNode) && node.metadata?.resourceNodeType === 'tree'
	}

	private hasClearableTreeAtTile(tileX: number, tileY: number): boolean {
		const tileSize = this.getTileSize()
		const resourceNodes = this.scene.getResourceNodeObjects()
		for (const node of resourceNodes) {
			if (!this.isClearableTreeNode(node)) {
				continue
			}
			const footprintWidth = node.metadata?.footprint?.width ?? 1
			const footprintHeight = node.metadata?.footprint?.height ?? footprintWidth
			const nodeTileX = Math.floor(node.position.x / tileSize)
			const nodeTileY = Math.floor(node.position.y / tileSize)
			if (tileX < nodeTileX || tileY < nodeTileY) {
				continue
			}
			if (tileX >= nodeTileX + footprintWidth || tileY >= nodeTileY + footprintHeight) {
				continue
			}
			return true
		}
		return false
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
		this.scene.runtime.input.on('pointerdown', this.handlePointerDown)
		this.scene.runtime.input.on('pointerup', this.handlePointerUp)
		window.addEventListener('keydown', this.handleKeyDown)
		this.handlersActive = true
	}

	private removeMouseHandlers() {
		if (!this.handlersActive) return
		this.scene.runtime.input.off('pointermove', this.handleMouseMove)
		this.scene.runtime.input.off('pointerdown', this.handlePointerDown)
		this.scene.runtime.input.off('pointerup', this.handlePointerUp)
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
		if (this.state.dragStartTile) {
			const tile = this.getTileFromWorld(world.x, world.z)
			if (!this.state.dragCurrentTile || tile.x !== this.state.dragCurrentTile.x || tile.y !== this.state.dragCurrentTile.y) {
				this.state.dragCurrentTile = tile
				this.updateLinePreview()
			}
		}
	}

	private handlePointerDown = (pointer: PointerState) => {
		if (pointer.button !== 0) return
		if (!this.state.selectedBuildingId) return
		const world = pointer.world ?? this.scene.runtime.input.getWorldPoint()
		if (!world) {
			return
		}
		this.updateGhostPosition(world.x, world.z)
		const tile = this.getTileFromWorld(world.x, world.z)
		this.state.dragStartTile = tile
		this.state.dragCurrentTile = tile
		this.updateLinePreview()
	}

	private handlePointerUp = (pointer: PointerState) => {
		if (pointer.button !== 0) return
		if (!this.state.selectedBuildingId) return
		const building = this.buildings.get(this.state.selectedBuildingId)
		if (!building) return
		const world = pointer.world ?? this.scene.runtime.input.getWorldPoint()
		if (world) {
			this.updateGhostPosition(world.x, world.z)
		}
		if (!this.state.dragStartTile) {
			return
		}
		const endTile = this.state.dragCurrentTile ?? (this.state.lastMousePosition ? this.getTileFromWorld(this.state.lastMousePosition.x, this.state.lastMousePosition.y) : this.state.dragStartTile)
		const placements = this.getLinePlacements(this.state.dragStartTile, endTile, building)
		const validPlacements = placements.filter((placement) => placement.isValid)
		const needsSiteClearing = validPlacements.some((placement) => placement.requiresTreeClearance)
		if (needsSiteClearing && !this.hasCompletedWoodcutterHut()) {
			this.notifyMissingWoodcutterHut()
		}
		for (const placement of placements) {
			if (placement.isValid) {
				this.placeBuilding(placement.worldX, placement.worldY)
			}
		}
		this.state.dragStartTile = null
		this.state.dragCurrentTile = null
		this.clearLinePreview()
	}

	private handleKeyDown = (event: KeyboardEvent) => {
		if (shouldIgnoreKeyboardEvent(event)) {
			return
		}
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

	private hasCompletedWoodcutterHut(): boolean {
		const currentMapId = this.scene.map?.key
		const currentPlayerId = playerService.playerId
		return buildingService.getAllBuildingInstances().some((building) => {
			if (building.buildingId !== 'woodcutter_hut') {
				return false
			}
			if (building.stage !== ConstructionStage.Completed) {
				return false
			}
			if (currentMapId && building.mapId !== currentMapId) {
				return false
			}
			if (currentPlayerId && building.playerId !== currentPlayerId) {
				return false
			}
			return true
		})
	}

	private notifyMissingWoodcutterHut(): void {
		const now = Date.now()
		if (now - this.lastMissingWoodcutterNotificationAt < 1500) {
			return
		}
		this.lastMissingWoodcutterNotificationAt = now
		EventBus.emit(UiEvents.Notifications.UiNotification, {
			message: 'Build a Woodcutter Hut to clear trees at construction sites.',
			type: 'warning',
			durationMs: 6500
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
