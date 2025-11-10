import { Scene, GameObjects } from 'phaser'
import { MapObject, ConstructionStage } from '@rugged/game'
import { ItemMetadata } from '@rugged/game'
import { itemService } from "../../services/ItemService"
import { itemTextureService } from "../../services/ItemTextureService"
import { EventBus } from '../../EventBus'
import { Event } from '@rugged/game'

export class MapObjectView {
	private sprite: GameObjects.Sprite | null = null
	private mapObject: MapObject
	private unsubscribe: (() => void) | null = null
	private progressBar: GameObjects.Graphics | null = null
	private progressBarBg: GameObjects.Graphics | null = null
	private progressText: GameObjects.Text | null = null
	private isBuilding: boolean = false
	private buildingProgress: number = 0
	private buildingStage: ConstructionStage | null = null
	private progressHandler: ((data: { buildingInstanceId: string, progress: number, stage: string }) => void) | null = null
	private completedHandler: ((data: { building: any }) => void) | null = null

	constructor(scene: Scene, mapObject: MapObject) {
		this.mapObject = mapObject
		
		// Check if this is a building
		this.isBuilding = Boolean(mapObject.metadata?.buildingId || mapObject.metadata?.buildingInstanceId)
		if (this.isBuilding) {
			this.buildingProgress = mapObject.metadata?.progress || 0
			this.buildingStage = mapObject.metadata?.stage || ConstructionStage.Foundation
			this.setupBuildingEvents(scene)
		}
		
		// Subscribe to item metadata updates
		this.unsubscribe = itemService.subscribeToItemMetadata(mapObject.item.itemType, (itemMetadata) => {
			if (itemMetadata) {
				this.initializeSprite(scene, itemMetadata)
				if (this.isBuilding) {
					this.createProgressBar(scene)
				}
			}
		})
	}

	private setupBuildingEvents(scene: Scene) {
		// Listen for building progress updates
		this.progressHandler = (data: { buildingInstanceId: string, progress: number, stage: string }) => {
			if (this.mapObject.metadata?.buildingInstanceId === data.buildingInstanceId) {
				this.buildingProgress = data.progress
				this.buildingStage = data.stage as ConstructionStage
				this.updateProgressBar(scene)
			}
		}
		EventBus.on(Event.Buildings.SC.Progress, this.progressHandler)

		// Listen for building completion
		this.completedHandler = (data: { building: any }) => {
			if (this.mapObject.metadata?.buildingInstanceId === data.building.id) {
				this.buildingProgress = 100
				this.buildingStage = ConstructionStage.Completed
				
				// Update metadata
				if (this.mapObject.metadata) {
					this.mapObject.metadata.stage = ConstructionStage.Completed
					this.mapObject.metadata.progress = 100
				}
				
				// Update display size to ensure footprint is still applied
				if (this.sprite && this.mapObject.metadata?.footprint) {
					const tileSize = 32
					const width = this.mapObject.metadata.footprint.width * tileSize
					const height = this.mapObject.metadata.footprint.height * tileSize
					this.sprite.setDisplaySize(width, height)
					console.log(`[MapObjectView] Updated building display size on completion: ${width}x${height} (footprint: ${this.mapObject.metadata.footprint.width}x${this.mapObject.metadata.footprint.height} tiles)`)
				}
				
				this.updateProgressBar(scene)
				// Hide progress bar when completed
				if (this.progressBar) this.progressBar.setVisible(false)
				if (this.progressBarBg) this.progressBarBg.setVisible(false)
				if (this.progressText) this.progressText.setVisible(false)
			}
		}
		EventBus.on(Event.Buildings.SC.Completed, this.completedHandler)
	}
	
	private initializeSprite(scene: Scene, itemMetadata: ItemMetadata): void {
		// Create the sprite using the appropriate texture
		const texture = this.getTexture(itemMetadata)
		this.sprite = scene.add.sprite(
			this.mapObject.position.x,
			this.mapObject.position.y,
			texture.key,
			texture.frame
		)
		
		// Set the anchor point to top-left corner
		this.sprite.setOrigin(0, 0)
		
		// Set the rotation
		this.sprite.setRotation(this.mapObject.rotation)
		
		// Set the scale from the texture configuration
		this.sprite.setScale(texture.scale)
		
		// Add physics body only if the item blocks movement
		if (itemMetadata?.placement?.blocksMovement) {
			scene.physics.add.existing(this.sprite, true) // true makes it static
		}
		
		// Set the display size based on the item type
		this.setDisplaySize(itemMetadata)

		// Make building sprites interactive/clickable
		if (this.isBuilding) {
			this.sprite.setInteractive({ useHandCursor: true })
			this.sprite.on('pointerdown', this.handleBuildingClick, this)
		}
	}

	private handleBuildingClick = (pointer: Phaser.Input.Pointer) => {
		// Only handle left clicks
		if (!pointer.leftButtonDown()) return

		// Stop propagation to prevent other click handlers (like map clicks)
		if (pointer.event) {
			pointer.event.stopPropagation()
		}

		// Emit event to show building info panel
		// BuildingService will check if building exists and emit selection event
		const buildingInstanceId = this.mapObject.metadata?.buildingInstanceId
		if (buildingInstanceId) {
			EventBus.emit('ui:building:click', {
				buildingInstanceId,
				buildingId: this.mapObject.metadata?.buildingId
			})
		}
	}
	
