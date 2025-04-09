import { Scene } from 'phaser'
import { EventBus } from '../EventBus'
import { Player } from '../entities/Player'
import { MultiplayerService, PlayerData, ChatMessage } from '../services/MultiplayerService'
import { MultiplayerPlayer } from '../entities/MultiplayerPlayer'
import { BasePlayer } from '../entities/BasePlayer'
import { Event } from '../../../shared/events/Event'

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
	protected multiplayerPlayers: Map<string, MultiplayerPlayer> = new Map()
	protected multiplayerService: MultiplayerService
	protected lastPositionUpdate: { x: number, y: number } | null = null
	protected lastPositionUpdateTime: number = 0
	protected readonly POSITION_UPDATE_THROTTLE = 100 // 100ms

	constructor(key: string, mapKey: string, mapPath: string) {
		super(key)
		this.mapKey = mapKey
		this.mapPath = mapPath
		this.multiplayerService = MultiplayerService.getInstance()
	}

	preload() {
		// Load player assets
		BasePlayer.preload(this)
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

		// Set up multiplayer
		this.setupMultiplayer()

		EventBus.emit('current-scene-ready', this)

		// Listen for chat messages
		EventBus.on(Event.Chat.Message, this.handleChatMessage, this)
	}

	private setupMultiplayer() {
		// Connect to multiplayer server
		this.multiplayerService.connect()

		// Join the game
		const playerSprite = this.player.getSprite()
		this.multiplayerService.joinGame(
			playerSprite.x,
			playerSprite.y,
			this.scene.key,
			this.player.appearance
		)

		// Set up multiplayer event listeners
		EventBus.on(Event.Player.Joined, this.handlePlayerJoined, this)
		EventBus.on(Event.Player.Moved, this.handlePlayerMoved, this)
		EventBus.on(Event.Player.Left, this.handlePlayerLeft, this)
		EventBus.on(Event.Player.Disconnected, this.handlePlayerDisconnected, this)
	}

	private handlePlayerJoined(playerData: PlayerData) {
		const multiplayerPlayer = new MultiplayerPlayer(
			this,
			playerData.x,
			playerData.y,
			playerData.id,
			playerData.appearance
		)
		this.multiplayerPlayers.set(playerData.id, multiplayerPlayer)
	}

	private handlePlayerMoved(playerData: PlayerData) {
		const multiplayerPlayer = this.multiplayerPlayers.get(playerData.id)
		if (multiplayerPlayer) {
			multiplayerPlayer.updatePositionFromServer(playerData)
		}
	}

	private handlePlayerLeft(playerId: string) {
		const multiplayerPlayer = this.multiplayerPlayers.get(playerId)
		if (multiplayerPlayer) {
			multiplayerPlayer.destroy()
			this.multiplayerPlayers.delete(playerId)
		}
	}

	private handlePlayerDisconnected() {
		// Clean up resources or notify the user about the disconnection
		console.log('Player disconnected from the server')
		// You can add UI notifications or other cleanup logic here
	}

	private handleChatMessage(message: ChatMessage) {
		if (message.scene === this.scene.key) {
			if (message.playerId === this.multiplayerService.socket?.id) {
				this.player.displayMessage(message.message)
			} else {
				const multiplayerPlayer = this.multiplayerPlayers.get(message.playerId)
				if (multiplayerPlayer) {
					multiplayerPlayer.displayMessage(message.message)
				}
			}
		}
	}

	update() {
		if (this.player) {
			// Update player
			this.player.update()

			// Update multiplayer players
			this.multiplayerPlayers.forEach(player => {
				player.update()
			})

			// Update player position in multiplayer service
			const playerSprite = this.player.getSprite()
			const currentPosition = { x: playerSprite.x, y: playerSprite.y }
			const now = Date.now()

			// Check if the player has moved and enough time has passed since the last update
			const hasMoved = !this.lastPositionUpdate || 
				(currentPosition.x !== this.lastPositionUpdate.x || 
				currentPosition.y !== this.lastPositionUpdate.y)
			
			const timeSinceLastUpdate = now - this.lastPositionUpdateTime

			if (hasMoved && timeSinceLastUpdate >= this.POSITION_UPDATE_THROTTLE) {
				// Always send the current scene key with position updates
				this.multiplayerService.updatePosition(
					currentPosition.x,
					currentPosition.y,
					this.scene.key
				)
				this.lastPositionUpdate = currentPosition
				this.lastPositionUpdateTime = now
			}
		}
	}

	// Abstract method to be implemented by child classes for loading additional assets
	protected abstract loadAdditionalAssets(): void
} 