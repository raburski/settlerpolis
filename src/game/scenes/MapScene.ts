import { Scene } from 'phaser'
import { EventBus } from '../EventBus'
import { Player } from '../entities/Player'

interface TilesetInfo {
	name: string
	image: string
	gid: number
	width: number
	height: number
}

export abstract class MapScene extends Scene {
	protected player: Player
	protected tilesetObjects: Map<number, TilesetInfo> = new Map()
	protected assetsLoaded: boolean = false
	protected assetsLoadedPromise: Promise<void> | null = null
	protected mapKey: string
	protected mapPath: string

	constructor(key: string, mapKey: string, mapPath: string) {
		super(key)
		this.mapKey = mapKey
		this.mapPath = mapPath
	}

	preload() {
		// Load player assets
		Player.preload(this)
		
		// Load the map first to get tileset information
		this.load.tilemapTiledJSON(this.mapKey, this.mapPath)
		
		// We'll load other assets after the tilemap is loaded
		this.load.once('complete', this.onPreloadComplete, this)
	}

	protected onPreloadComplete() {
		console.log('PRELOADITO')
		// Get the tilemap data
		const mapData = this.cache.tilemap.get(this.mapKey).data
		
		// Create a promise to track when all assets are loaded
		this.assetsLoadedPromise = new Promise<void>((resolve) => {
			// Load all tilesets referenced in the map
			if (mapData && mapData.tilesets) {
				mapData.tilesets.forEach(tileset => {
					// Extract the image path from the tileset
					const imagePath = tileset.image?.replace('../', '')
					if (!imagePath) return
					const imageKey = imagePath.split('/').pop().split('.')[0]
					
					// Load the tileset image
					this.load.image(imageKey, `assets/${imagePath}`)
					console.log(`Loading tileset: ${imageKey} from assets/${imagePath}`)
				})
			}
			
			// Load any other required assets
			this.loadAdditionalAssets()
			
			// Set up a one-time event listener for when all assets are loaded
			this.load.once('complete', () => {
				console.log('All assets loaded')
				this.assetsLoadedPromise = null
				resolve()
			})
			
			// Start loading the assets
			this.load.start()
		})
	}

	protected loadTilesetObjects(map: Phaser.Tilemaps.Tilemap) {
		const tilesets = map.tilesets
        const _this = this
		
		tilesets.forEach(tileset => {
            const imageName = tileset.name?.split('/').pop()?.split('.')[0]
			// Only handle tilesets that have tiles property (object tilesets)
			if (imageName) {
                    const gid = tileset.firstgid
                    
                    // Load the individual tile image
                    // this is not loading for some reason so has to preload bullshit
                    _this.load.image(imageName, `assets/objects/${imageName}.png`)
                    
                    // Store the GID mapping
                    _this.tilesetObjects.set(gid, {
                        name: imageName,
                        gid: gid,
                        width: tileset.tilewidth,
                        height: tileset.tileheight
                    })
			}
		})
	}

	create() {
		console.log('CREATE')
		
		// Check if assets are already loaded
		if (this.assetsLoadedPromise != null) {
			console.log('Waiting for assets to load...')
			// Wait for assets to load before proceeding
			this.assetsLoadedPromise?.then(() => {
				console.log('Assets loaded, continuing with create')
				this.initializeScene()
			})
			return
		}
		
		// If assets are already loaded, proceed with scene initialization
		this.initializeScene()
	}
	
	protected initializeScene() {
		// Create the map
		const map = this.make.tilemap({ key: this.mapKey })
		
		// Load object tilesets and their mappings
		this.loadTilesetObjects(map)
		
		// Get all tilesets from the map
		const mapData = this.cache.tilemap.get(this.mapKey).data
		const tilesetMap = new Map()
		
		// Add all tilesets to the map
		if (mapData && mapData.tilesets) {
			mapData.tilesets.forEach(tileset => {
				const imageKey = tileset.image?.split('/').pop().split('.')[0]
				if (!imageKey) return 
				console.log('addTilesetImage', imageKey)
				const tilesetImage = map.addTilesetImage(imageKey)
				if (tilesetImage) {
					tilesetMap.set(tileset.name, tilesetImage)
					console.log(`Added tileset: ${tileset.name} with key: ${imageKey}`)
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
				const createdLayer = map.createLayer(layerName, Array.from(tilesetMap.values()))
				
				if (createdLayer) {
					layers.set(layerName, createdLayer)
					console.log(`Created layer: ${layerName}`)
					
					// Check if the layer has a collision property
					const hasCollision = layer.properties?.some(prop => 
						prop.name === 'collision' && prop.value === true
					)
					
					if (hasCollision) {
						createdLayer.setCollisionByExclusion([-1])
						console.log(`Set collision for layer: ${layerName}`)
					}
				}
			})
		}
		
		// Create static objects from the object layer
		const staticObjects = map.getObjectLayer('static-objects').objects
		const staticObjectSprites: Phaser.GameObjects.Image[] = []
		
		staticObjects.forEach(obj => {
            console.log('staticObjects', obj)
			const tilesetInfo = this.tilesetObjects.get(obj.gid)
            console.log('tilesetInfo', tilesetInfo)
			if (tilesetInfo) {
				const image = this.add.image(obj.x + obj.width/2, obj.y - obj.height/2, tilesetInfo.name)
				image.setDisplaySize(obj.width, obj.height)
				
				// Add physics body to the static object
				this.physics.add.existing(image, true) // true makes it static
				
				// Store the sprite for later collision setup
				staticObjectSprites.push(image)
			}
		})

		// Set world bounds to match the map size
		this.physics.world.bounds.width = map.widthInPixels
		this.physics.world.bounds.height = map.heightInPixels

		// Create player
		this.player = new Player(this, 100, 300)
		
		// Set up collision between player and layers that have collision enabled
		layers.forEach((layer, layerName) => {
			const hasCollision = mapData.layers.find(l => l.name === layerName)?.properties?.some(prop => 
				prop.name === 'collision' && prop.value === true
			)
			
			if (hasCollision) {
				this.player.setCollisionWith(layer)
			}
		})
		
		// Set up collision between player and static objects
		staticObjectSprites.forEach(sprite => {
			this.physics.add.collider(this.player.getSprite(), sprite)
		})

		// Set up camera to follow player
		this.cameras.main.startFollow(this.player.getSprite())
		this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)

		EventBus.emit('current-scene-ready', this)
	}

	update() {
		if (this.player) {
			this.player.update()
		}
	}

	// Abstract method to be implemented by child classes for loading additional assets
	protected abstract loadAdditionalAssets(): void
} 