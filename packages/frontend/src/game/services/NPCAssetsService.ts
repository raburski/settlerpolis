import { Scene } from 'phaser'
import { NPCAssets, Direction, DirectionalAnimations, NPCAnimation } from '@rugged/game'

type DirectionConfig = {
	type: 'single' | 'horizontal' | 'vertical' | 'full'
	defaultDirection?: Direction
}

class NPCAssetsService {
	private loadedAssets: Map<string, NPCAssets> = new Map()
	private loadingPromises: Map<string, Promise<NPCAssets>> = new Map()
	private directionConfigs: Map<string, DirectionConfig> = new Map()
	private readonly basePath = 'assets/npcs/'
	private lastHorizontalDirection: Map<string, Direction> = new Map()

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
		this.directionConfigs.set('placeholder', {
			type: 'single',
			defaultDirection: Direction.Down
		})
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
	 * Infers the direction configuration based on available animations
	 */
	private inferDirectionConfig(assets: NPCAssets): DirectionConfig {
		// Get all unique directions from all animations
		const directions = new Set<Direction>()
		Object.values(assets.animations).forEach(animation => {
			if (this.isDirectionalAnimation(animation)) {
				Object.keys(animation).forEach(dir => {
					directions.add(dir as Direction)
				})
			}
		})

		// If no directions found, it's a single-direction sprite
		if (directions.size === 0) {
			return {
				type: 'single',
				defaultDirection: Direction.Down
			}
		}

		// If we only have 'right' direction, it's a horizontal sprite
		if (directions.size === 1 && directions.has(Direction.Right)) {
			return {
				type: 'horizontal',
				defaultDirection: Direction.Right
			}
		}

		// If we only have 'down' direction, it's a vertical sprite
		if (directions.size === 1 && directions.has(Direction.Down)) {
			return {
				type: 'vertical',
				defaultDirection: Direction.Down
			}
		}

		// Check if we have all four directions
		if (directions.size === 4) {
			return {
				type: 'full'
			}
		}

		// Check if we have horizontal directions (left/right)
		if (directions.has(Direction.Left) && directions.has(Direction.Right)) {
			return {
				type: 'horizontal'
			}
		}

		// Check if we have vertical directions (up/down)
		if (directions.has(Direction.Up) && directions.has(Direction.Down)) {
			return {
				type: 'vertical'
			}
		}

		// Default to single direction with down as default
		return {
			type: 'single',
			defaultDirection: Direction.Down
		}
	}

	/**
	 * Gets the direction configuration for an NPC
	 */
	private getDirectionConfig(npcId: string): DirectionConfig {
		return this.directionConfigs.get(npcId) || {
			type: 'single',
			defaultDirection: Direction.Down
		}
	}

	/**
	 * Creates animations based on the asset configuration
	 */
	private createAnimations(scene: Scene, npcId: string, assets: NPCAssets): void {
		Object.entries(assets.animations).forEach(([name, animation]) => {
			if (this.isDirectionalAnimation(animation)) {
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
	 * Type guard to check if animation is directional
	 */
	private isDirectionalAnimation(animation: DirectionalAnimations | NPCAnimation | undefined): animation is DirectionalAnimations {
		if (!animation) return false
		return 'down' in animation || 'up' in animation || 'left' in animation || 'right' in animation
	}

	/**
	 * Gets the flip configuration for a direction
	 */
	public getFlipConfig(direction: Direction, npcId: string): { flipX: boolean, flipY: boolean } {
		const directionConfig = this.getDirectionConfig(npcId)
		
		switch (directionConfig.type) {
			case 'horizontal':
				return {
					flipX: direction === Direction.Left,
					flipY: false
				}
			case 'vertical':
				return {
					flipX: false,
					flipY: direction === Direction.Up
				}
			default:
				return {
					flipX: false,
					flipY: false
				}
		}
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
					
					// Infer and store direction config
					this.directionConfigs.set(npcId, this.inferDirectionConfig(assets))
					
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
					this.directionConfigs.set(npcId, this.getDirectionConfig('placeholder'))
					resolve(this.defaultAssets)
				}
			})

			scene.load.once('loaderror', (file: any) => {
				console.warn(`Failed to load assets for NPC ${npcId}, using placeholder:`, file.src)
				this.loadingPromises.delete(npcId)
				this.loadedAssets.set(npcId, this.defaultAssets)
				this.directionConfigs.set(npcId, this.getDirectionConfig('placeholder'))
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
			this.directionConfigs.delete(npcId)
		} else {
			this.loadedAssets.clear()
			this.loadingPromises.clear()
			this.directionConfigs.clear()
			// Restore default assets
			this.loadedAssets.set('placeholder', this.defaultAssets)
			this.directionConfigs.set('placeholder', {
				type: 'single',
				defaultDirection: Direction.Down
			})
		}
	}
}

// Export singleton instance
export const npcAssetsService = new NPCAssetsService() 