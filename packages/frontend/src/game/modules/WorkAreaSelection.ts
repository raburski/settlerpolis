import { EventBus } from '../EventBus'
import { Event, BuildingDefinition } from '@rugged/game'
import { buildingService } from '../services/BuildingService'
import { UiEvents } from '../uiEvents'
import type { AbstractMesh } from '@babylonjs/core'
import type { GameScene } from '../scenes/base/GameScene'
import type { PointerState } from '../input/InputManager'

interface WorkAreaSelectionState {
	buildingInstanceId: string | null
	radiusTiles: number
	ghostMesh: AbstractMesh | null
	selectionText: HTMLDivElement | null
	isValidPosition: boolean
	lastMousePosition: { x: number; y: number } | null
}

export class WorkAreaSelectionManager {
	private scene: GameScene
	private state: WorkAreaSelectionState = {
		buildingInstanceId: null,
		radiusTiles: 0,
		ghostMesh: null,
		selectionText: null,
		isValidPosition: true,
		lastMousePosition: null
	}
	private selectHandler: ((data: { buildingInstanceId: string }) => void) | null = null
	private cancelHandler: (() => void) | null = null
	private handlersActive = false

	constructor(scene: GameScene) {
		this.scene = scene
		this.setupEventListeners()
	}

	private setupEventListeners() {
		this.selectHandler = (data: { buildingInstanceId: string }) => {
			this.selectWorkArea(data.buildingInstanceId)
		}
		EventBus.on(UiEvents.Building.WorkAreaSelect, this.selectHandler)

		this.cancelHandler = () => {
			this.cancelSelection()
		}
		EventBus.on(UiEvents.Building.WorkAreaCancel, this.cancelHandler)
		EventBus.on(UiEvents.Building.Close, this.cancelHandler)
	}

	private getTileSize(): number {
		return this.scene.map?.tileWidth || 32
	}

	private getWorkAreaRadius(definition?: BuildingDefinition | null): number {
		if (!definition) return 0
		return definition.farm?.plotRadiusTiles ?? definition.harvest?.radiusTiles ?? 0
	}

	private selectWorkArea(buildingInstanceId: string) {
		const building = buildingService.getBuildingInstance(buildingInstanceId)
		if (!building) return

		const definition = buildingService.getBuildingDefinition(building.buildingId)
		const radiusTiles = this.getWorkAreaRadius(definition)
		if (!radiusTiles || radiusTiles <= 0) return

		EventBus.emit(UiEvents.Construction.Cancel, {})

		this.state.buildingInstanceId = buildingInstanceId
		this.state.radiusTiles = radiusTiles
		this.createGhostMesh()
		this.setupMouseHandlers()

		const center = building.workAreaCenter ?? building.position
		this.updateGhostPosition(center.x, center.y)
	}

	private cancelSelection() {
		this.state.buildingInstanceId = null
		this.state.radiusTiles = 0
		this.state.lastMousePosition = null
		this.state.isValidPosition = true
		this.destroyGhostMesh()
		this.removeMouseHandlers()
	}

	private createGhostMesh() {
		this.destroyGhostMesh()

		const radiusPixels = this.state.radiusTiles * this.getTileSize()
		const size = { width: radiusPixels * 2, length: radiusPixels * 2, height: 1 }
		const mesh = this.scene.runtime.renderer.createBox('work-area-ghost', size)
		this.scene.runtime.renderer.applyTint(mesh, '#00ff00')
		this.state.ghostMesh = mesh

		const text = document.createElement('div')
		text.textContent = 'Click to set work area (Esc to cancel)'
		text.style.position = 'absolute'
		text.style.top = '16px'
		text.style.left = '16px'
		text.style.padding = '4px 8px'
		text.style.background = 'rgba(0,0,0,0.7)'
		text.style.color = '#ffffff'
		text.style.fontSize = '14px'
		text.style.borderRadius = '4px'
		this.scene.runtime.overlayRoot.appendChild(text)
		this.state.selectionText = text
	}

