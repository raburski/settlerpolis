import { Scene } from 'phaser'
import { NPCAssets, Direction, DirectionalAnimations, NPCAnimation, isDirectionalAnimation } from '@rugged/game'

class NPCAssetsService {
	private loadedAssets: Map<string, NPCAssets> = new Map()
	private loadingPromises: Map<string, Promise<NPCAssets>> = new Map()
	private outlineTextures: Map<string, string> = new Map() // Cache for outline textures
	private readonly basePath = 'assets/npcs/'

	// Default placeholder assets
	private readonly defaultAssets: NPCAssets = {
		spritesheet: 'placeholder/npc.png',
		frameWidth: 32,
		frameHeight: 64,
		animations: {
			idle: {
				frames: [0],
				frameRate: 1,
				repeat: -1
			},
			walk: {
				frames: [0],
				frameRate: 1,
				repeat: -1
			}
		}
	}

	constructor() {
		// Preload default assets
		this.loadedAssets.set('placeholder', this.defaultAssets)
	}

	/**
	 * Creates an outline texture from a spritesheet
	 */
	private createOutlineTexture(scene: Scene, npcId: string, assets: NPCAssets): void {
		const textureKey = `npc-spritesheet-${npcId}`
		const outlineKey = `npc-outline-${npcId}`

		// Skip if outline already exists
		if (this.outlineTextures.has(npcId)) return

		// Create a temporary canvas to process the image
		const tempCanvas = document.createElement('canvas')
		const tempCtx = tempCanvas.getContext('2d')
		if (!tempCtx) return

		// Get the first frame of the spritesheet
		const texture = scene.textures.get(textureKey)
		if (!texture || !texture.frames || !texture.frames[0]) return

		const frame = texture.frames[0]
		const source = frame.source.image

		// Set canvas size to match frame
		tempCanvas.width = frame.width
		tempCanvas.height = frame.height

		// Draw the frame to the canvas
		tempCtx.drawImage(
			source,
			frame.cutX,
			frame.cutY,
			frame.cutWidth,
			frame.cutHeight,
			0,
			0,
			frame.width,
			frame.height
		)

		// Get image data
		const imageData = tempCtx.getImageData(0, 0, frame.width, frame.height)
		const data = imageData.data

		// Create outline canvas with extra padding for the blur effect
		const padding = 4 // Extra padding for the blur effect
		const outlineCanvas = document.createElement('canvas')
		const outlineCtx = outlineCanvas.getContext('2d')
		if (!outlineCtx) return

		outlineCanvas.width = frame.width + padding * 2
		outlineCanvas.height = frame.height + padding * 2

		// First pass: Create a solid outline
		for (let y = 0; y < frame.height; y++) {
			for (let x = 0; x < frame.width; x++) {
				const i = (y * frame.width + x) * 4
				const alpha = data[i + 3]

				// If pixel is transparent, check surrounding pixels
				if (alpha === 0) {
					let hasNonTransparentNeighbor = false

					// Check 8 surrounding pixels
					for (let dy = -1; dy <= 1; dy++) {
						for (let dx = -1; dx <= 1; dx++) {
							if (dx === 0 && dy === 0) continue

							const nx = x + dx
							const ny = y + dy

							if (nx >= 0 && nx < frame.width && ny >= 0 && ny < frame.height) {
								const ni = (ny * frame.width + nx) * 4
								if (data[ni + 3] > 0) {
									hasNonTransparentNeighbor = true
									break
								}
							}
						}
						if (hasNonTransparentNeighbor) break
					}

					// If has non-transparent neighbor, this is an outline pixel
					if (hasNonTransparentNeighbor) {
						outlineCtx.fillStyle = 'rgba(255, 255, 0, 0.9)'
						outlineCtx.fillRect(x + padding, y + padding, 1, 1)
					}
				}
			}
		}

		// Second pass: Create a second layer of outline for thickness
		const tempOutlineCanvas = document.createElement('canvas')
		const tempOutlineCtx = tempOutlineCanvas.getContext('2d')
		if (!tempOutlineCtx) return

		tempOutlineCanvas.width = outlineCanvas.width
		tempOutlineCanvas.height = outlineCanvas.height

		// Draw the first outline
		tempOutlineCtx.drawImage(outlineCanvas, 0, 0)

		// Get the image data of the first outline
		const outlineData = tempOutlineCtx.getImageData(0, 0, outlineCanvas.width, outlineCanvas.height)
		const outlinePixels = outlineData.data

		// Clear the original canvas for the second pass
		outlineCtx.clearRect(0, 0, outlineCanvas.width, outlineCanvas.height)

		// Create a thicker outline by expanding the first outline
		for (let y = 0; y < outlineCanvas.height; y++) {
			for (let x = 0; x < outlineCanvas.width; x++) {
				const i = (y * outlineCanvas.width + x) * 4
				const alpha = outlinePixels[i + 3]

				if (alpha > 0) {
					// Draw a 2x2 pixel block for each outline pixel
					outlineCtx.fillStyle = 'rgba(255, 255, 0, 0.9)'
					outlineCtx.fillRect(x, y, 1, 1)
				}
			}
		}

		// Apply blur effect
		outlineCtx.filter = 'blur(2px)'
		outlineCtx.drawImage(outlineCanvas, 0, 0)
		outlineCtx.filter = 'none'

		// Add the outline texture to Phaser
		scene.textures.addCanvas(outlineKey, outlineCanvas)
		this.outlineTextures.set(npcId, outlineKey)
	}