	private getTexture(itemMetadata: ItemMetadata): { key: string, frame: number, scale: number } {
		// If we have metadata with a placement property, try to get the placeable texture
		if (itemMetadata?.placement) {
			const placeableTexture = itemTextureService.getPlaceableItemTexture(this.mapObject.item.itemType)
			if (placeableTexture) {
				return placeableTexture
			}
		}
		
		// Fallback to regular item texture
		const regularTexture = itemTextureService.getItemTexture(this.mapObject.item.itemType)
		if (regularTexture) {
			return regularTexture
		}
		
		// If no texture is found, use the emoji as a fallback
		return {
			key: itemMetadata?.emoji || 'mozgotrzep',
			frame: 0,
			scale: 1
		}
	}
	
	private setDisplaySize(itemMetadata: ItemMetadata): void {
		if (!this.sprite) return
		
		const tileSize = 32 // Default tile size
		
		// For buildings, use footprint from metadata (in tiles, convert to pixels)
		if (this.isBuilding && this.mapObject.metadata?.footprint) {
			const width = this.mapObject.metadata.footprint.width * tileSize
			const height = this.mapObject.metadata.footprint.height * tileSize
			this.sprite.setDisplaySize(width, height)
			console.log(`[MapObjectView] Set building display size: ${width}x${height} (footprint: ${this.mapObject.metadata.footprint.width}x${this.mapObject.metadata.footprint.height} tiles)`)
		} else if (itemMetadata?.placement?.size) {
			// Regular items: use placement size (assume in tiles, convert to pixels)
			const width = itemMetadata.placement.size.width * tileSize
			const height = itemMetadata.placement.size.height * tileSize
			this.sprite.setDisplaySize(width, height)
		} else {
			// Use default size
			this.sprite.setDisplaySize(tileSize, tileSize)
		}
	}
	
	public getSprite(): GameObjects.Sprite | null {
		return this.sprite
	}
	
	public getMapObject(): MapObject {
		return this.mapObject
	}
	
	private createProgressBar(scene: Scene) {
		if (!this.sprite || !this.isBuilding) return

		const sprite = this.sprite
		const barWidth = sprite.displayWidth || 64
		const barHeight = 6
		const barX = sprite.x
		const barY = sprite.y - 15

		// Create background bar
		this.progressBarBg = scene.add.graphics()
		this.progressBarBg.fillStyle(0x000000, 0.5)
		this.progressBarBg.fillRect(barX, barY, barWidth, barHeight)
		this.progressBarBg.setDepth(sprite.depth + 1)

		// Create progress bar
		this.progressBar = scene.add.graphics()
		this.progressBar.setDepth(sprite.depth + 2)

		// Create progress text
		this.progressText = scene.add.text(barX + barWidth / 2, barY - 10, `${Math.round(this.buildingProgress)}%`, {
			fontSize: '12px',
			color: '#ffffff',
			stroke: '#000000',
			strokeThickness: 2
		})
		this.progressText.setOrigin(0.5, 0.5)
		this.progressText.setDepth(sprite.depth + 3)

		this.updateProgressBar(scene)
	}

	private updateProgressBar(scene: Scene) {
		if (!this.progressBar || !this.progressBarBg || !this.sprite || !this.isBuilding) return

		const sprite = this.sprite
		const barWidth = sprite.displayWidth || 64
		const barHeight = 6
		const barX = sprite.x
		const barY = sprite.y - 15

		// Update progress bar
		this.progressBar.clear()
		const progress = Math.max(0, Math.min(100, this.buildingProgress))
		const progressWidth = (barWidth * progress) / 100

		// Color based on stage
		let color = 0x00ff00 // Green for completed
		if (this.buildingStage === ConstructionStage.Foundation) {
			color = 0xffaa00 // Orange for foundation
		} else if (this.buildingStage === ConstructionStage.Constructing) {
			color = 0x00aaff // Blue for constructing
		}

		this.progressBar.fillStyle(color, 0.8)
		this.progressBar.fillRect(barX, barY, progressWidth, barHeight)

		// Update progress text
		if (this.progressText) {
			this.progressText.setText(`${Math.round(progress)}%`)
			this.progressText.setPosition(barX + barWidth / 2, barY - 10)
		}

		// Hide if completed
		if (this.buildingStage === ConstructionStage.Completed) {
			if (this.progressBar) this.progressBar.setVisible(false)
			if (this.progressBarBg) this.progressBarBg.setVisible(false)
			if (this.progressText) this.progressText.setVisible(false)
		} else {
			if (this.progressBar) this.progressBar.setVisible(true)
			if (this.progressBarBg) this.progressBarBg.setVisible(true)
			if (this.progressText) this.progressText.setVisible(true)
		}
	}

	public update() {
		// Update progress bar position if sprite moves
		if (this.isBuilding && this.sprite && (this.progressBar || this.progressBarBg)) {
			this.updateProgressBar(this.sprite.scene)
		}
	}

	public destroy(): void {
		// Remove building event listeners
		if (this.progressHandler) {
			EventBus.off(Event.Buildings.SC.Progress, this.progressHandler)
			this.progressHandler = null
		}
		if (this.completedHandler) {
			EventBus.off(Event.Buildings.SC.Completed, this.completedHandler)
			this.completedHandler = null
		}

		// Remove click handler if sprite is interactive
		if (this.sprite && this.isBuilding) {
			this.sprite.off('pointerdown', this.handleBuildingClick, this)
			this.sprite.removeInteractive()
		}

		if (this.unsubscribe) {
			this.unsubscribe()
			this.unsubscribe = null
		}
		if (this.progressBar) {
			this.progressBar.destroy()
			this.progressBar = null
		}
		if (this.progressBarBg) {
			this.progressBarBg.destroy()
			this.progressBarBg = null
		}
		if (this.progressText) {
			this.progressText.destroy()
			this.progressText = null
		}
		if (this.sprite) {
			this.sprite.destroy()
			this.sprite = null
		}
	}
} 