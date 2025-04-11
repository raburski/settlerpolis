import { EventBus } from "../../EventBus";
import { MapScene } from "./MapScene";
import { Event } from '@backend/events'
import { createPlayer } from '../../entities/Player'
import { PlayerView } from '../../entities/Player/View'
import { PlayerController } from '../../entities/Player/Controller'

type Player = {
	view: PlayerView
	controller: PlayerController
}

export abstract class GameScene extends MapScene {
    protected player: Player | null = null
	protected multiplayerPlayers: Map<string, Player> = new Map()
	protected lastPositionUpdate: { x: number, y: number } | null = null
	protected lastPositionUpdateTime: number = 0
	protected readonly POSITION_UPDATE_THROTTLE = 100 // 100ms

	protected droppedItems: Map<string, GameObjects.Sprite> = new Map()
	protected npcs: Map<string, NPCSprite> = new Map()
	// protected npcService: NPCService

	constructor(key: string, mapKey: string, mapPath: string) {
		super(key, mapKey, mapPath)
        
		// this.npcService = new NPCService(EventBus, this.multiplayerService)
	}

    protected initializeScene(): void {
        super.initializeScene()
        // Get scene data passed during transition
		const sceneData = this.scene.settings.data
		const playerX = sceneData?.playerX || 100
		const playerY = sceneData?.playerY || 300
		
		// Create player at the specified position
		this.player = createPlayer(this)

		// Position the player
		this.player.view.updatePosition(playerX, playerY)

        // Set up multiplayer
		this.setupMultiplayer()

        // Set up camera to follow player
		this.cameras.main.startFollow(this.player.view)
    }

    update() {
        if (this.player) {
            this.player.controller.update()
        }
    }

    private setupMultiplayer() {
        // Set up multiplayer event listeners
		EventBus.on(Event.Players.SC.Joined, this.handlePlayerJoined, this)
		EventBus.on(Event.Players.CS.Move, this.handlePlayerMoved, this)
		EventBus.on(Event.Players.SC.Left, this.handlePlayerLeft, this)
		EventBus.on(Event.Players.SC.Left, this.handlePlayerDisconnected, this)

        // Listen for chat messages
		EventBus.on(Event.Chat.SC.Receive, this.handleChatMessage, this)

		// Set up scene event listeners
		EventBus.on(Event.Loot.SC.Spawn, this.handleAddItems, this)
		EventBus.on(Event.Loot.SC.Despawn, this.handleRemoveItems, this)
		EventBus.on(Event.NPC.SC.List, this.handleNPCList, this)

		// Join the game
		// const playerSprite = this.player.getSprite()
		// this.multiplayerService.joinGame(
		// 	playerSprite.x,
		// 	playerSprite.y,
		// 	this.scene.key,
		// 	this.player.appearance
		// )
	}

	private handlePlayerJoined(data: PlayerJoinData) {
        console.log('handlePlayerJoined', data)
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
			this.player?.view.displayMessage(data.message)
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
			const sprite = this.add.sprite(item.position.x, item.position.y, 'mozgotrzep')
			
			// Set initial state for animation
			sprite.setScale(0)
			sprite.setAlpha(0)
			sprite.y += 40 // Start below final position
			
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
						this.player.view.x,
						this.player.view.y,
						sprite.x,
						sprite.y
					)
					
					if (distance <= PICKUP_RANGE) {
						EventBus.emit(Event.Inventory.CS.PickUp, { itemId: item.id })
					} else {
						// Optional: Show "too far" message
						this.player.view.displaySystemMessage("Too far to pick up")
					}
				}
			})
			
			// Store both sprite and text in our tracked items
			this.droppedItems.set(item.id, sprite)
			
			// Store the name text reference to clean it up later
			sprite.setData('nameText', nameText)
			
			// First tween: throw up and fade in
			this.tweens.add({
				targets: sprite,
				y: item.position.y - 30, // Throw up high
				scaleX: 0.5,
				scaleY: 0.5,
				alpha: 1,
				duration: 300,
				ease: 'Quad.out',
				onComplete: () => {
					// Second tween: fall down with bounce
					this.tweens.add({
						targets: sprite,
						y: item.position.y,
						duration: 400,
						ease: 'Bounce.out',
					})
				}
			})
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

	private handleNPCList = (data: { npcs: NPC[] }) => {
		// Clear existing NPCs first
		this.npcs.forEach(npc => npc.destroy())
		this.npcs.clear()
        

		// Create new NPCs
		data.npcs.forEach(npcData => {
			const npc = new NPCSprite(this, npcData, this.npcService)
			this.npcs.set(npcData.id, npc)

			// If we have a player, set up collision with NPCs
			if (this.player) {
				this.physics.add.collider(this.player.view, npc)
			}
		})
	}


    protected cleanupScene(): void {
        			// Remove event listeners
			EventBus.off(Event.Chat.SC.Receive, this.handleChatMessage, this)
			EventBus.off(Event.Players.SC.Joined, this.handlePlayerJoined, this)
			EventBus.off(Event.Players.CS.Move, this.handlePlayerMoved, this)
			EventBus.off(Event.Players.SC.Left, this.handlePlayerLeft, this)
			EventBus.off(Event.Players.SC.Left, this.handlePlayerDisconnected, this)
			EventBus.off(Event.Loot.SC.Spawn, this.handleAddItems, this)
			EventBus.off(Event.Loot.SC.Despawn, this.handleRemoveItems, this)
			EventBus.off(Event.NPC.SC.List, this.handleNPCList, this)
        // Clean up dropped items
        this.droppedItems.forEach(sprite => {
            const nameText = sprite.getData('nameText') as Phaser.GameObjects.Text
            if (nameText) {
                nameText.destroy()
            }
            sprite.destroy()
        })
        this.droppedItems.clear()
        
        // Clean up NPCs
        this.npcs.forEach(npc => npc.destroy())
        this.npcs.clear()
    }

    public destroy(): void {
		// Remove event listeners
		EventBus.off(Event.Loot.SC.Spawn, this.handleAddItems, this)
		EventBus.off(Event.Loot.SC.Despawn, this.handleRemoveItems, this)
		EventBus.off(Event.NPC.SC.List, this.handleNPCList, this)
		
		// Clean up dropped items
		this.droppedItems.forEach(sprite => sprite.destroy())
		this.droppedItems.clear()

		// Clean up NPCs
		this.npcs.forEach(npc => npc.destroy())
		this.npcs.clear()

		// ... rest of destroy code ...
	}
}