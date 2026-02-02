import { Scene, GameObjects } from 'phaser'
import { MapObject, ConstructionStage } from '@rugged/game'
import { ItemMetadata } from '@rugged/game'
import { itemService } from "../../services/ItemService"
import { itemTextureService } from "../../services/ItemTextureService"
import { buildingService } from "../../services/BuildingService"
import { storageService } from '../../services/StorageService'
import { EventBus } from '../../EventBus'
import { UiEvents } from '../../uiEvents'
import { Event } from '@rugged/game'

export class MapObjectView {
	private scene: Scene
	private sprite: GameObjects.Sprite | null = null
	private emojiText: GameObjects.Text | null = null
	private mapObject: MapObject
	private unsubscribe: (() => void) | null = null
	private progressBar: GameObjects.Graphics | null = null
	private progressBarBg: GameObjects.Graphics | null = null
	private progressText: GameObjects.Text | null = null
	private highlightGraphics: GameObjects.Graphics | null = null
	private isHighlighted: boolean = false
	private highlightHandler: ((data: { buildingInstanceId: string, highlighted: boolean }) => void) | null = null
	private isBuilding: boolean = false
	private isStoragePile: boolean = false
	private storageSlotId: string | null = null
	private storageQuantityText: GameObjects.Text | null = null
	private storageSlotHandler: ((data: { slotId: string, quantity: number }) => void) | null = null
	private buildingProgress: number = 0
	private buildingStage: ConstructionStage | null = null
	private progressHandler: ((data: { buildingInstanceId: string, progress: number, stage: string }) => void) | null = null
	private completedHandler: ((data: { building: any }) => void) | null = null
	private isEmojiFallback: boolean = false
	private catalogHandler: ((data: { buildings: BuildingDefinition[] }) => void) | null = null
	private readonly treeGrowthStages = [0.65, 0.82, 1]

