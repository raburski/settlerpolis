import { EventBus } from '../EventBus'
import { Event, RoadType } from '@rugged/game'
import { UiEvents } from '../uiEvents'
import type { AbstractMesh } from '@babylonjs/core'
import type { GameScene } from '../scenes/base/GameScene'
import type { PointerState } from '../input/InputManager'

interface RoadPlacementState {
	selectedRoadType: RoadType | null
	startTile: { x: number; y: number } | null
	currentTile: { x: number; y: number } | null
	ghostMeshes: AbstractMesh[]
	selectionText: HTMLDivElement | null
	isValidPosition: boolean
}

const ROAD_PREVIEW_COLORS: Record<RoadType, string> = {
	[RoadType.None]: '#000000',
	[RoadType.Dirt]: '#b58a58',
	[RoadType.Stone]: '#8a8a8a'
}

export class RoadPlacementManager {
	private scene: GameScene
	private handlersActive = false
	private state: RoadPlacementState = {
		selectedRoadType: null,
		startTile: null,
		currentTile: null,
		ghostMeshes: [],
		selectionText: null,
		isValidPosition: false
	}
	private selectHandler: ((data: { roadType: RoadType }) => void) | null = null
	private cancelHandler: (() => void) | null = null
	private boundContextMenu: (event: MouseEvent) => void

	constructor(scene: GameScene) {
		this.scene = scene
		this.boundContextMenu = (event) => {
			if (this.state.selectedRoadType) {
				event.preventDefault()
				this.cancelSelection(false)
			}
		}
		this.setupEventListeners()
	}

	public update(): void {
		// no-op
	}

	public destroy(): void {
		this.cancelSelection(false)
		if (this.selectHandler) {
			EventBus.off(UiEvents.Road.Select, this.selectHandler)
		}
		if (this.cancelHandler) {
			EventBus.off(UiEvents.Road.Cancel, this.cancelHandler)
			EventBus.off(UiEvents.Construction.Select, this.cancelHandler)
			EventBus.off(UiEvents.Construction.Cancel, this.cancelHandler)
			EventBus.off(UiEvents.Building.WorkAreaSelect, this.cancelHandler)
			EventBus.off(UiEvents.Building.WorkAreaCancel, this.cancelHandler)
		}
		window.removeEventListener('contextmenu', this.boundContextMenu)
	}

	private setupEventListeners(): void {
		this.selectHandler = (data: { roadType: RoadType }) => {
			this.selectRoad(data.roadType)
		}
		EventBus.on(UiEvents.Road.Select, this.selectHandler)

		this.cancelHandler = () => {
			this.cancelSelection(false)
		}
		EventBus.on(UiEvents.Road.Cancel, this.cancelHandler)
		EventBus.on(UiEvents.Construction.Select, this.cancelHandler)
		EventBus.on(UiEvents.Construction.Cancel, this.cancelHandler)
		EventBus.on(UiEvents.Building.WorkAreaSelect, this.cancelHandler)
		EventBus.on(UiEvents.Building.WorkAreaCancel, this.cancelHandler)
	}

	private selectRoad(roadType: RoadType): void {
		if (this.state.selectedRoadType === roadType) {
			this.cancelSelection(true)
			return
		}

		EventBus.emit(UiEvents.Construction.Cancel, {})
		EventBus.emit(UiEvents.Building.WorkAreaCancel, {})

		if (this.state.selectedRoadType) {
			this.destroyGhostMeshes()
			this.removeMouseHandlers()
		}

		this.state.selectedRoadType = roadType
		this.state.startTile = null
		this.state.currentTile = null
		this.createGhostMeshes()
		this.setupMouseHandlers()
		this.updateSelectionText()
	}

	private cancelSelection(emitEvent: boolean): void {
		if (emitEvent) {
			EventBus.emit(UiEvents.Road.Cancel, {})
			return
		}

		if (!this.state.selectedRoadType) {
			return
		}

		this.state.selectedRoadType = null
		this.state.startTile = null
		this.state.currentTile = null
		this.state.isValidPosition = false
		this.destroyGhostMeshes()
		this.removeMouseHandlers()
		EventBus.emit(UiEvents.Road.Cancelled, {})
	}

	private createGhostMeshes(): void {
		this.destroyGhostMeshes()
		const text = document.createElement('div')
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
		window.addEventListener('contextmenu', this.boundContextMenu)
	}

	private destroyGhostMeshes(): void {
		this.state.ghostMeshes.forEach((mesh) => mesh.dispose())
		this.state.ghostMeshes = []
		if (this.state.selectionText) {
			this.state.selectionText.remove()
			this.state.selectionText = null
		}
		window.removeEventListener('contextmenu', this.boundContextMenu)
	}

	private setupMouseHandlers(): void {
		if (this.handlersActive) return
		this.scene.runtime.input.on('pointermove', this.handleMouseMove)
		this.scene.runtime.input.on('pointerup', this.handleMouseClick)
		window.addEventListener('keydown', this.handleEscape)
		this.handlersActive = true
	}

