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
		frameCount: 16 // Assuming there are 16 frames in total (4 rows x 4 columns)
	},
    {
		key: 'item-chapter1',
		path: 'assets/items/chapter_1.png',
		frameWidth: 64,
		frameHeight: 64,
		frameCount: 9 // Assuming there are 16 frames in total (4 rows x 4 columns)
	}
	// Add more item textures here as needed
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

class ItemTextureService {
	/**
	 * Preloads all item textures for a Phaser scene
	 * @param scene The Phaser scene to preload textures for
	 */
	public preload(scene: Scene): void {
		ITEM_TEXTURES.forEach(texture => {
			scene.load.spritesheet(texture.key, texture.path, {
				frameWidth: texture.frameWidth,
				frameHeight: texture.frameHeight
			})
		})
	}

	/**
	 * Gets the texture key and frame index for an item type
	 * @param itemType The item type to get the texture for
	 * @returns The texture key and frame index, or undefined if not found
	 */
	public getItemTexture(itemType: string): { key: string, frame: number } | undefined {
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
		// We can calculate this by dividing the total width of the texture by the frame width
		// The total width is frameWidth * columnsPerRow
		// So columnsPerRow = totalWidth / frameWidth
		// Since we don't have the total width directly, we can calculate it from the frame count
		// Assuming the texture is a grid, the total width is frameWidth * columnsPerRow
		// And the total height is frameHeight * rowsPerRow
		// So frameCount = columnsPerRow * rowsPerRow
		// We can calculate rowsPerRow by dividing the total height by frameHeight
		// So rowsPerRow = totalHeight / frameHeight
		// Since we don't have the total height directly, we can calculate it from the frame count
		// So rowsPerRow = Math.ceil(frameCount / columnsPerRow)
		// But we don't have columnsPerRow yet, so we need to solve for it
		// We can use the fact that frameCount = columnsPerRow * rowsPerRow
		// And rowsPerRow = Math.ceil(frameCount / columnsPerRow)
		// So frameCount = columnsPerRow * Math.ceil(frameCount / columnsPerRow)
		// This is a bit tricky to solve directly, so we'll use a simpler approach
		// We'll assume that the texture is a square grid, so columnsPerRow = Math.sqrt(frameCount)
		// This is a reasonable assumption for most sprite sheets
		const columnsPerRow = Math.ceil(Math.sqrt(texture.frameCount))

		// Calculate the frame index based on the position
		const frameIndex = mapping.position.row * columnsPerRow + mapping.position.col

		return {
			key: mapping.textureKey,
			frame: frameIndex
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