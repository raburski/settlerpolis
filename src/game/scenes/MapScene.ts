import { Scene } from 'phaser'
import { EventBus } from '../EventBus'
import { Player } from '../entities/Player'
import { MultiplayerService, PlayerData, ChatMessage } from '../services/MultiplayerService'
import { MultiplayerPlayer } from '../entities/MultiplayerPlayer'
import { BasePlayer } from '../entities/BasePlayer'
import { Event } from '../../../backend/src/Event'
import { ChatMessageData, PlayerJoinData, PlayerMovedData, PlayerSourcedData } from "../../../backend/src/DataTypes"

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
	protected transitioning: boolean = false
	protected portalZones: Phaser.GameObjects.Zone[] = []
	protected portalRects: Phaser.GameObjects.Rectangle[] = []
	protected portalKey: Phaser.Input.Keyboard.Key | null = null

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
		
        this.transitioning = false
		// Create the portal activation key
		this.portalKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E)
		console.log('Portal key initialized:', this.portalKey)
		
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

		// Set world bounds to match the map size
		this.physics.world.bounds.width = map.widthInPixels
		this.physics.world.bounds.height = map.heightInPixels

		// Get scene data passed during transition
		const sceneData = this.scene.settings.data
		const playerX = sceneData?.playerX || 100
		const playerY = sceneData?.playerY || 300
		
		// Create player at the specified position
		this.player = new Player(this, playerX, playerY)

        // Create static objects from the object layer
		const staticObjects = map.getObjectLayer('static-objects')?.objects
        if (staticObjects) {
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

            // Set up collision between player and static objects
            staticObjectSprites.forEach(sprite => {
                this.physics.add.collider(this.player.getSprite(), sprite)
            })
        }
		
		// Set up collision between player and layers that have collision enabled
		layers.forEach((layer, layerName) => {
			const hasCollision = mapData.layers.find(l => l.name === layerName)?.properties?.some(prop => 
				prop.name === 'collision' && prop.value === true
			)
			
			if (hasCollision) {
				this.player.setCollisionWith(layer)
			}
		})

		// Set up camera to follow player
		this.cameras.main.startFollow(this.player.getSprite())
		this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels)
		
		// If this is a transition, fade in the camera
		if (sceneData?.isTransition) {
			this.cameras.main.fadeIn(500)
		}

		// Set up multiplayer
		this.setupMultiplayer()

        // Process portals from the portals layer
		this.processPortals(map)

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

	private handlePlayerJoined(data: PlayerJoinData) {
		const multiplayerPlayer = new MultiplayerPlayer(
			this,
			data.position.x,
			data.position.y,
			data.sourcePlayerId,
            {},
			// playerData.appearance
		)
		this.multiplayerPlayers.set(data.sourcePlayerId, multiplayerPlayer)
	}

	private handlePlayerMoved(data: PlayerMovedData) {
		const multiplayerPlayer = this.multiplayerPlayers.get(data.sourcePlayerId)
		if (multiplayerPlayer) {
			multiplayerPlayer.updatePositionFromServer(data)
		}
	}

	private handlePlayerLeft(data: PlayerSourcedData) {
        const playerId = data.sourcePlayerId
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

	private handleChatMessage(data: ChatMessageData) {
		if (data.sourcePlayerId === this.multiplayerService.socket?.id) {
			this.player.displayMessage(data.message)
		} else {
			const multiplayerPlayer = this.multiplayerPlayers.get(data.sourcePlayerId)
			if (multiplayerPlayer) {
				multiplayerPlayer.displayMessage(data.message)
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

			// Check for portal activation with E key
			if (this.portalKey && this.portalKey.isDown) {
				this.checkPortalActivation()
			}

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
	
	/**
	 * Check if the player is overlapping with any portal and activate it if the E key is pressed
	 */
	private checkPortalActivation(): void {
		if (!this.player) return
		
		const playerSprite = this.player.getSprite()
		const playerBounds = playerSprite.getBounds()
		
		// Check each portal zone for overlap with the player
		for (const portalZone of this.portalZones) {
			const portalBounds = portalZone.getBounds()
			
			// If the player is overlapping with this portal
			if (Phaser.Geom.Rectangle.Overlaps(playerBounds, portalBounds)) {
				// Get the portal data
				const portalData = portalZone.getData('portalData')
				
				// If the portal has a target scene, transition to it
				if (portalData && portalData.target) {
					console.log('Portal activated, transitioning to:', portalData.target)
					this.transitionToScene(portalData.target, portalData.targetX, portalData.targetY)
					return // Exit after finding the first overlapping portal
				}
			}
		}
	}

	// Process portals from the map
	private processPortals(map: Phaser.Tilemaps.Tilemap) {
		try {
			const portalsLayer = map.getObjectLayer('portals')
			if (!portalsLayer) return

			// Get the fromScene from the scene data
			const sceneData = this.scene.settings.data
			const fromScene = sceneData?.fromScene

			// Find a portal that matches the previous scene name
			const matchingPortal = fromScene ? portalsLayer.objects.find(obj => {
				const portalData = obj.properties?.find(prop => prop.name === 'target')
				return portalData?.value === fromScene
			}) : null

			// If a matching portal is found, position the player at that portal's location
			if (matchingPortal) {
				// Use the player's sprite container to set position
				this.player.getSprite().setPosition(matchingPortal.x, matchingPortal.y)
			}

			portalsLayer.objects.forEach(obj => {
				// Create a white semi-transparent rectangle for the portal
				const portalRect = this.add.rectangle(
					obj.x + obj.width/2, 
					obj.y + obj.height/2, 
					obj.width, 
					obj.height,
					0xffffff,
					0.1
				)
				
				// Store the portal rectangle for cleanup
				this.portalRects.push(portalRect)
				
				// Create a zone for the portal
				const portalZone = this.add.zone(obj.x, obj.y, obj.width, obj.height)
				this.physics.add.existing(portalZone, true)
				
				// Store the portal zone for cleanup
				this.portalZones.push(portalZone)

				const portalData = {
					target: obj.properties?.find(prop => prop.name === 'target')?.value,
					targetX: obj.properties?.find(prop => prop.name === 'targetX')?.value || obj.x,
					targetY: obj.properties?.find(prop => prop.name === 'targetY')?.value || obj.y
				}

				// Store the portal data on the zone
				portalZone.setData('portalData', portalData)
				
				// Add a text hint above the portal
				const hintText = this.add.text(
					obj.x + obj.width/2,
					obj.y - 20,
					"Press E to enter",
					{ 
						fontSize: '14px', 
						color: '#ffffff',
						backgroundColor: '#000000',
						padding: { x: 5, y: 5 }
					}
				)
				hintText.setOrigin(0.5, 0.5)
				
				// Store the hint text for cleanup
				this.portalRects.push(hintText)
			})
		} catch (error) {
			console.error('Error processing portals:', error)
		}
	}

	// Transition to a new scene with a fade effect
	protected transitionToScene(targetScene: string, targetX: number = 0, targetY: number = 0) {
		// Prevent multiple transitions
		if (this.transitioning) return
		this.transitioning = true
		
		// Store the player's current position for the new scene
		const playerX = this.player.getSprite().x
		const playerY = this.player.getSprite().y
		
		// Clean up resources before transitioning
		// this.cleanupScene()
		
		// Create a fade out effect
		this.cameras.main.fade(500, 0, 0, 0)
		
		// Wait for the fade to complete before transitioning
		this.cameras.main.once('camerafadeoutcomplete', () => {
			// Start the new scene with the player's position and the current scene name
			this.scene.start(targetScene, { 
				x: targetX, 
				y: targetY,
				playerX: playerX,
				playerY: playerY,
				isTransition: true,
				fromScene: this.scene.key // Pass the current scene name
			})
		})
	}

	/**
	 * Clean up resources before transitioning to a new scene
	 * This helps prevent memory leaks and ensures a smooth transition
	 */
	protected cleanupScene(): void {
		try {
			// Remove event listeners
			EventBus.off(Event.Chat.Message, this.handleChatMessage, this)
			EventBus.off(Event.Player.Joined, this.handlePlayerJoined, this)
			EventBus.off(Event.Player.Moved, this.handlePlayerMoved, this)
			EventBus.off(Event.Player.Left, this.handlePlayerLeft, this)
			EventBus.off(Event.Player.Disconnected, this.handlePlayerDisconnected, this)
			
			// Clean up multiplayer players
			this.multiplayerPlayers.forEach(player => {
				player.destroy()
			})
			this.multiplayerPlayers.clear()
			
			// Clean up the player
			if (this.player) {
				this.player.destroy()
			}
			
			// Clean up portal zones and rectangles
			this.portalZones.forEach(zone => {
				// Remove physics body
				if (zone.body) {
					this.physics.world.disableBody(zone.body)
				}
				zone.destroy()
			})
			this.portalZones = []
			
			this.portalRects.forEach(rect => {
				rect.destroy()
			})
			this.portalRects = []
			
			// Clean up any other game objects that might be created in child classes
			this.cleanupAdditionalResources()
			
			console.log(`Scene ${this.scene.key} cleaned up successfully`)
		} catch (error) {
			console.error(`Error cleaning up scene ${this.scene.key}:`, error)
		}
	}
	
	/**
	 * Override this method in child classes to clean up additional resources
	 */
	protected cleanupAdditionalResources(): void {
		// Default implementation does nothing
		// Child classes should override this method to clean up their specific resources
	}

	// Abstract method to be implemented by child classes for loading additional assets
	protected abstract loadAdditionalAssets(): void
} 