import { Scene, GameObjects, Input } from 'phaser'
import { EventBus } from '../EventBus'
import { Event, BuildingDefinition } from '@rugged/game'

const CONTENT_FOLDER = import.meta.env.VITE_GAME_CONTENT || 'settlerpolis'
const contentModules = import.meta.glob('../../../../../content/*/index.ts', { eager: true })
const content = contentModules[`../../../../../content/${CONTENT_FOLDER}/index.ts`]

interface BuildingPlacementState {
	selectedBuildingId: string | null
	ghostSprite: GameObjects.Graphics | null
	isValidPosition: boolean
	lastMousePosition: { x: number, y: number } | null
}

export class BuildingPlacementManager {
	private scene: Scene
	private state: BuildingPlacementState = {
		selectedBuildingId: null,
		ghostSprite: null,
		isValidPosition: true,
		lastMousePosition: null
	}
	private buildings: Map<string, BuildingDefinition> = new Map()
	private tileSize: number = 32 // Default tile size
	private selectHandler: ((data: { buildingId: string }) => void) | null = null
	private cancelHandler: (() => void) | null = null
	private placedHandler: (() => void) | null = null

	constructor(scene: Scene) {
		this.scene = scene
		this.loadBuildings()
		this.setupEventListeners()
	}

	private loadBuildings() {
		// Try to load from content (fallback)
		if (content?.buildings) {
			content.buildings.forEach((building: BuildingDefinition) => {
				this.buildings.set(building.id, building)
			})
			console.log('[BuildingPlacementManager] Loaded buildings from content:', this.buildings.size)
		}
	}

	private setupEventListeners() {
		// Listen for building catalog from server (primary source)
		const catalogHandler = (data: { buildings: BuildingDefinition[] }) => {
			console.log('[BuildingPlacementManager] Received building catalog:', data.buildings)
			if (data.buildings) {
				this.buildings.clear()
				data.buildings.forEach((building: BuildingDefinition) => {
					this.buildings.set(building.id, building)
				})
				console.log('[BuildingPlacementManager] Updated buildings map:', this.buildings.size)
			}
		}
		EventBus.on(Event.Buildings.SC.Catalog, catalogHandler)

		// Listen for building selection from ConstructionPanel
		this.selectHandler = (data: { buildingId: string }) => {
			this.selectBuilding(data.buildingId)
		}
		EventBus.on('ui:construction:select', this.selectHandler)

		// Listen for building selection cancel
		this.cancelHandler = () => {
			this.cancelSelection()
		}
		EventBus.on('ui:construction:cancel', this.cancelHandler)

		// Listen for building placement events to clear selection
		this.placedHandler = () => {
			this.cancelSelection()
		}
		EventBus.on(Event.Buildings.SC.Placed, this.placedHandler)
	}

	private selectBuilding(buildingId: string) {
		this.state.selectedBuildingId = buildingId
		this.createGhostSprite()
		this.setupMouseHandlers()
	}

	private cancelSelection() {
		this.state.selectedBuildingId = null
		this.destroyGhostSprite()
		this.removeMouseHandlers()
	}

	private createGhostSprite() {
		if (!this.state.selectedBuildingId) return

		const building = this.buildings.get(this.state.selectedBuildingId)
		if (!building) return

		// Destroy existing ghost if any
		this.destroyGhostSprite()

		// Create a graphics object for the ghost preview
		const ghost = this.scene.add.graphics()
		ghost.setDepth(200) // Render above most things
		ghost.setAlpha(0.5) // Semi-transparent

		this.state.ghostSprite = ghost
		this.updateGhostPosition(0, 0) // Initial position
	}

	private destroyGhostSprite() {
		if (this.state.ghostSprite) {
			this.state.ghostSprite.destroy()
			this.state.ghostSprite = null
		}
	}

