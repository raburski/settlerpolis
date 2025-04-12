import { Scene, GameObjects, Input, Physics } from 'phaser'
import { EventBus } from '../../EventBus'
import { PlayerView } from '../../entities/Player/View'
import { Event } from '../../../../backend/src/events'
import { PICKUP_RANGE } from '../../../../backend/src/consts'
import { AssetManager, TilesetInfo } from '../../modules/Assets'
import { NPCSprite } from '../../sprites/NPCSprite'

export abstract class MapScene extends Scene {
	protected assetsLoaded: boolean = false
	protected mapKey: string
	protected mapPath: string
	protected transitioning: boolean = false
	protected assetManager: AssetManager
	protected map: Phaser.Tilemaps.Tilemap

	constructor(key: string, mapKey: string, mapPath: string) {
		super(key)
        
		this.mapKey = mapKey
		this.mapPath = mapPath
		this.assetManager = new AssetManager(this, mapKey, mapPath, this.initializeScene.bind(this))
	}

	preload() {
		// Load player assets
		PlayerView.preload(this)
		
		// Load item placeholder
		this.load.image('mozgotrzep', 'assets/items/mozgotrzep.png')
		
		// Load NPC assets
		this.load.image('npc', 'assets/characters/npc/innkeeper.png')
		
		// Load map and other assets
		this.assetManager.preload()
	}

	create() {
		this.transitioning = false
		this.assetManager.create()
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
					
					// Check if the layer has a collision property
					const hasCollision = layer.properties?.some(prop => 
						prop.name === 'collision' && prop.value === true
					)
					
					if (hasCollision) {
						createdLayer.setCollisionByExclusion([-1])
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
		
		// Set up collision between player and layers that have collision enabled
		// layers.forEach((layer, layerName) => {
		// 	const hasCollision = mapData.layers.find(l => l.name === layerName)?.properties?.some(prop => 
		// 		prop.name === 'collision' && prop.value === true
		// 	)
			
		// 	if (hasCollision) {
		// 		this.player.setCollisionWith(layer)
		// 	}
		// })
		
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
} 