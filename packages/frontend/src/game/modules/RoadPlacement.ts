import { Scene, GameObjects, Input } from 'phaser'
import { EventBus } from '../EventBus'
import { Event, RoadType } from '@rugged/game'

interface RoadPlacementState {
	selectedRoadType: RoadType | null
	startTile: { x: number, y: number } | null
	currentTile: { x: number, y: number } | null
	ghostSprite: GameObjects.Graphics | null
	selectionText: GameObjects.Text | null
	isValidPosition: boolean
}

const ROAD_PREVIEW_COLORS: Record<RoadType, number> = {
	[RoadType.None]: 0x000000,
	[RoadType.Dirt]: 0xb58a58,
	[RoadType.Stone]: 0x8a8a8a
}

export class RoadPlacementManager {
	private scene: Scene
	private handlersActive = false
	private state: RoadPlacementState = {
		selectedRoadType: null,
		startTile: null,
		currentTile: null,
		ghostSprite: null,
		selectionText: null,
		isValidPosition: false
	}
	private selectHandler: ((data: { roadType: RoadType }) => void) | null = null
	private cancelHandler: (() => void) | null = null

	constructor(scene: Scene) {
		this.scene = scene
		this.setupEventListeners()
	}

	public update(): void {
		// no-op for now
	}

	public destroy(): void {
		this.cancelSelection(false)
		if (this.selectHandler) {
			EventBus.off('ui:road:select', this.selectHandler)
		}
		if (this.cancelHandler) {
			EventBus.off('ui:road:cancel', this.cancelHandler)
			EventBus.off('ui:construction:select', this.cancelHandler)
			EventBus.off('ui:construction:cancel', this.cancelHandler)
			EventBus.off('ui:building:work-area:select', this.cancelHandler)
			EventBus.off('ui:building:work-area:cancel', this.cancelHandler)
		}
	}

	private setupEventListeners(): void {
		this.selectHandler = (data: { roadType: RoadType }) => {
			this.selectRoad(data.roadType)
		}
		EventBus.on('ui:road:select', this.selectHandler)

		this.cancelHandler = () => {
			this.cancelSelection(false)
		}
		EventBus.on('ui:road:cancel', this.cancelHandler)
		EventBus.on('ui:construction:select', this.cancelHandler)
		EventBus.on('ui:construction:cancel', this.cancelHandler)
		EventBus.on('ui:building:work-area:select', this.cancelHandler)
		EventBus.on('ui:building:work-area:cancel', this.cancelHandler)
	}

	private selectRoad(roadType: RoadType): void {
		if (this.state.selectedRoadType === roadType) {
			this.cancelSelection(true)
			return
		}

		EventBus.emit('ui:construction:cancel', {})
		EventBus.emit('ui:building:work-area:cancel', {})

		if (this.state.selectedRoadType) {
			this.destroyGhostSprite()
			this.removeMouseHandlers()
		}

		this.state.selectedRoadType = roadType
		this.state.startTile = null
		this.state.currentTile = null
		this.createGhostSprite()
		this.setupMouseHandlers()
		this.updateSelectionText()
	}

	private cancelSelection(emitEvent: boolean): void {
		if (emitEvent) {
			EventBus.emit('ui:road:cancel', {})
			return
		}

		if (!this.state.selectedRoadType) {
			return
		}

		this.state.selectedRoadType = null
		this.state.startTile = null
		this.state.currentTile = null
		this.state.isValidPosition = false
		this.destroyGhostSprite()
		this.removeMouseHandlers()
		EventBus.emit('ui:road:cancelled', {})
	}

	private createGhostSprite(): void {
		this.destroyGhostSprite()
		const ghost = this.scene.add.graphics()
		ghost.setDepth(200)
		ghost.setAlpha(0.6)
		this.state.ghostSprite = ghost

		const text = this.scene.add.text(16, 16, '', {
			fontSize: '16px',
			color: '#ffffff',
			backgroundColor: '#000000',
			padding: { x: 8, y: 4 }
		})
		text.setScrollFactor(0)
		text.setDepth(1000)
		this.state.selectionText = text
	}

