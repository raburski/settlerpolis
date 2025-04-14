import { Scene, GameObjects } from 'phaser'
import { MapObject } from '../../../../backend/src/Game/MapObjects/types'
import { ItemMetadata } from '../../../../backend/src/Game/Items/types'
import { itemService } from "../../services/ItemService"
import { itemTextureService } from "../../services/ItemTextureService"

export class MapObjectView {
	private sprite: GameObjects.Sprite | null = null
	private mapObject: MapObject
	private unsubscribe: (() => void) | null = null

	constructor(scene: Scene, mapObject: MapObject) {
		this.mapObject = mapObject
		
		// Subscribe to item metadata updates
		this.unsubscribe = itemService.subscribeToItemMetadata(mapObject.item.itemType, (itemMetadata) => {
			if (itemMetadata) {
				this.initializeSprite(scene, itemMetadata)
			}
		})
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
		
		// Default size
		const defaultSize = 32
		
		// If we have metadata with a placement size, use it
		if (itemMetadata?.placement?.size) {
			this.sprite.setDisplaySize(
				itemMetadata.placement.size.width * defaultSize,
				itemMetadata.placement.size.height * defaultSize
			)
		} else if (itemMetadata?.metadata?.size) {
			// Fallback to metadata size if available
			this.sprite.setDisplaySize(
				itemMetadata.metadata.size.width || defaultSize,
				itemMetadata.metadata.size.height || defaultSize
			)
		} else {
			// Use default size
			this.sprite.setDisplaySize(defaultSize, defaultSize)
		}
	}
	
	public getSprite(): GameObjects.Sprite | null {
		return this.sprite
	}
	
	public getMapObject(): MapObject {
		return this.mapObject
	}
	
	public destroy(): void {
		if (this.unsubscribe) {
			this.unsubscribe()
			this.unsubscribe = null
		}
		if (this.sprite) {
			this.sprite.destroy()
			this.sprite = null
		}
	}
} 