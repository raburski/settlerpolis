export interface ItemTextureConfig {
	key: string
	path: string
	frameWidth: number
	frameHeight: number
	frameCount: number
	scale?: number
}

class ItemTextureService {
	public preload(): void {
		// No-op for Babylon renderer
	}

	public getItemTexture(_itemType: string): { key: string; frame: number; scale: number } | undefined {
		return undefined
	}

	public getPlaceableItemTexture(_itemType: string): { key: string; frame: number; scale: number } | undefined {
		return undefined
	}

	public getTextureConfig(_itemType: string): ItemTextureConfig | undefined {
		return undefined
	}
}

export const itemTextureService = new ItemTextureService()