	private removeMouseHandlers(): void {
		if (!this.handlersActive) return
		this.scene.runtime.input.off('pointermove', this.handleMouseMove)
		this.scene.runtime.input.off('pointerup', this.handleMouseClick)
		window.removeEventListener('keydown', this.handleEscape)
		this.handlersActive = false
	}

	private handleMouseMove = (pointer: PointerState) => {
		if (!this.state.selectedRoadType) return
		const world = pointer.world ?? this.scene.runtime.input.getWorldPoint()
		if (!world) return
		this.updateGhostPosition(world.x, world.z)
	}

	private handleMouseClick = (pointer: PointerState) => {
		if (pointer.wasDrag || pointer.button !== 0) return
		if (!this.state.selectedRoadType) return
		if (!this.state.currentTile) {
			const world = pointer.world ?? this.scene.runtime.input.getWorldPoint()
			if (!world) return
			this.updateGhostPosition(world.x, world.z)
		}
		if (!this.state.currentTile) return

		if (!this.state.startTile) {
			this.state.startTile = { ...this.state.currentTile }
			this.updateSelectionText()
			this.redrawGhost()
			return
		}

		const tiles = this.getLineTiles(this.state.startTile, this.state.currentTile)
		if (tiles.length > 0) {
			EventBus.emit(Event.Roads.CS.Place, {
				tiles,
				roadType: this.state.selectedRoadType
			})
		}

		this.state.startTile = { ...this.state.currentTile }
		this.updateSelectionText()
		this.redrawGhost()
	}

	private handleEscape = (event: KeyboardEvent) => {
		if (event.code === 'Escape') {
			this.cancelSelection(false)
		}
	}

	private updateGhostPosition(worldX: number, worldY: number): void {
		const tileSize = this.getTileSize()
		let tileX = Math.floor(worldX / tileSize)
		let tileY = Math.floor(worldY / tileSize)

		if (this.state.startTile) {
			const dx = Math.abs(tileX - this.state.startTile.x)
			const dy = Math.abs(tileY - this.state.startTile.y)
			if (dx >= dy) {
				tileY = this.state.startTile.y
			} else {
				tileX = this.state.startTile.x
			}
		}

		const map = this.scene.map
		let valid = true
		if (map) {
			valid = tileX >= 0 && tileY >= 0 && tileX < map.widthInPixels / tileSize && tileY < map.heightInPixels / tileSize
		}

		this.state.isValidPosition = valid
		this.state.currentTile = valid ? { x: tileX, y: tileY } : null
		this.redrawGhost()
	}

	private redrawGhost(): void {
		this.state.ghostMeshes.forEach((mesh) => mesh.dispose())
		this.state.ghostMeshes = []

		if (!this.state.currentTile || this.state.selectedRoadType === null) {
			return
		}

		const tileSize = this.getTileSize()
		const color = this.state.isValidPosition ? ROAD_PREVIEW_COLORS[this.state.selectedRoadType] : '#ff0000'
		const tiles = this.state.startTile
			? this.getLineTiles(this.state.startTile, this.state.currentTile)
			: [this.state.currentTile]

		for (const tile of tiles) {
			const size = { width: tileSize, length: tileSize, height: 1 }
			const mesh = this.scene.runtime.renderer.createBox(`road-preview-${tile.x}-${tile.y}`, size)
			this.scene.runtime.renderer.applyTint(mesh, color)
			const centerX = tile.x * tileSize + tileSize / 2
			const centerY = tile.y * tileSize + tileSize / 2
			this.scene.runtime.renderer.setMeshPosition(mesh, centerX, 0.5, centerY)
			this.state.ghostMeshes.push(mesh)
		}
	}

	private updateSelectionText(): void {
		if (!this.state.selectionText) return
		if (!this.state.selectedRoadType) {
			this.state.selectionText.textContent = ''
			return
		}
		this.state.selectionText.textContent = this.state.startTile
			? 'Click to finish road (Esc to cancel)'
			: 'Click to start road (Esc to cancel)'
	}

	private getTileSize(): number {
		return this.scene.map?.tileWidth || 32
	}

	private getLineTiles(start: { x: number; y: number }, end: { x: number; y: number }): Array<{ x: number; y: number }> {
		const tiles: Array<{ x: number; y: number }> = []
		let x0 = start.x
		let y0 = start.y
		const x1 = end.x
		const y1 = end.y
		const dx = Math.abs(x1 - x0)
		const dy = Math.abs(y1 - y0)
		const sx = x0 < x1 ? 1 : -1
		const sy = y0 < y1 ? 1 : -1
		let err = dx - dy

		while (true) {
			tiles.push({ x: x0, y: y0 })
			if (x0 === x1 && y0 === y1) {
				break
			}
			const e2 = 2 * err
			if (e2 > -dy) {
				err -= dy
				x0 += sx
			}
			if (e2 < dx) {
				err += dx
				y0 += sy
			}
		}

		return tiles
	}
}
