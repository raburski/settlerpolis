import { Scene, GameObjects } from 'phaser'
import { MapObject } from '../../../../backend/src/Game/MapObjects/types'
import { ItemMetadata } from '../../../../backend/src/Game/Items/types'
import { itemService } from "../../services/ItemService"

export class MapObjectView {
	private sprite: GameObjects.Sprite
	private mapObject: MapObject

	constructor(scene: Scene, mapObject: MapObject) {
		this.mapObject = mapObject
		
		// Get item metadata to determine the sprite to use
		const itemMetadata = itemService.getItemType(mapObject.item.itemType)
		
		// Create the sprite
		this.sprite = scene.add.sprite(
			mapObject.position.x,
			mapObject.position.y,
			this.getSpriteKey(itemMetadata)
		)
		
		// Set the rotation
		this.sprite.setRotation(mapObject.rotation)
		
		// Add physics body
		scene.physics.add.existing(this.sprite, true) // true makes it static
		
		// Set the display size based on the item type
		this.setDisplaySize(itemMetadata)
	}
	
	private getSpriteKey(itemMetadata: ItemMetadata | null): string {
		// If we have metadata with a specific sprite, use it
		if (itemMetadata && itemMetadata.emoji) {
			return itemMetadata.emoji
		}
		
		// Default to a placeholder sprite
		return 'mozgotrzep'
	}
	
	private setDisplaySize(itemMetadata: ItemMetadata | null): void {
		// Default size
		const defaultSize = 32
		
		// If we have metadata with a specific size, use it
		if (itemMetadata && itemMetadata.metadata && itemMetadata.metadata.size) {
			this.sprite.setDisplaySize(
				itemMetadata.metadata.size.width || defaultSize,
				itemMetadata.metadata.size.height || defaultSize
			)
		} else {
			// Use default size
			this.sprite.setDisplaySize(defaultSize, defaultSize)
		}
	}
	
	public getSprite(): GameObjects.Sprite {
		return this.sprite
	}
	
	public getMapObject(): MapObject {
		return this.mapObject
	}
	
	public destroy(): void {
		this.sprite.destroy()
	}
} 