	private destroyGhostMesh() {
		if (this.state.ghostMesh) {
			this.state.ghostMesh.dispose()
			this.state.ghostMesh = null
		}
		if (this.state.selectionText) {
			this.state.selectionText.remove()
			this.state.selectionText = null
		}
	}

	private updateGhostPosition(worldX: number, worldY: number) {
		if (!this.state.ghostMesh || !this.state.buildingInstanceId) return

		const tileSize = this.getTileSize()
		const snappedX = Math.floor(worldX / tileSize) * tileSize
		const snappedY = Math.floor(worldY / tileSize) * tileSize
		this.state.lastMousePosition = { x: snappedX, y: snappedY }

		const radiusTiles = this.state.radiusTiles
		const centerTileX = Math.floor(snappedX / tileSize)
		const centerTileY = Math.floor(snappedY / tileSize)
		const map = this.scene.map

		let isValid = true
		if (map) {
			const maxTileX = map.widthInPixels / tileSize
			const maxTileY = map.heightInPixels / tileSize
			const minTileX = centerTileX - radiusTiles
			const maxTileXArea = centerTileX + radiusTiles
			const minTileY = centerTileY - radiusTiles
			const maxTileYArea = centerTileY + radiusTiles
			isValid = minTileX >= 0 && minTileY >= 0 && maxTileXArea < maxTileX && maxTileYArea < maxTileY
		}

		this.state.isValidPosition = isValid
		const centerX = snappedX + tileSize / 2
		const centerY = snappedY + tileSize / 2
		this.scene.runtime.renderer.setMeshPosition(this.state.ghostMesh, centerX, 0.5, centerY)
		this.scene.runtime.renderer.applyTint(this.state.ghostMesh, isValid ? '#00ff00' : '#ff0000')
	}

	private setupMouseHandlers() {
		if (this.handlersActive) return
		this.scene.runtime.input.on('pointermove', this.handleMouseMove)
		this.scene.runtime.input.on('pointerup', this.handleMouseClick)
		window.addEventListener('keydown', this.handleEscape)
		this.handlersActive = true
	}

	private removeMouseHandlers() {
		if (!this.handlersActive) return
		this.scene.runtime.input.off('pointermove', this.handleMouseMove)
		this.scene.runtime.input.off('pointerup', this.handleMouseClick)
		window.removeEventListener('keydown', this.handleEscape)
		this.handlersActive = false
	}

	private handleMouseMove = (pointer: PointerState) => {
		if (!this.state.buildingInstanceId) return
		const world = pointer.world ?? this.scene.runtime.input.getWorldPoint()
		if (!world) return
		this.updateGhostPosition(world.x, world.z)
	}

	private handleMouseClick = (pointer: PointerState) => {
		if (pointer.wasDrag || pointer.button !== 0) return
		if (!this.state.buildingInstanceId) return
		if (!this.state.lastMousePosition) {
			const world = pointer.world ?? this.scene.runtime.input.getWorldPoint()
			if (!world) return
			this.updateGhostPosition(world.x, world.z)
		}
		if (this.state.isValidPosition && this.state.lastMousePosition) {
			this.setWorkArea(this.state.lastMousePosition.x, this.state.lastMousePosition.y)
		}
	}

	private handleEscape = (event: KeyboardEvent) => {
		if (event.code === 'Escape') {
			this.cancelSelection()
			EventBus.emit(UiEvents.Building.WorkAreaCancel, {})
		}
	}

	private setWorkArea(x: number, y: number) {
		if (!this.state.buildingInstanceId) return

		EventBus.emit(Event.Buildings.CS.SetWorkArea, {
			buildingInstanceId: this.state.buildingInstanceId,
			center: { x: Math.floor(x), y: Math.floor(y) }
		})

		this.cancelSelection()
	}

	public update() {}

	public destroy() {
		this.cancelSelection()

		if (this.selectHandler) {
			EventBus.off(UiEvents.Building.WorkAreaSelect, this.selectHandler)
			this.selectHandler = null
		}
		if (this.cancelHandler) {
			EventBus.off(UiEvents.Building.WorkAreaCancel, this.cancelHandler)
			EventBus.off(UiEvents.Building.Close, this.cancelHandler)
			this.cancelHandler = null
		}
	}
}