	private updateGhostPosition(worldX: number, worldY: number) {
		if (!this.state.ghostSprite || !this.state.selectedBuildingId) return

		const building = this.buildings.get(this.state.selectedBuildingId)
		if (!building) return

		// Snap to grid (assuming tile size)
		const snappedX = Math.floor(worldX / this.tileSize) * this.tileSize
		const snappedY = Math.floor(worldY / this.tileSize) * this.tileSize

		this.state.lastMousePosition = { x: snappedX, y: snappedY }

		// Check if position is valid (simplified for Phase A - can check collisions later)
		this.state.isValidPosition = true // TODO: Add collision checking

		// Clear and redraw ghost
		const ghost = this.state.ghostSprite
		ghost.clear()

		// Draw building footprint
		const width = building.footprint.width * this.tileSize
		const height = building.footprint.height * this.tileSize
		const color = this.state.isValidPosition ? 0x00ff00 : 0xff0000

		// Draw filled rectangle with border
		ghost.fillStyle(color, 0.3)
		ghost.fillRect(snappedX, snappedY, width, height)
		
		ghost.lineStyle(2, color, 0.8)
		ghost.strokeRect(snappedX, snappedY, width, height)

		// Draw building icon/name in center
		const centerX = snappedX + width / 2
		const centerY = snappedY + height / 2
		
		// Draw building icon if available
		if (building.icon) {
			ghost.fillStyle(0xffffff, 0.8)
			ghost.fillCircle(centerX, centerY, 10)
		}
	}

	private setupMouseHandlers() {
		// Update ghost position on mouse move
		this.scene.input.on('pointermove', this.handleMouseMove, this)
		
		// Place building on click
		this.scene.input.on('pointerdown', this.handleMouseClick, this)
		
		// Cancel on right click or Escape
		this.scene.input.keyboard.on('keydown-ESC', this.handleEscape, this)
	}

	private removeMouseHandlers() {
		this.scene.input.off('pointermove', this.handleMouseMove, this)
		this.scene.input.off('pointerdown', this.handleMouseClick, this)
		this.scene.input.keyboard.off('keydown-ESC', this.handleEscape, this)
	}

	private handleMouseMove = (pointer: Input.Pointer) => {
		if (!this.state.selectedBuildingId) return

		// Convert screen coordinates to world coordinates
		const camera = this.scene.cameras.main
		const worldX = camera.scrollX + pointer.x
		const worldY = camera.scrollY + pointer.y

		this.updateGhostPosition(worldX, worldY)
	}

	private handleMouseClick = (pointer: Input.Pointer) => {
		if (!this.state.selectedBuildingId || !this.state.isValidPosition || !this.state.lastMousePosition) return

		// Only place on left click
		if (pointer.leftButtonDown()) {
			this.placeBuilding(this.state.lastMousePosition.x, this.state.lastMousePosition.y)
		}
	}

	private handleEscape = () => {
		this.cancelSelection()
		EventBus.emit('ui:construction:cancel', {})
	}

	private placeBuilding(x: number, y: number) {
		if (!this.state.selectedBuildingId) return

		// Convert pixel coordinates to tile coordinates (or use pixel coordinates directly)
		// For Phase A, we'll use pixel coordinates directly
		const position = {
			x: Math.floor(x),
			y: Math.floor(y)
		}

		// Emit building placement event
		EventBus.emit(Event.Buildings.CS.Place, {
			buildingId: this.state.selectedBuildingId,
			position
		})
	}

	public update() {
		// Update logic if needed
	}

	public destroy() {
		this.cancelSelection()
		
		if (this.selectHandler) {
			EventBus.off('ui:construction:select', this.selectHandler)
			this.selectHandler = null
		}
		if (this.cancelHandler) {
			EventBus.off('ui:construction:cancel', this.cancelHandler)
			this.cancelHandler = null
		}
		if (this.placedHandler) {
			EventBus.off(Event.Buildings.SC.Placed, this.placedHandler)
			this.placedHandler = null
		}
	}
}
