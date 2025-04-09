import { Scene, GameObjects, Input, Physics } from 'phaser'
import { EventBus } from '../EventBus'
import { Player } from '../entities/Player'
import { MultiplayerService, PlayerData, ChatMessage } from '../services/MultiplayerService'
import { MultiplayerPlayer } from '../entities/MultiplayerPlayer'
import { BasePlayer } from '../entities/BasePlayer'
import { Event } from '../../../backend/src/Event'
import { ChatMessageData, PlayerJoinData, PlayerMovedData, PlayerSourcedData, DroppedItem } from "../../../backend/src/DataTypes"
import { PICKUP_RANGE } from '../../../backend/src/consts'
import { PortalManager } from '../modules/Portals'
import { AssetManager, TilesetInfo } from '../modules/Assets'

export abstract class MapScene extends Scene {
	protected player: Player | null = null
	protected assetsLoaded: boolean = false
	protected mapKey: string
	protected mapPath: string
	protected multiplayerPlayers: Map<string, Player> = new Map()
	protected multiplayerService: MultiplayerService
	protected lastPositionUpdate: { x: number, y: number } | null = null
	protected lastPositionUpdateTime: number = 0
	protected readonly POSITION_UPDATE_THROTTLE = 100 // 100ms
	protected transitioning: boolean = false
	protected portalManager: PortalManager | null = null
	protected assetManager: AssetManager
	protected droppedItems: Map<string, GameObjects.Sprite> = new Map()

	constructor(key: string, mapKey: string, mapPath: string) {
		super(key)
        
		this.mapKey = mapKey
		this.mapPath = mapPath
		this.multiplayerService = MultiplayerService.getInstance()
		this.assetManager = new AssetManager(this, mapKey, mapPath, this.initializeScene.bind(this))
	}

	preload() {
		// Load player assets
		BasePlayer.preload(this)
		Player.preload(this)
		
		// Load item placeholder
		this.load.image('item-placeholder', 'assets/items/placeholder.png')
		
		// Load map and other assets
		this.assetManager.preload()
	}

	create() {
		console.log('CREATE', this.mapKey, this.assetManager)
		this.transitioning = false
		this.assetManager.create()
	}
	
	protected initializeScene() {
		console.log('INIT SCENE', this.mapKey)
		// Create the map
		const map = this.make.tilemap({ key: this.mapKey })
		
		// Load object tilesets and their mappings
		this.assetManager.loadTilesetObjects(map)
		
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
				const tilesetInfo = this.assetManager.getTilesetObjects().get(obj.gid)
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

		// Set up camera to follow player and center the map if smaller than the window
		this.cameras.main.startFollow(this.player.getSprite())
		
		// Calculate the offset to center the map if it's smaller than the window
		const windowWidth = this.scale.width
		const windowHeight = this.scale.height
		const mapWidth = map.widthInPixels
		const mapHeight = map.heightInPixels
		
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
		if (sceneData?.isTransition) {
			this.cameras.main.fadeIn(500)
		}

		// Set up multiplayer
		this.setupMultiplayer()

		// Initialize the portal manager
		this.portalManager = new PortalManager(this, this.player)
		
		// Set the portal activated callback
		this.portalManager.setPortalActivatedCallback((portalData) => {
			this.transitionToScene(portalData.target, portalData.targetX, portalData.targetY)
		})
		
		// Process portals
		this.portalManager.processPortals(map)

		EventBus.emit('current-scene-ready', this)

		// Listen for chat messages
		EventBus.on(Event.Chat.Message, this.handleChatMessage, this)

		// Set up scene event listeners
		EventBus.on(Event.Scene.AddItems, this.handleAddItems, this)
		EventBus.on(Event.Scene.RemoveItems, this.handleRemoveItems, this)
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

	private handleAddItems = (data: { items: DroppedItem[] }) => {
		data.items.forEach(item => {
			// Create a sprite for the dropped item
			const sprite = this.add.sprite(item.position.x, item.position.y, 'item-placeholder')
			sprite.setScale(0.5) // Adjust scale as needed
			
			// Create text for item name (initially hidden)
			const nameText = this.add.text(sprite.x, sprite.y - 20, item.name, {
				fontSize: '14px',
				color: '#ffffff',
				backgroundColor: '#000000',
				padding: { x: 4, y: 2 },
				align: 'center'
			})
			nameText.setOrigin(0.5)
			nameText.setVisible(false)
			
			// Make item interactive
			sprite.setInteractive({ useHandCursor: true })
			
			// Add hover effect
			sprite.on('pointerover', () => {
				sprite.setTint(0xffff00) // Yellow tint on hover
				nameText.setVisible(true)
			})
			
			sprite.on('pointerout', () => {
				sprite.clearTint()
				nameText.setVisible(false)
			})
			
			// Add click handler for pickup
			sprite.on('pointerdown', () => {
				// Check if player is close enough to pick up
				if (this.player) {
					const distance = Phaser.Math.Distance.Between(
						this.player.getSprite().x,
						this.player.getSprite().y,
						sprite.x,
						sprite.y
					)
					
					if (distance <= PICKUP_RANGE) {
						EventBus.emit(Event.Inventory.PickUp, { itemId: item.id })
					} else {
						// Optional: Show "too far" message
						this.player.displaySystemMessage("Too far to pick up")
					}
				}
			})
			
			// Store both sprite and text in our tracked items
			this.droppedItems.set(item.id, sprite)
			
			// Store the name text reference to clean it up later
			sprite.setData('nameText', nameText)
		})
	}

	private handleRemoveItems = (data: { itemIds: string[] }) => {
		data.itemIds.forEach(itemId => {
			const sprite = this.droppedItems.get(itemId)
			if (sprite) {
				// Clean up the name text
				const nameText = sprite.getData('nameText') as Phaser.GameObjects.Text
				if (nameText) {
					nameText.destroy()
				}
				sprite.destroy()
				this.droppedItems.delete(itemId)
			}
		})
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
					currentPosition.y
				)
				this.lastPositionUpdate = currentPosition
				this.lastPositionUpdateTime = now
			}

			// Update the portal manager
			if (this.portalManager) {
				this.portalManager.update()
			}
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

		// Send transition event to server
		this.multiplayerService.transitionToScene(targetX, targetY, targetScene)
		
		// Clean up resources before transitioning
		this.cleanupScene()
		
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
			EventBus.off(Event.Scene.AddItems, this.handleAddItems, this)
			EventBus.off(Event.Scene.RemoveItems, this.handleRemoveItems, this)
			
			// Clean up multiplayer players
			this.multiplayerPlayers.forEach(player => {
				player.destroy()
			})
			this.multiplayerPlayers.clear()
			
			// Clean up the player
			if (this.player) {
				this.player.destroy()
				this.player = null
			}
			
			// Clean up portal manager
			if (this.portalManager) {
				this.portalManager.cleanup()
				this.portalManager = null
			}
			
			// Clean up dropped items
			this.droppedItems.forEach(sprite => sprite.destroy())
			this.droppedItems.clear()
			
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

	public destroy(): void {
		// Remove event listeners
		EventBus.off(Event.Scene.AddItems, this.handleAddItems, this)
		EventBus.off(Event.Scene.RemoveItems, this.handleRemoveItems, this)
		
		// Clean up dropped items
		this.droppedItems.forEach(sprite => sprite.destroy())
		this.droppedItems.clear()

		// ... rest of destroy code ...
	}
} 