	constructor(scene: Scene, mapObject: MapObject) {
		this.scene = scene
		this.mapObject = mapObject
		
		// Check if this is a building
		this.isBuilding = Boolean(mapObject.metadata?.buildingId || mapObject.metadata?.buildingInstanceId)
		this.isStoragePile = Boolean(mapObject.metadata?.storagePile)
		this.storageSlotId = mapObject.metadata?.storageSlotId || null
		if (this.isBuilding) {
			this.buildingProgress = mapObject.metadata?.progress || 0
			this.buildingStage = mapObject.metadata?.stage || ConstructionStage.Foundation
			this.setupBuildingEvents(scene)
			this.setupHighlightEvents()
			this.setupCatalogEvents()
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

	private setupHighlightEvents(): void {
		this.highlightHandler = (data: { buildingInstanceId: string, highlighted: boolean }) => {
			if (!this.isBuilding) {
				return
			}
			if (this.mapObject.metadata?.buildingInstanceId !== data.buildingInstanceId) {
				return
			}
			this.setHighlighted(data.highlighted)
		}
		EventBus.on(UiEvents.Building.Highlight, this.highlightHandler)
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

	private setupCatalogEvents(): void {
		this.catalogHandler = () => {
			if (!this.isBuilding) {
				return
			}
			if (this.buildingStage !== ConstructionStage.Completed) {
				return
			}
			this.replaceSpriteWithEmoji(this.scene)
		}
		EventBus.on(Event.Buildings.SC.Catalog, this.catalogHandler)
	}
	
	private initializeSprite(scene: Scene, itemMetadata: ItemMetadata): void {
		if (this.isStoragePile) {
			this.createStoragePile(scene, itemMetadata)
			return
		}
		// For completed buildings, use emoji text instead of sprite
		if (this.isBuilding && this.buildingStage === ConstructionStage.Completed) {
			this.replaceSpriteWithEmoji(scene)
			return
		}

		const hasPlaceableTexture = Boolean(itemTextureService.getPlaceableItemTexture(this.mapObject.item.itemType))
		const hasItemTexture = Boolean(itemTextureService.getItemTexture(this.mapObject.item.itemType))
		if (!hasPlaceableTexture && !hasItemTexture && itemMetadata?.emoji) {
			this.createEmojiFallback(scene, itemMetadata)
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

		// Apply tree-specific visuals (growth + anchor) after sizing
		if (this.isTreeResourceNode() && this.sprite) {
			this.applyTreeVisuals(scene, this.sprite)
		}

		// Make building sprites interactive/clickable
		if (this.isBuilding) {
			this.sprite.setInteractive({ useHandCursor: true })
			this.sprite.on('pointerdown', this.handleBuildingClick, this)
		}
	}

	private createEmojiFallback(scene: Scene, itemMetadata: ItemMetadata): void {
		if (this.emojiText) return

		this.isEmojiFallback = true
		const tileSize = 32
		const footprint = this.mapObject.metadata?.footprint
		const width = footprint ? footprint.width * tileSize : tileSize
		const height = footprint ? footprint.height * tileSize : tileSize
		const centerX = this.mapObject.position.x + width / 2
		const centerY = this.mapObject.position.y + height / 2
		const emoji = itemMetadata.emoji || '❓'
		const fontSize = footprint ? Math.min(width, height) * 0.9 : 20

		this.emojiText = scene.add.text(centerX, centerY, emoji, {
			fontSize: `${fontSize}px`,
			align: 'center'
		})
		this.emojiText.setOrigin(0.5, 0.5)
		this.emojiText.setDepth(this.mapObject.position.y)

		if (this.isTreeResourceNode()) {
			this.applyTreeVisuals(scene, this.emojiText)
		}

		if (this.isBuilding) {
			this.emojiText.setInteractive({ useHandCursor: true })
			this.emojiText.on('pointerdown', this.handleBuildingClick, this)
		}

		if (itemMetadata?.placement?.blocksMovement || footprint) {
			scene.physics.add.existing(this.emojiText, true)
			const body = this.emojiText.body as Phaser.Physics.Arcade.Body
			if (body) {
				body.setSize(width, height)
				body.setOffset(-width / 2, -height / 2)
			}
		}
	}

	private replaceSpriteWithEmoji(scene: Scene): void {
		if (!this.isBuilding || !this.mapObject.metadata?.footprint) return

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

		const centerX = this.mapObject.position.x + width / 2
		const centerY = this.mapObject.position.y + height / 2

		if (this.emojiText) {
			this.emojiText.setText(emoji)
			this.emojiText.setFontSize(fontSize)
			this.emojiText.setPosition(centerX, centerY)
			this.emojiText.setDepth(this.mapObject.position.y)
		} else {
			// Create emoji text centered in the footprint
			this.emojiText = scene.add.text(centerX, centerY, emoji, {
				fontSize: `${fontSize}px`,
				align: 'center'
			})
			this.emojiText.setOrigin(0.5, 0.5)
			this.emojiText.setDepth(this.mapObject.position.y)

			// Make emoji text interactive/clickable
			this.emojiText.setInteractive({ useHandCursor: true })
			this.emojiText.on('pointerdown', this.handleBuildingClick, this)
		}

		// Ensure physics body matches footprint
		scene.physics.add.existing(this.emojiText, true)
		const body = this.emojiText.body as Phaser.Physics.Arcade.Body
		if (body) {
			body.setSize(width, height)
			body.setOffset(-width / 2, -height / 2)
		}

		console.log(`[MapObjectView] Replaced sprite with emoji text: ${emoji} at size ${fontSize}px for footprint ${this.mapObject.metadata.footprint.width}x${this.mapObject.metadata.footprint.height}`)
	}

	private setHighlighted(highlighted: boolean): void {
		if (this.isHighlighted === highlighted) {
			return
		}
		this.isHighlighted = highlighted
		if (!highlighted) {
			this.highlightGraphics?.setVisible(false)
			return
		}
		if (!this.highlightGraphics) {
			this.highlightGraphics = this.scene.add.graphics()
		}
		this.updateHighlight()
		this.highlightGraphics.setVisible(true)
	}

	private updateHighlight(): void {
		if (!this.highlightGraphics) {
			return
		}
		const tileSize = 32
		const footprint = this.mapObject.metadata?.footprint
		const width = footprint ? footprint.width * tileSize : (this.sprite?.displayWidth || this.emojiText?.displayWidth || tileSize)
		const height = footprint ? footprint.height * tileSize : (this.sprite?.displayHeight || this.emojiText?.displayHeight || tileSize)
		const x = this.mapObject.position.x
		const y = this.mapObject.position.y
		const padding = 3

		this.highlightGraphics.clear()
		this.highlightGraphics.fillStyle(0xffd54f, 0.08)
		this.highlightGraphics.fillRect(x - padding, y - padding, width + padding * 2, height + padding * 2)
		this.highlightGraphics.lineStyle(3, 0xffd54f, 0.9)
		this.highlightGraphics.strokeRect(x - padding, y - padding, width + padding * 2, height + padding * 2)

		const displayDepth = this.sprite?.depth ?? this.emojiText?.depth ?? this.mapObject.position.y
		this.highlightGraphics.setDepth(displayDepth + 0.5)
	}

	private createStoragePile(scene: Scene, itemMetadata: ItemMetadata): void {
		if (this.emojiText) return

		const tileSize = 32
		const centerX = this.mapObject.position.x + tileSize / 2
		const centerY = this.mapObject.position.y + tileSize / 2

		const emoji = itemMetadata.emoji || '📦'
		this.emojiText = scene.add.text(centerX, centerY, emoji, {
			fontSize: '20px',
			align: 'center'
		})
		this.emojiText.setOrigin(0.5, 0.5)
		this.emojiText.setDepth(this.mapObject.position.y)

		this.storageQuantityText = scene.add.text(
			this.mapObject.position.x + tileSize - 6,
			this.mapObject.position.y + tileSize - 6,
			'',
			{
				fontSize: '12px',
				color: '#ffffff',
				backgroundColor: '#000000',
				padding: { x: 4, y: 2 },
				align: 'center'
			}
		)
		this.storageQuantityText.setOrigin(0.5, 0.5)
		this.storageQuantityText.setDepth(this.mapObject.position.y + 1)
		this.storageQuantityText.setVisible(false)

		if (this.storageSlotId) {
			const initialQuantity = storageService.getSlotQuantity(this.storageSlotId)
			this.updateStoragePileQuantity(initialQuantity)
			this.storageSlotHandler = (data: { slotId: string, quantity: number }) => {
				if (data.slotId === this.storageSlotId) {
					this.updateStoragePileQuantity(data.quantity)
				}
			}
			EventBus.on(UiEvents.Storage.SlotUpdated, this.storageSlotHandler)
		}
	}

	private updateStoragePileQuantity(quantity: number): void {
		if (!this.storageQuantityText) return
		if (quantity > 1) {
			this.storageQuantityText.setText(`${quantity}`)
			this.storageQuantityText.setVisible(true)
		} else {
			this.storageQuantityText.setText('')
			this.storageQuantityText.setVisible(false)
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
			EventBus.emit(UiEvents.Building.Click, {
				buildingInstanceId,
				buildingId: this.mapObject.metadata?.buildingId
			})
		}
	}

	private isTreeResourceNode(): boolean {
		return this.mapObject.metadata?.resourceNode === true && this.mapObject.metadata?.resourceNodeType === 'tree'
	}

	private applyTreeVisuals(scene: Scene, displayObject: Phaser.GameObjects.Sprite | Phaser.GameObjects.Text): void {
		const tileSize = 32
		const baseX = this.mapObject.position.x + tileSize / 2
		const baseY = this.mapObject.position.y + tileSize

		displayObject.setOrigin(0.5, 1)
		displayObject.setPosition(baseX, baseY)

		const baseScaleX = displayObject.scaleX || 1
		const baseScaleY = displayObject.scaleY || 1
		const [small, medium, large] = this.treeGrowthStages

		displayObject.setScale(baseScaleX * small, baseScaleY * small)
		scene.tweens.add({
			targets: displayObject,
			scaleX: baseScaleX * medium,
			scaleY: baseScaleY * medium,
			duration: 1200,
			ease: 'Sine.easeOut',
			onComplete: () => {
				if (!displayObject.active) return
				scene.tweens.add({
					targets: displayObject,
					scaleX: baseScaleX * large,
					scaleY: baseScaleY * large,
					duration: 1600,
					ease: 'Sine.easeOut'
				})
			}
		})
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
		if (this.isStoragePile) return
		
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
		if (this.emojiText && this.isStoragePile) {
			return this.emojiText as any
		}
		if (this.emojiText && this.isEmojiFallback) {
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
		if (this.isHighlighted) {
			this.updateHighlight()
		}
	}

	public destroy(): void {
		if (this.highlightHandler) {
			EventBus.off(UiEvents.Building.Highlight, this.highlightHandler)
			this.highlightHandler = null
		}
		if (this.highlightGraphics) {
			this.highlightGraphics.destroy()
			this.highlightGraphics = null
		}
		// Remove building event listeners
		if (this.progressHandler) {
			EventBus.off(Event.Buildings.SC.Progress, this.progressHandler)
			this.progressHandler = null
		}
		if (this.completedHandler) {
			EventBus.off(Event.Buildings.SC.Completed, this.completedHandler)
			this.completedHandler = null
		}
		if (this.catalogHandler) {
			EventBus.off(Event.Buildings.SC.Catalog, this.catalogHandler)
			this.catalogHandler = null
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
		if (this.storageQuantityText) {
			this.storageQuantityText.destroy()
			this.storageQuantityText = null
		}
		if (this.emojiText) {
			this.emojiText.destroy()
			this.emojiText = null
		}

		if (this.storageSlotHandler) {
			EventBus.off(UiEvents.Storage.SlotUpdated, this.storageSlotHandler)
			this.storageSlotHandler = null
		}
	}
} 
