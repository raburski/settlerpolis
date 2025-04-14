import { Scene } from 'phaser'

// Define the item texture configuration
export interface ItemTextureConfig {
	/** The key used to reference this texture in Phaser */
	key: string
	/** The path to the texture file */
	path: string
	/** The width of each frame in the texture */
	frameWidth: number
	/** The height of each frame in the texture */
	frameHeight: number
	/** The number of frames in the texture */
	frameCount: number
	/** The scale to apply to the texture (default: 1) */
	scale?: number
}

// Define the item texture position
export interface ItemTexturePosition {
	/** The row in the texture (0-based) */
	row: number
	/** The column in the texture (0-based) */
	col: number
}

// Define the item texture mapping
export interface ItemTextureMapping {
	/** The item type */
	itemType: string
	/** The texture key this item belongs to */
	textureKey: string
	/** The position in the texture */
	position: ItemTexturePosition
}

// Define the item textures
export const ITEM_TEXTURES: ItemTextureConfig[] = [
	{
		key: 'item-alco',
		path: 'assets/items/alco.png',
		frameWidth: 64,
		frameHeight: 64,
		frameCount: 16, // Assuming there are 16 frames in total (4 rows x 4 columns)
		scale: 1
	},
    {
		key: 'item-chapter1',
		path: 'assets/items/chapter_1.png',
		frameWidth: 64,
		frameHeight: 64,
		frameCount: 9, // Assuming there are 16 frames in total (4 rows x 4 columns)
		scale: 1
	}
	// Add more item textures here as needed
]

// Define placeable item textures
export const PLACEABLE_ITEM_TEXTURES: ItemTextureConfig[] = [
	{
		key: 'placeable-rug',
		path: 'assets/items/placeables/rug.png',
		frameWidth: 128,
		frameHeight: 192,
		frameCount: 1,
		scale: 0.5
	}
]

// Define the item texture mappings
export const ITEM_TEXTURE_MAPPINGS: ItemTextureMapping[] = [
	{
		itemType: 'mozgotrzep',
		textureKey: 'item-alco',
		position: { row: 0, col: 0 } // First line, third row (0-based index)
	},
	{
		itemType: 'chainfolk_rug',
		textureKey: 'item-chapter1',
		position: { row: 0, col: 2 } // First position
	}
	// Add more mappings here as needed
]

// Define placeable item texture mappings
export const PLACEABLE_ITEM_TEXTURE_MAPPINGS: ItemTextureMapping[] = [
	{
		itemType: 'chainfolk_rug',
		textureKey: 'placeable-rug',
		position: { row: 0, col: 0 }
	}
]

class ItemTextureService {
	/**
	 * Preloads all item textures for a Phaser scene
	 * @param scene The Phaser scene to preload textures for
	 */
	public preload(scene: Scene): void {
		// Preload regular item textures
		ITEM_TEXTURES.forEach(texture => {
			scene.load.spritesheet(texture.key, texture.path, {
				frameWidth: texture.frameWidth,
				frameHeight: texture.frameHeight
			})
		})

		// Preload placeable item textures
		PLACEABLE_ITEM_TEXTURES.forEach(texture => {
			scene.load.spritesheet(texture.key, texture.path, {
				frameWidth: texture.frameWidth,
				frameHeight: texture.frameHeight
			})
		})
	}

	/**
	 * Gets the texture key and frame index for an item type
	 * @param itemType The item type to get the texture for
	 * @returns The texture key, frame index, and scale, or undefined if not found
	 */
	public getItemTexture(itemType: string): { key: string, frame: number, scale: number } | undefined {
		// Find the mapping for this item type
		const mapping = ITEM_TEXTURE_MAPPINGS.find(m => m.itemType === itemType)
		if (!mapping) {
			return undefined
		}

		// Find the texture for this item type
		const texture = ITEM_TEXTURES.find(t => t.key === mapping.textureKey)
		if (!texture) {
			return undefined
		}

		// Calculate the number of columns per row based on the texture dimensions
		const columnsPerRow = Math.ceil(Math.sqrt(texture.frameCount))

		// Calculate the frame index based on the position
		const frameIndex = mapping.position.row * columnsPerRow + mapping.position.col

		return {
			key: mapping.textureKey,
			frame: frameIndex,
			scale: texture.scale || 1
		}
	}

	/**
	 * Gets the texture key and frame index for a placeable item type
	 * @param itemType The item type to get the placeable texture for
	 * @returns The texture key, frame index, and scale, or undefined if not found
	 */
	public getPlaceableItemTexture(itemType: string): { key: string, frame: number, scale: number } | undefined {
		// Find the mapping for this item type
		const mapping = PLACEABLE_ITEM_TEXTURE_MAPPINGS.find(m => m.itemType === itemType)
		if (!mapping) {
			return undefined
		}

		// Find the texture for this item type
		const texture = PLACEABLE_ITEM_TEXTURES.find(t => t.key === mapping.textureKey)
		if (!texture) {
			return undefined
		}

		// Calculate the number of columns per row based on the texture dimensions
		const columnsPerRow = Math.ceil(Math.sqrt(texture.frameCount))

		// Calculate the frame index based on the position
		const frameIndex = mapping.position.row * columnsPerRow + mapping.position.col

		return {
			key: mapping.textureKey,
			frame: frameIndex,
			scale: texture.scale || 1
		}
	}

	/**
	 * Gets the texture configuration for an item type
	 * @param itemType The item type to get the texture configuration for
	 * @returns The texture configuration, or undefined if not found
	 */
	public getTextureConfig(itemType: string): ItemTextureConfig | undefined {
		// Find the mapping for this item type
		const mapping = ITEM_TEXTURE_MAPPINGS.find(m => m.itemType === itemType)
		if (!mapping) {
			return undefined
		}

		// Find the texture for this item type
		return ITEM_TEXTURES.find(t => t.key === mapping.textureKey)
	}
}

// Export singleton instance
export const itemTextureService = new ItemTextureService() 