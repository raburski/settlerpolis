import { Scene, GameObjects, Input, Physics } from 'phaser'
import { EventBus } from '../../EventBus'
import { Event, PICKUP_RANGE } from "@rugged/game"
import { AssetManager, TilesetInfo } from '../../modules/Assets'
import { NPCSprite } from '../../sprites/NPCSprite'

export abstract class MapScene extends Scene {
	protected assetsLoaded: boolean = false
	protected mapKey: string
	protected mapPath: string
	protected transitioning: boolean = false
	protected assetManager: AssetManager
	protected map: Phaser.Tilemaps.Tilemap
	protected collisionLayer: Phaser.Tilemaps.TilemapLayer | null = null
	private debug: boolean = false // Temporarily enable for diagnosis

	constructor(key: string, mapKey: string, mapPath: string) {
		super(key)
        
		this.mapKey = mapKey
		this.mapPath = mapPath
		this.assetManager = new AssetManager(this, mapKey, mapPath, this.initializeScene.bind(this))
	}

	preload() {
		
		// Load item placeholder
		this.load.image('mozgotrzep', 'assets/items/mozgotrzep.png')
		
		// Load NPC assets
		this.load.image('npc', 'assets/characters/npc/innkeeper.png')
		
		// Load map and other assets
		this.assetManager.preload()
	}

	create() {
		this.transitioning = false
		
		// Configure physics world before loading assets
		this.configurePhysicsWorld()
		
		this.assetManager.create()
	}
	
	/**
	 * Configure physics world settings
	 */
	private configurePhysicsWorld(): void {
		// Ensure arcade physics is correctly configured
		this.physics.world.setBounds(0, 0, 2000, 2000) // Set reasonable bounds 
		this.physics.world.setFPS(60) // Set physics FPS
	}
	
	protected initializeScene() {
		console.log('[SCENE] init', this.mapKey)
		// Create the map
		this.map = this.make.tilemap({ key: this.mapKey })
		
		// Load object tilesets and their mappings
		this.assetManager.loadTilesetObjects(this.map)
		
		// Get all tilesets from the map
		const mapData = this.cache.tilemap.get(this.mapKey).data
		const tilesetMap = new Map()
		
		// Add all tilesets to the map
		if (mapData && mapData.tilesets) {
			mapData.tilesets.forEach(tileset => {
				const imageKey = tileset.image?.split('/').pop().split('.')[0]
				if (!imageKey) return 

				const tilesetImage = this.map.addTilesetImage(imageKey)
				if (tilesetImage) {
					tilesetMap.set(tileset.name, tilesetImage)
				}
			})
		}
		
		// Create layers dynamically from the map data
		const layers = new Map<string, Phaser.Tilemaps.TilemapLayer>()
		
		if (mapData && mapData.layers) {
			mapData.layers.forEach(layer => {
				// Skip object layers as they are handled separately
				if (layer.type === 'objectgroup') return
				
				const layerName = layer.name
				const createdLayer = this.map.createLayer(layerName, Array.from(tilesetMap.values()))
				
				if (createdLayer) {
					layers.set(layerName, createdLayer)
					
					// Set collision for the dedicated collision layer
					if (layerName === 'collision') {
						// Set collision for all non-zero tiles
						createdLayer.setCollisionByExclusion([-1])
						
						// Make the collision layer slightly visible for debugging
						if (this.debug) {
							createdLayer.setAlpha(0.3)
						} else {
							createdLayer.setVisible(false)
						}
						
						// Store the collision layer
						this.collisionLayer = createdLayer
						
						// Make sure layer is correctly positioned
						if (createdLayer.x !== 0 || createdLayer.y !== 0) {
							console.warn('Repositioning collision layer to (0,0)')
							createdLayer.setPosition(0, 0)
						}
						
						// Debug: Check tiles in collision layer
						this.debugCollisionTiles(createdLayer)
					}
				}
			})
		}

		// Set world bounds to match the map size
		this.physics.world.bounds.width = this.map.widthInPixels
		this.physics.world.bounds.height = this.map.heightInPixels

		// Create static objects from the object layer
		const staticObjects = this.map.getObjectLayer('static-objects')?.objects
		if (staticObjects) {
			const staticObjectSprites: Phaser.GameObjects.Image[] = []
			
			staticObjects.forEach(obj => {
				const tilesetInfo = this.assetManager.getTilesetObjects().get(obj.gid)
				if (tilesetInfo) {
					const image = this.add.image(obj.x + obj.width/2, obj.y - obj.height/2, tilesetInfo.name)
					image.setDisplaySize(obj.width, obj.height)
					
					// Add physics body to the static object
					this.physics.add.existing(image, true) // true makes it static
					
					// Store the sprite for later collision setup
					staticObjectSprites.push(image)
				}
			})

			// Set up collision between player and static objects
			staticObjectSprites.forEach(sprite => {
				// change collider system!
				// this.physics.add.collider(this.player.getSprite(), sprite)
			})
		}
		
		// Calculate the offset to center the map if it's smaller than the window
		const windowWidth = this.scale.width
		const windowHeight = this.scale.height
		const mapWidth = this.map.widthInPixels
		const mapHeight = this.map.heightInPixels
		
		// Only center if map is smaller than window
		if (mapWidth < windowWidth || mapHeight < windowHeight) {
			const boundsX = Math.max(0, (windowWidth - mapWidth) / 2)
			const boundsY = Math.max(0, (windowHeight - mapHeight) / 2)
			
			// Set camera bounds with offset
			this.cameras.main.setBounds(-boundsX, -boundsY, mapWidth + boundsX * 2, mapHeight + boundsY * 2)
		} else {
			// Normal bounds for larger maps
			this.cameras.main.setBounds(0, 0, mapWidth, mapHeight)
		}
		
		// If this is a transition, fade in the camera
		if (this.scene.settings.data?.isTransition) {
			this.cameras.main.fadeIn(500)
		}

		// If debug mode is enabled, show debug graphics for the collision layer
		if (this.debug && this.collisionLayer) {
			const debugGraphics = this.add.graphics().setAlpha(0.5)
			this.collisionLayer.renderDebug(debugGraphics, {
				tileColor: null, // Color of non-colliding tiles
				collidingTileColor: new Phaser.Display.Color(255, 0, 0, 200), // Color of colliding tiles (bright red)
				faceColor: new Phaser.Display.Color(0, 255, 0, 150), // Color of colliding tile faces
			})
		}
	}

