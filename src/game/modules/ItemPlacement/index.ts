import { Scene } from 'phaser'
import { Event } from '../../../../backend/src/events'
import { playerService } from '../../services/PlayerService'
import { EquipmentSlotType } from '../../../../backend/src/Game/Players/types'
import { itemService } from '../../services/ItemService'
import { ItemCategory } from '../../../../backend/src/Game/Items/types'
import { EventBus } from "../../EventBus"
import { PLACE_RANGE } from '../../../../backend/src/consts'
import { Player } from '../../../../backend/src/Game/Players/types'
import { PlayerController } from '../../entities/Player/Controller'
import { itemTextureService } from '../../services/ItemTextureService'

export class ItemPlacementManager {
	private scene: Scene
	private player: Player
	private playerController: PlayerController | null = null
	private previewSprite: Phaser.GameObjects.Sprite | null = null
	private placementText: Phaser.GameObjects.Text | null = null
	private isPlacementModeActive = false
	private currentItem: any = null

	constructor(scene: Scene, player: Player) {
		this.scene = scene
		this.player = player
		this.setupEventListeners()
	}

	private setupEventListeners() {
		// Listen for equipment updates to check for placeable items
		EventBus.on(Event.Players.SC.Equip, this.handleItemEquipped, this)
		EventBus.on(Event.Players.SC.Unequip, this.handleItemUnequipped, this)
		
		// Listen for pointer move to update preview position
		this.scene.input.on('pointermove', this.handlePointerMove, this)
		
		// Listen for pointer down to place the item
		this.scene.input.on('pointerdown', this.handlePointerDown, this)
	}

	private handleItemEquipped = (data: { itemId: string, slotType: EquipmentSlotType, item: any }) => {
		// Only handle hand slot items
		if (data.slotType === EquipmentSlotType.Hand && data.item) {
			// Get item metadata from the service
			const itemMetadata = itemService.getItemType(data.item.itemType)
			
			// Check if the item is placeable using the metadata
			if (itemMetadata && itemMetadata.category === ItemCategory.Placeable) {
				this.activatePlacementMode(data.item)
			}
		}
	}

	private handleItemUnequipped = (data: { slotType: EquipmentSlotType, item: any }) => {
		// Only handle hand slot items
		if (data.slotType === EquipmentSlotType.Hand && this.isPlacementModeActive) {
			this.deactivatePlacementMode()
		}
	}

	private activatePlacementMode(item: any) {
		this.isPlacementModeActive = true
		this.currentItem = item

		// Get item metadata for sprite information
		const itemMetadata = itemService.getItemType(item.itemType)
		
		// Get the appropriate texture for the preview
		const texture = this.getTexture(itemMetadata)
		
		// Create a semi-transparent preview sprite
		this.previewSprite = this.scene.add.sprite(0, 0, texture.key, texture.frame)
		this.previewSprite.setAlpha(0.5)
		this.previewSprite.setDepth(1000) // Ensure it's above other game objects
		this.previewSprite.setOrigin(0, 0) // Set anchor to top-left corner
		
		// Set the scale from the texture configuration
		this.previewSprite.setScale(texture.scale)

		// Set the display size based on placement size
		const defaultSize = 32
		if (itemMetadata?.placement?.size) {
			this.previewSprite.setDisplaySize(
				itemMetadata.placement.size.width * defaultSize,
				itemMetadata.placement.size.height * defaultSize
			)
		} else {
			this.previewSprite.setDisplaySize(defaultSize, defaultSize)
		}

		// Create placement instructions text
		this.placementText = this.scene.add.text(16, 16, 'Click to place item', {
			fontSize: '16px',
			color: '#ffffff',
			backgroundColor: '#000000',
			padding: { x: 8, y: 4 }
		})
		this.placementText.setDepth(1000)
	}
	
	private getTexture(itemMetadata: any): { key: string, frame: number, scale: number } {
		// If we have metadata with a placement property, try to get the placeable texture
		if (itemMetadata?.placement) {
			const placeableTexture = itemTextureService.getPlaceableItemTexture(this.currentItem.itemType)
			if (placeableTexture) {
				return placeableTexture
			}
		}
		
		// Fallback to regular item texture
		const regularTexture = itemTextureService.getItemTexture(this.currentItem.itemType)
		if (regularTexture) {
			return regularTexture
		}
		
		// If no texture is found, use the emoji as a fallback
		return {
			key: itemMetadata?.emoji || 'default_item',
			frame: 0,
			scale: 1
		}
	}

	private deactivatePlacementMode() {
		this.isPlacementModeActive = false
		this.currentItem = null

		if (this.previewSprite) {
			this.previewSprite.destroy()
			this.previewSprite = null
		}

		if (this.placementText) {
			this.placementText.destroy()
			this.placementText = null
		}
	}

