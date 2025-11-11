import { Scene, GameObjects } from 'phaser'
import { MapObject, ConstructionStage } from '@rugged/game'
import { ItemMetadata } from '@rugged/game'
import { itemService } from "../../services/ItemService"
import { itemTextureService } from "../../services/ItemTextureService"
import { buildingService } from "../../services/BuildingService"
import { EventBus } from '../../EventBus'
import { Event } from '@rugged/game'

export class MapObjectView {
	private sprite: GameObjects.Sprite | null = null
	private emojiText: GameObjects.Text | null = null
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
				
				// Replace sprite with emoji text for completed buildings
				this.replaceSpriteWithEmoji(scene)
				
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
		// For completed buildings, use emoji text instead of sprite
		if (this.isBuilding && this.buildingStage === ConstructionStage.Completed) {
			this.replaceSpriteWithEmoji(scene)
			return
		}

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

	private replaceSpriteWithEmoji(scene: Scene): void {
		if (!this.isBuilding || !this.mapObject.metadata?.footprint) return

		// If emoji text already exists, don't recreate it
		if (this.emojiText) return

		// Get building definition to access icon
		const buildingId = this.mapObject.metadata.buildingId
		const buildingDefinition = buildingId ? buildingService.getBuildingDefinition(buildingId) : null
		const emoji = buildingDefinition?.icon || '🏗️'

		// Calculate footprint size
		const tileSize = 32
		const width = this.mapObject.metadata.footprint.width * tileSize
		const height = this.mapObject.metadata.footprint.height * tileSize

		// Calculate font size to cover footprint (use smaller dimension to ensure it fits)
		const fontSize = Math.min(width, height) * 0.9 // 90% of smaller dimension to ensure it fits

		// Destroy existing sprite if present
		if (this.sprite) {
			// Remove click handler
			if (this.sprite.input) {
				this.sprite.off('pointerdown', this.handleBuildingClick, this)
				this.sprite.removeInteractive()
			}
			this.sprite.destroy()
			this.sprite = null
		}

		// Create emoji text centered in the footprint
		const centerX = this.mapObject.position.x + width / 2
		const centerY = this.mapObject.position.y + height / 2

		this.emojiText = scene.add.text(centerX, centerY, emoji, {
			fontSize: `${fontSize}px`,
			align: 'center'
		})
		this.emojiText.setOrigin(0.5, 0.5)
		this.emojiText.setDepth(this.mapObject.position.y)

		// Make emoji text interactive/clickable
		this.emojiText.setInteractive({ useHandCursor: true })
		this.emojiText.on('pointerdown', this.handleBuildingClick, this)

		// Add physics body using the footprint
		scene.physics.add.existing(this.emojiText, true)
		const body = this.emojiText.body as Phaser.Physics.Arcade.Body
		if (body) {
			body.setSize(width, height)
			body.setOffset(-width / 2, -height / 2)
		}

		console.log(`[MapObjectView] Replaced sprite with emoji text: ${emoji} at size ${fontSize}px for footprint ${this.mapObject.metadata.footprint.width}x${this.mapObject.metadata.footprint.height}`)
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
		// Return emoji text as sprite for collision detection if building is completed
		if (this.emojiText && this.isBuilding && this.buildingStage === ConstructionStage.Completed) {
			return this.emojiText as any
		}
		return this.sprite
	}
	
	public getMapObject(): MapObject {
		return this.mapObject
	}
	
	private createProgressBar(scene: Scene) {
		if (!this.isBuilding) return

		// Use sprite or emoji text for positioning
		const displayObject = this.sprite || this.emojiText
		if (!displayObject) return

		const barWidth = this.mapObject.metadata?.footprint 
			? this.mapObject.metadata.footprint.width * 32 
			: displayObject.displayWidth || 64
		const barHeight = 6
		const barX = displayObject.x - (this.emojiText ? barWidth / 2 : 0)
		const barY = displayObject.y - (this.emojiText ? (this.mapObject.metadata?.footprint?.height || 1) * 32 / 2 + 15 : 15)

		// Create background bar
		this.progressBarBg = scene.add.graphics()
		this.progressBarBg.fillStyle(0x000000, 0.5)
		this.progressBarBg.fillRect(barX, barY, barWidth, barHeight)
		this.progressBarBg.setDepth((displayObject.depth || 0) + 1)

		// Create progress bar
		this.progressBar = scene.add.graphics()
		this.progressBar.setDepth((displayObject.depth || 0) + 2)

		// Create progress text
		this.progressText = scene.add.text(barX + barWidth / 2, barY - 10, `${Math.round(this.buildingProgress)}%`, {
			fontSize: '12px',
			color: '#ffffff',
			stroke: '#000000',
			strokeThickness: 2
		})
		this.progressText.setOrigin(0.5, 0.5)
		this.progressText.setDepth((displayObject.depth || 0) + 3)

		this.updateProgressBar(scene)
	}

	private updateProgressBar(scene: Scene) {
		if (!this.progressBar || !this.progressBarBg || !this.isBuilding) return

		// Use sprite or emoji text position
		const displayObject = this.sprite || this.emojiText
		if (!displayObject) return

		const barWidth = this.mapObject.metadata?.footprint 
			? this.mapObject.metadata.footprint.width * 32 
			: displayObject.displayWidth || 64
		const barHeight = 6
		const barX = displayObject.x - (this.emojiText ? barWidth / 2 : 0)
		const barY = displayObject.y - (this.emojiText ? (this.mapObject.metadata?.footprint?.height || 1) * 32 / 2 + 15 : 15)

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
		// Update progress bar position if sprite or emoji text moves
		if (this.isBuilding && (this.sprite || this.emojiText) && (this.progressBar || this.progressBarBg)) {
			const scene = this.sprite?.scene || this.emojiText?.scene
			if (scene) {
				this.updateProgressBar(scene)
			}
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

		// Remove click handler if sprite or emoji text is interactive
		if (this.sprite && this.isBuilding) {
			this.sprite.off('pointerdown', this.handleBuildingClick, this)
			this.sprite.removeInteractive()
		}
		if (this.emojiText && this.isBuilding) {
			this.emojiText.off('pointerdown', this.handleBuildingClick, this)
			this.emojiText.removeInteractive()
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
		if (this.emojiText) {
			this.emojiText.destroy()
			this.emojiText = null
		}
	}
} 