	private destroyGhostSprite(): void {
		if (this.state.ghostSprite) {
			this.state.ghostSprite.destroy()
			this.state.ghostSprite = null
		}
		if (this.state.selectionText) {
			this.state.selectionText.destroy()
			this.state.selectionText = null
		}
	}

	private setupMouseHandlers(): void {
		if (this.handlersActive) {
			return
		}
		this.scene.input.on('pointermove', this.handleMouseMove, this)
		this.scene.input.on('pointerdown', this.handleMouseClick, this)
		this.scene.input.keyboard.on('keydown-ESC', this.handleEscape, this)
		this.handlersActive = true
	}

	private removeMouseHandlers(): void {
		if (!this.handlersActive) {
			return
		}
		this.scene.input.off('pointermove', this.handleMouseMove, this)
		this.scene.input.off('pointerdown', this.handleMouseClick, this)
		this.scene.input.keyboard.off('keydown-ESC', this.handleEscape, this)
		this.handlersActive = false
	}

	private handleMouseMove = (pointer: Input.Pointer) => {
		if (!this.state.selectedRoadType) return

		const camera = this.scene.cameras.main
		const worldX = camera.scrollX + pointer.x
		const worldY = camera.scrollY + pointer.y

		this.updateGhostPosition(worldX, worldY)
	}

	private handleMouseClick = (pointer: Input.Pointer) => {
		if (!this.state.selectedRoadType) return

		if (pointer.rightButtonDown()) {
			this.cancelSelection(false)
			return
		}

		if (!pointer.leftButtonDown() || !this.state.currentTile) {
			return
		}

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

	private handleEscape = () => {
		this.cancelSelection(false)
	}

	private updateGhostPosition(worldX: number, worldY: number): void {
		const tileSize = this.getTileSize()
		const tileX = Math.floor(worldX / tileSize)
		const tileY = Math.floor(worldY / tileSize)

		const map = (this.scene as any).map
		let valid = true
		if (map) {
			valid = tileX >= 0 && tileY >= 0 && tileX < map.width && tileY < map.height
		}

		this.state.isValidPosition = valid
		this.state.currentTile = valid ? { x: tileX, y: tileY } : null
		this.redrawGhost()
	}

	private redrawGhost(): void {
		if (!this.state.ghostSprite) return
		const ghost = this.state.ghostSprite
		ghost.clear()

		if (!this.state.currentTile || this.state.selectedRoadType === null) {
			return
		}

		const tileSize = this.getTileSize()
		const color = ROAD_PREVIEW_COLORS[this.state.selectedRoadType] || 0xb58a58
		const tiles = this.state.startTile
			? this.getLineTiles(this.state.startTile, this.state.currentTile)
			: [this.state.currentTile]

		ghost.fillStyle(this.state.isValidPosition ? color : 0xff0000, 0.45)
		ghost.lineStyle(2, this.state.isValidPosition ? 0xffffff : 0xff0000, 0.6)

		for (const tile of tiles) {
			const x = tile.x * tileSize
			const y = tile.y * tileSize
			ghost.fillRect(x, y, tileSize, tileSize)
			ghost.strokeRect(x + 0.5, y + 0.5, tileSize - 1, tileSize - 1)
		}
	}

	private updateSelectionText(): void {
		if (!this.state.selectionText) {
			return
		}
		if (!this.state.selectedRoadType) {
			this.state.selectionText.setText('')
			return
		}
		this.state.selectionText.setText(this.state.startTile
			? 'Click to finish road (Esc to cancel)'
			: 'Click to start road (Esc to cancel)')
	}

	private getTileSize(): number {
		const map = (this.scene as any).map
		return map?.tileWidth || map?.tilewidth || 32
	}

	private getLineTiles(start: { x: number, y: number }, end: { x: number, y: number }): Array<{ x: number, y: number }> {
		const tiles: Array<{ x: number, y: number }> = []
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