	private handlePointerMove(pointer: Phaser.Input.Pointer) {
		if (!this.isPlacementModeActive || !this.previewSprite) return

		// Get the world position of the pointer
		const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y)
		
		// Use a fixed offset of gridSize/2 for more centered tracking
		const gridSize = 32
		const offsetX = gridSize / 2
		const offsetY = gridSize / 2
		
		// Snap to grid (32x32), accounting for the fixed offset
		const snappedX = Math.floor((worldPoint.x - offsetX) / gridSize) * gridSize
		const snappedY = Math.floor((worldPoint.y - offsetY) / gridSize) * gridSize

		// Update preview sprite position
		this.previewSprite.setPosition(snappedX, snappedY)

		// Show/hide placement text based on distance to player
		if (this.placementText) {
			// Get player position from the scene
			const playerPosition = this.getPlayerPosition()
			
			// Get item metadata for size information
			const itemMetadata = itemService.getItemType(this.currentItem.itemType)
			const defaultSize = 32
			const width = itemMetadata?.placement?.size?.width || 1
			const height = itemMetadata?.placement?.size?.height || 1
			
			// Calculate center point for distance check
			const centerX = snappedX + (width * defaultSize) / 2
			const centerY = snappedY + (height * defaultSize) / 2
			
			const distance = Phaser.Math.Distance.Between(
				playerPosition.x,
				playerPosition.y,
				centerX,
				centerY
			)

			this.placementText.setVisible(distance <= PLACE_RANGE)
		}
	}

	private handlePointerDown(pointer: Phaser.Input.Pointer) {
		if (!this.isPlacementModeActive || !this.currentItem || !this.previewSprite) return

		// Get the world position of the pointer
		const worldPoint = this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y)
		
		// Use a fixed offset of gridSize/2 for more centered tracking
		const gridSize = 32
		const offsetX = gridSize / 2
		const offsetY = gridSize / 2
		
		// Snap to grid (32x32), accounting for the fixed offset
		const snappedX = Math.floor((worldPoint.x - offsetX) / gridSize) * gridSize
		const snappedY = Math.floor((worldPoint.y - offsetY) / gridSize) * gridSize

		// Get player position from the scene
		const playerPosition = this.getPlayerPosition()
		
		// Get item metadata for size information
		const itemMetadata = itemService.getItemType(this.currentItem.itemType)
		const defaultSize = 32
		const width = itemMetadata?.placement?.size?.width || 1
		const height = itemMetadata?.placement?.size?.height || 1
		
		// Calculate center point for distance check
		const centerX = snappedX + (width * defaultSize) / 2
		const centerY = snappedY + (height * defaultSize) / 2
		
		// Calculate distance to player using center point
		const distance = Phaser.Math.Distance.Between(
			playerPosition.x,
			playerPosition.y,
			centerX,
			centerY
		)

		// Only allow placement if within range
		if (distance <= PLACE_RANGE) {
			console.log('Attempting to place item:', this.currentItem)
			console.log('Event name:', Event.Players.CS.Place)
			
			// Send placement event to server using Players.CS.Place
			EventBus.emit(Event.Players.CS.Place, {
				position: { x: snappedX, y: snappedY },
				rotation: 0, // Default rotation
				metadata: {} // Empty metadata object
			})
			
			console.log('Event emitted')

			// Deactivate placement mode
			this.deactivatePlacementMode()
		} else {
			console.log('Too far to place item. Distance:', distance)
		}
	}

	/**
	 * Gets the current player position from the scene
	 */
	private getPlayerPosition(): { x: number, y: number } {
		// Try to get the player controller from the scene
		if (!this.playerController) {
			// Find the player in the scene
			const gameScene = this.scene as any
			if (gameScene.player && gameScene.player.controller) {
				this.playerController = gameScene.player.controller
			}
		}
		
		// If we have a controller, use its getPosition method
		if (this.playerController) {
			return this.playerController.getPosition()
		}
		
		// Fallback to the player object's position
		return { x: this.player.position.x, y: this.player.position.y }
	}

	public update() {
		// Update logic if needed
	}

	public destroy() {
		// Clean up event listeners
		EventBus.off(Event.Players.SC.Equip, this.handleItemEquipped)
		EventBus.off(Event.Players.SC.Unequip, this.handleItemUnequipped)
		this.scene.input.off('pointermove', this.handlePointerMove)
		this.scene.input.off('pointerdown', this.handlePointerDown)

		// Clean up game objects
		this.deactivatePlacementMode()
	}
} 