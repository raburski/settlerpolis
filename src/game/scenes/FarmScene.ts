import { Scene } from 'phaser'
import { EventBus } from '../EventBus'
import { Player } from '../entities/Player'

export class FarmScene extends Scene {
	private player: Player

	constructor() {
		super('FarmScene')
	}

	preload() {
		// Load the map and its tilesets
		this.load.tilemapTiledJSON('farm-map', 'assets/maps/test1.json')
		this.load.image('tileset-grass', 'assets/tilesets/tileset-grass.png')
		this.load.image('tileset-wall', 'assets/tilesets/tileset-wall.png')
		
		// Load player assets
		Player.preload(this)
	}

	create() {
		// Create the map
		const map = this.make.tilemap({ key: 'farm-map' })
		
		// Add tilesets to the map
		const grassTileset = map.addTilesetImage('tileset-grass')
		const wallTileset = map.addTilesetImage('tileset-wall')
		
		if (!grassTileset || !wallTileset) {
			console.error('Failed to load tilesets')
			return
		}

		// Create layers
		const groundLayer = map.createLayer('ground', [grassTileset])
		const wallLayer = map.createLayer('walls', [wallTileset])

		if (!groundLayer || !wallLayer) {
			console.error('Failed to create layers')
			return
		}

		// Set collision for walls - make sure all wall tiles have collision
		wallLayer.setCollisionByExclusion([-1]) // -1 is the index for empty tiles
		
		// Enable debug visualization for collision (optional, for development)
		// const debugGraphics = this.add.graphics().setAlpha(0.75)
		// wallLayer.renderDebug(debugGraphics, {
		//     tileColor: null,
		//     collidingTileColor: new Phaser.Display.Color(243, 134, 48, 255),
		//     faceColor: new Phaser.Display.Color(40, 39, 37, 255)
		// })

		// Create player
		this.player = new Player(this, 100, 300)
		
		// Set up collision between player and walls
		this.player.setCollisionWith(wallLayer)

		// Set up camera to follow player
		this.cameras.main.startFollow(this.player.getSprite())
		this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)

		EventBus.emit('current-scene-ready', this)
	}

	update() {
		// Update player
		if (this.player) {
			this.player.update()
		}
	}
} 