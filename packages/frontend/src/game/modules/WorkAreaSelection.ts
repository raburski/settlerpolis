import { Scene, GameObjects, Input } from 'phaser'
import { EventBus } from '../EventBus'
import { Event, BuildingDefinition } from '@rugged/game'
import { buildingService } from '../services/BuildingService'
import { UiEvents } from '../uiEvents'

interface WorkAreaSelectionState {
	buildingInstanceId: string | null
	radiusTiles: number
	ghostSprite: GameObjects.Graphics | null
	selectionText: GameObjects.Text | null
	isValidPosition: boolean
	lastMousePosition: { x: number, y: number } | null
}

export class WorkAreaSelectionManager {
	private scene: Scene
	private state: WorkAreaSelectionState = {
		buildingInstanceId: null,
		radiusTiles: 0,
		ghostSprite: null,
		selectionText: null,
		isValidPosition: true,
		lastMousePosition: null
	}
	private selectHandler: ((data: { buildingInstanceId: string }) => void) | null = null
	private cancelHandler: (() => void) | null = null

	constructor(scene: Scene) {
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
		const map = (this.scene as any).map
		return map?.tileWidth || map?.tilewidth || 32
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

		// Cancel any active building placement
		EventBus.emit(UiEvents.Construction.Cancel, {})

		this.state.buildingInstanceId = buildingInstanceId
		this.state.radiusTiles = radiusTiles
		this.createGhostSprite()
		this.setupMouseHandlers()

		const center = building.workAreaCenter ?? building.position
		this.updateGhostPosition(center.x, center.y)
	}

	private cancelSelection() {
		this.state.buildingInstanceId = null
		this.state.radiusTiles = 0
		this.state.lastMousePosition = null
		this.state.isValidPosition = true
		this.destroyGhostSprite()
		this.removeMouseHandlers()
	}

	private createGhostSprite() {
		this.destroyGhostSprite()

		const ghost = this.scene.add.graphics()
		ghost.setDepth(200)
		ghost.setAlpha(0.5)
		this.state.ghostSprite = ghost

		const text = this.scene.add.text(16, 16, 'Click to set work area (Esc to cancel)', {
			fontSize: '16px',
			color: '#ffffff',
			backgroundColor: '#000000',
			padding: { x: 8, y: 4 }
		})
		text.setScrollFactor(0)
		text.setDepth(1000)
		this.state.selectionText = text
	}

	private destroyGhostSprite() {
		if (this.state.ghostSprite) {
			this.state.ghostSprite.destroy()
			this.state.ghostSprite = null
		}
		if (this.state.selectionText) {
			this.state.selectionText.destroy()
			this.state.selectionText = null
		}
	}

	private updateGhostPosition(worldX: number, worldY: number) {
		if (!this.state.ghostSprite || !this.state.buildingInstanceId) return

		const tileSize = this.getTileSize()
		const snappedX = Math.floor(worldX / tileSize) * tileSize
		const snappedY = Math.floor(worldY / tileSize) * tileSize
		this.state.lastMousePosition = { x: snappedX, y: snappedY }

		const radiusTiles = this.state.radiusTiles
		const centerTileX = Math.floor(snappedX / tileSize)
		const centerTileY = Math.floor(snappedY / tileSize)
		const map = (this.scene as any).map

		let isValid = true
		if (map) {
			const minTileX = centerTileX - radiusTiles
			const maxTileX = centerTileX + radiusTiles
			const minTileY = centerTileY - radiusTiles
			const maxTileY = centerTileY + radiusTiles
			isValid = minTileX >= 0 && minTileY >= 0 && maxTileX < map.width && maxTileY < map.height
		}

		this.state.isValidPosition = isValid

		const ghost = this.state.ghostSprite
		ghost.clear()

		const centerX = snappedX + tileSize / 2
		const centerY = snappedY + tileSize / 2
		const radiusPixels = radiusTiles * tileSize
		const color = this.state.isValidPosition ? 0x00ff00 : 0xff0000

		ghost.fillStyle(color, 0.2)
		ghost.fillCircle(centerX, centerY, radiusPixels)
		ghost.lineStyle(2, color, 0.8)
		ghost.strokeCircle(centerX, centerY, radiusPixels)

		// Draw center tile
		ghost.fillStyle(color, 0.4)
		ghost.fillRect(snappedX, snappedY, tileSize, tileSize)
	}

	private setupMouseHandlers() {
		this.scene.input.on('pointermove', this.handleMouseMove, this)
		this.scene.input.on('pointerdown', this.handleMouseClick, this)
		this.scene.input.keyboard.on('keydown-ESC', this.handleEscape, this)
	}

	private removeMouseHandlers() {
		this.scene.input.off('pointermove', this.handleMouseMove, this)
		this.scene.input.off('pointerdown', this.handleMouseClick, this)
		this.scene.input.keyboard.off('keydown-ESC', this.handleEscape, this)
	}

	private handleMouseMove = (pointer: Input.Pointer) => {
		if (!this.state.buildingInstanceId) return

		const camera = this.scene.cameras.main
		const worldX = camera.scrollX + pointer.x
		const worldY = camera.scrollY + pointer.y

		this.updateGhostPosition(worldX, worldY)
	}

	private handleMouseClick = (pointer: Input.Pointer) => {
		if (!this.state.buildingInstanceId) return

		if (pointer.rightButtonDown()) {
			this.cancelSelection()
			return
		}

		if (pointer.leftButtonDown() && this.state.isValidPosition && this.state.lastMousePosition) {
			this.setWorkArea(this.state.lastMousePosition.x, this.state.lastMousePosition.y)
		}
	}

	private handleEscape = () => {
		this.cancelSelection()
		EventBus.emit(UiEvents.Building.WorkAreaCancel, {})
	}

	private setWorkArea(x: number, y: number) {
		if (!this.state.buildingInstanceId) return

		EventBus.emit(Event.Buildings.CS.SetWorkArea, {
			buildingInstanceId: this.state.buildingInstanceId,
			center: { x: Math.floor(x), y: Math.floor(y) }
		})

		this.cancelSelection()
	}

	public update() {
		// no-op for now
	}

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
