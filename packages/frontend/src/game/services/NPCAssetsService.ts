import { Scene } from 'phaser'
import { NPCAssets, Direction, DirectionalAnimations, NPCAnimation, isDirectionalAnimation } from '@rugged/game'

class NPCAssetsService {
	private loadedAssets: Map<string, NPCAssets> = new Map()
	private loadingPromises: Map<string, Promise<NPCAssets>> = new Map()
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