	/**
	 * Gets the outline texture key for an NPC
	 */
	public getOutlineTextureKey(npcId: string): string | null {
		return this.outlineTextures.get(npcId) || null
	}

	/**
	 * Gets the avatar URL for an NPC
	 */
	public getAvatarUrl(npcId: string): string {
		const assets = this.loadedAssets.get(npcId)
		if (!assets?.avatar) {
			return `${this.basePath}placeholder/avatar.png`
		}
		return `${this.basePath}${assets.avatar}`
	}

	/**
	 * Creates animations based on the asset configuration
	 */
	private createAnimations(scene: Scene, npcId: string, assets: NPCAssets): void {
		Object.entries(assets.animations).forEach(([name, animation]) => {
			if (isDirectionalAnimation(animation)) {
				// Handle directional animations
				Object.entries(animation).forEach(([dir, anim]) => {
					const direction = dir as Direction
					const key = `npc-${npcId}-${name}-${direction}`
					if (!scene.anims.exists(key)) {
						scene.anims.create({
							key,
							frames: scene.anims.generateFrameNumbers(`npc-spritesheet-${npcId}`, {
								frames: anim.frames
							}),
							frameRate: anim.frameRate,
							repeat: anim.repeat
						})
					}
				})
			} else {
				// Handle single animation for all directions
				const key = `npc-${npcId}-${name}`
				if (!scene.anims.exists(key)) {
					scene.anims.create({
						key,
						frames: scene.anims.generateFrameNumbers(`npc-spritesheet-${npcId}`, {
							frames: animation.frames
						}),
						frameRate: animation.frameRate,
						repeat: animation.repeat
					})
				}
			}
		})
	}

	/**
	 * Loads NPC assets for a given NPC ID
	 */
	public async loadNPCAssets(scene: Scene, npcId: string): Promise<NPCAssets> {
		// Return cached assets if already loaded
		const cachedAssets = this.loadedAssets.get(npcId)
		if (cachedAssets) {
			return cachedAssets
		}

		// Return existing loading promise if already loading
		const existingPromise = this.loadingPromises.get(npcId)
		if (existingPromise) {
			return existingPromise
		}

		// Create new loading promise
		const loadingPromise = new Promise<NPCAssets>((resolve, reject) => {
			// Load the assets JSON file
			scene.load.json(`npc-assets-${npcId}`, `${this.basePath}${npcId}.json`)
			
			scene.load.once('complete', () => {
				try {
					const assets = scene.cache.json.get(`npc-assets-${npcId}`) as NPCAssets
					
					// Load the spritesheet
					scene.load.spritesheet(
						`npc-spritesheet-${npcId}`,
						`${this.basePath}${assets.spritesheet}`,
						{
							frameWidth: assets.frameWidth,
							frameHeight: assets.frameHeight
						}
					)

					// Wait for the images to load
					scene.load.once('complete', () => {
						// Create animations
						this.createAnimations(scene, npcId, assets)

						// Create outline texture
						this.createOutlineTexture(scene, npcId, assets)

						// Cache the assets
						this.loadedAssets.set(npcId, assets)
						this.loadingPromises.delete(npcId)
						resolve(assets)
					})

					scene.load.start()
				} catch (error) {
					console.warn(`Failed to load assets for NPC ${npcId}, using placeholder:`, error)
					this.loadingPromises.delete(npcId)
					this.loadedAssets.set(npcId, this.defaultAssets)
					resolve(this.defaultAssets)
				}
			})

			scene.load.once('loaderror', (file: any) => {
				console.warn(`Failed to load assets for NPC ${npcId}, using placeholder:`, file.src)
				this.loadingPromises.delete(npcId)
				this.loadedAssets.set(npcId, this.defaultAssets)
				resolve(this.defaultAssets)
			})

			scene.load.start()
		})

		this.loadingPromises.set(npcId, loadingPromise)
		return loadingPromise
	}

	/**
	 * Gets the loaded assets for an NPC
	 * @param npcId The ID of the NPC
	 * @returns The loaded assets or undefined if not loaded
	 */
	public getNPCAssets(npcId: string): NPCAssets | undefined {
		return this.loadedAssets.get(npcId)
	}

	/**
	 * Clears the cache for a specific NPC or all NPCs
	 */
	public clearCache(npcId?: string): void {
		if (npcId) {
			this.loadedAssets.delete(npcId)
			this.loadingPromises.delete(npcId)
		} else {
			this.loadedAssets.clear()
			this.loadingPromises.clear()
			// Restore default assets
			this.loadedAssets.set('placeholder', this.defaultAssets)
		}
	}
}

// Export singleton instance
export const npcAssetsService = new NPCAssetsService() 