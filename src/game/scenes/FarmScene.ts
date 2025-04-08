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

export class FarmScene extends Scene {
	private player: Player
	private tilesetObjects: Map<number, TilesetInfo> = new Map()

	constructor() {
		super('FarmScene')
	}

	preload() {
		// Load the map first to get tileset information
		this.load.tilemapTiledJSON('farm-map', 'assets/maps/test1.json')
		
		// Load regular tilesets
		this.load.image('tileset-grass', 'assets/tilesets/tileset-grass.png')
		this.load.image('tileset-wall', 'assets/tilesets/tileset-wall.png')
		this.load.image('struct', 'assets/tilesets/struct.png')
		this.load.image('props', 'assets/tilesets/props.png')

        this.load.image('blockchain', 'assets/objects/blockchain.png')
		
		// Load player assets
		Player.preload(this)
	}

	private loadTilesetObjects(map: Phaser.Tilemaps.Tilemap) {
		const tilesets = map.tilesets
        const _this = this
		
		tilesets.forEach(tileset => {
            const imageName = tileset.name?.split('/').pop()?.split('.')[0]
            console.log('tileset', tileset, imageName)
			// Only handle tilesets that have tiles property (object tilesets)
			if (imageName) {
                    const gid = tileset.firstgid
                    
                    // Load the individual tile image
                    // this is not loading for some reason so has to preload bullshit
                    _this.load.image(imageName, `assets/objects/${imageName}.png`)
                    console.log('imageName', imageName, `assets/objects/${imageName}.png`)
                    
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
		// Create the map
		const map = this.make.tilemap({ key: 'farm-map' })
		
		// Load object tilesets and their mappings
		this.loadTilesetObjects(map)
		
		// Add tilesets to the map
		const grassTileset = map.addTilesetImage('tileset-grass')
		const wallTileset = map.addTilesetImage('tileset-wall')
		const structTileset = map.addTilesetImage('struct')
		const propsTileset = map.addTilesetImage('props')

		
		if (!grassTileset || !wallTileset || !structTileset || !propsTileset) {
			console.error('Failed to load tilesets')
			return
		}

		// Create layers in the correct order (bottom to top)
		const groundLayer = map.createLayer('ground', [grassTileset])
        const backgroundLayer = map.createLayer('background', [structTileset])
		const wallLayer = map.createLayer('walls', [wallTileset])
		const propsLayer = map.createLayer('props', [propsTileset])

		if (!backgroundLayer || !groundLayer || !wallLayer || !propsLayer) {
			console.error('Failed to create layers')
			return
		}

		// Set collision for walls and static objects
		wallLayer.setCollisionByExclusion([-1])
		propsLayer.setCollisionByExclusion([-1])
		
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
		
		// Set up collision between player and walls
		this.player.setCollisionWith(wallLayer)
		this.player.setCollisionWith(propsLayer)
		
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
}