	update() {

	}

	/**
	 * Clean up resources before transitioning to a new scene
	 * This helps prevent memory leaks and ensures a smooth transition
	 */
	protected cleanupScene(): void {
		try {
			// // Clean up multiplayer players
			// this.multiplayerPlayers.forEach(player => {
			// 	player.destroy()
			// })
			// this.multiplayerPlayers.clear()
			
			// Clean up portal manager
			if (this.portalManager) {
				this.portalManager.cleanup()
				this.portalManager = null
			}
			
			console.log(`Scene ${this.scene.key} cleaned up successfully`)
		} catch (error) {
			console.error(`Error cleaning up scene ${this.scene.key}:`, error)
		}
	}

	/**
	 * Debug collision tiles to ensure they are properly set
	 */
	private debugCollisionTiles(layer: Phaser.Tilemaps.TilemapLayer): void {
		if (!this.debug) return
		
		const width = layer.layer.width
		const height = layer.layer.height
		let collidingTiles = 0
		
		// Check each tile in the layer
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const tile = layer.getTileAt(x, y)
				if (tile && tile.collides) {
					collidingTiles++
				}
			}
		}
		
		// If no colliding tiles, that's a problem!
		if (collidingTiles === 0) {
			console.warn('WARNING: No colliding tiles found in collision layer! Collisions will not work.')
		}
	}

	/**
	 * Initialize collision between sprites and the collision layer
	 * @param sprites Array of sprites or containers to set up collision with
	 */
	protected initializeCollision(sprites: (Phaser.GameObjects.GameObject | Phaser.GameObjects.Container)[]): void {
		if (!this.collisionLayer) {
			console.warn('No collision layer found in the map')
			return
		}
		
		// For each sprite, ensure its physics body is enabled
		sprites.forEach(sprite => {
			// Make sure the sprite has physics enabled
			if (!sprite.body) {
				this.physics.world.enable(sprite)
			}
			
			// Create a collider between the sprite and collision layer
			const collider = this.physics.add.collider(sprite, this.collisionLayer)
			
			if (this.debug) {
				console.log('Added collider between sprite and collision layer')
			}
		})
	}
} 