import { EventBus } from "../../EventBus";
import { MapScene } from "./MapScene";
import { Event } from '../../../../backend/src/events'
import { createPlayer } from '../../entities/Player'
import { PlayerView } from '../../entities/Player/View'
import { PlayerController } from '../../entities/Player/Controller'
import { createRemotePlayer, RemotePlayer } from '../../entities/RemotePlayer'
import { createNPC, NPC } from '../../entities/NPC'
import { Keyboard } from '../../modules/Keyboard'
import { createLoot, Loot, DroppedItem } from '../../entities/Loot'
import { PortalManager } from "../../modules/Portals";
import networkManager from "../../network";
import { playerService } from "../../services/PlayerService";

type Player = {
	view: PlayerView
	controller: PlayerController
}

export abstract class GameScene extends MapScene {
    protected player: Player | null = null
	protected remotePlayers: Map<string, RemotePlayer> = new Map()
	protected droppedItems: Map<string, Loot> = new Map()
	protected npcs: Map<string, NPC> = new Map()
	protected keyboard: Keyboard | null = null
    protected portalManager: PortalManager | null = null

	constructor(key: string, mapKey: string, mapPath: string) {
		super(key, mapKey, mapPath)
	}

    protected initializeScene(): void {
        super.initializeScene()
		
		// Initialize keyboard
		this.keyboard = new Keyboard(this)

        // Get scene data passed during transition
		const sceneData = this.scene.settings.data
		const playerX = sceneData?.x || 100
		const playerY = sceneData?.y || 300
		const isTransition = sceneData?.isTransition || false
		
		// Create player at the specified position
		this.player = createPlayer(this, playerService.playerId)

		// Position the player
		this.player.view.updatePosition(playerX, playerY)

        // Set up multiplayer
		this.setupMultiplayer()

        // Set up camera to follow player
		this.cameras.main.startFollow(this.player.view)

        // Initialize the portal manager
		this.portalManager = new PortalManager(this, this.player.view)
		
		// Set the portal activated callback
		this.portalManager.setPortalActivatedCallback((portalData) => {
			this.transitionToScene(portalData.target, portalData.targetX, portalData.targetY)
		})
		
		// Process portals
		this.portalManager.processPortals(this.map)

		// Only emit join event if this is not a scene transition
		if (!isTransition) {
			EventBus.emit(Event.Players.CS.Join, { 
				position: { x: playerX, y: playerY}, 
				scene: this.scene.key, 
				appareance: {}
			})
		}
    }

    update() {
		if (this.keyboard) {
			this.keyboard.update()
		}

        if (this.portalManager) {
			this.portalManager.update()
		}

        if (this.player) {
            this.player.controller.update()
        }

		// Update remote players
		this.remotePlayers.forEach(player => {
			player.controller.update()
		})

		// Update NPCs
		this.npcs.forEach(npc => {
			npc.controller.update()
		})
    }

    private setupMultiplayer() {
        // Set up multiplayer event listeners
		EventBus.on(Event.Players.SC.Joined, this.handlePlayerJoined, this)
		EventBus.on(Event.Players.SC.Left, this.handlePlayerLeft, this)
		EventBus.on(Event.Players.SC.Move, this.handlePlayerMove, this)

		// Set up scene event listeners
		EventBus.on(Event.Loot.SC.Spawn, this.handleAddItems, this)
		EventBus.on(Event.Loot.SC.Despawn, this.handleRemoveItems, this)
		EventBus.on(Event.NPC.SC.List, this.handleNPCList, this)


	}

	private handlePlayerJoined = (data: { playerId: string, position: { x: number, y: number } }) => {
		const remotePlayer = createRemotePlayer(
			this,
			data.position.x,
			data.position.y,
			data.playerId
		)
		this.remotePlayers.set(data.id, remotePlayer)
	}

	private handlePlayerMove = (data) => {
		const remotePlayer = this.remotePlayers.get(data.sourcePlayerId)
		if (remotePlayer) {
			remotePlayer.controller.handlePlayerMoved(data)
		}
	}

	private handlePlayerLeft = (data: { playerId: string }) => {
		const remotePlayer = this.remotePlayers.get(data.playerId)
		if (remotePlayer) {
			remotePlayer.controller.destroy()
			this.remotePlayers.delete(data.playerId)
		}
	}

	private handleAddItems = (data: { items: DroppedItem[] }) => {
		data.items.forEach(item => {
			if (this.player) {
				const loot = createLoot(this, item, this.player.view)
				this.droppedItems.set(item.id, loot)
			}
		})
	}

	private handleRemoveItems = (data: { itemIds: string[] }) => {
		data.itemIds.forEach(itemId => {
			const loot = this.droppedItems.get(itemId)
			if (loot) {
				loot.controller.destroy()
				this.droppedItems.delete(itemId)
			}
		})
	}

	private handleNPCList = (data: { npcs: NPC[] }) => {
		// Clear existing NPCs first
		this.npcs.forEach(npc => npc.controller.destroy())
		this.npcs.clear()

		// Create new NPCs
		data.npcs.forEach(npcData => {
			const npc = createNPC(this, npcData.position.x, npcData.position.y, npcData)
			this.npcs.set(npcData.id, npc)

			// If we have a player, set up collision with NPCs
			if (this.player) {
				this.physics.add.collider(this.player.view, npc.view)
			}
		})
	}

    	// Transition to a new scene with a fade effect
	protected transitionToScene(targetScene: string, targetX: number = 0, targetY: number = 0) {
		// Prevent multiple transitions
		if (this.transitioning) return
		this.transitioning = true
		
		// Store the player's current position for the new scene
		const playerX = this.player.view.x
		const playerY = this.player.view.y

		// Send transition event to server
		// this.multiplayerService.transitionToScene(targetX, targetY, targetScene)
		
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


    protected cleanupScene(): void {
		// Clean up keyboard
		if (this.keyboard) {
			this.keyboard.destroy()
			this.keyboard = null
		}

		// Clean up player
		if (this.player) {
			this.player.controller.destroy()
			this.player = null
		}

		// Clean up remote players
		this.remotePlayers.forEach(player => {
			player.controller.destroy()
		})
		this.remotePlayers.clear()

		// Clean up dropped items
		this.droppedItems.forEach(item => {
			item.controller.destroy()
		})
		this.droppedItems.clear()

		// Clean up NPCs
		this.npcs.forEach(npc => {
			npc.controller.destroy()
		})
		this.npcs.clear()

		// Clean up portal manager
		if (this.portalManager) {
			this.portalManager = null
		}

		// Clean up event listeners
		EventBus.off(Event.Players.SC.Joined, this.handlePlayerJoined)
		EventBus.off(Event.Players.SC.Left, this.handlePlayerLeft)
		EventBus.off(Event.Loot.SC.Spawn, this.handleAddItems)
		EventBus.off(Event.Loot.SC.Despawn, this.handleRemoveItems)
		EventBus.off(Event.NPC.SC.List, this.handleNPCList)
	}

    public destroy(): void {
		// Remove event listeners
		EventBus.off(Event.Loot.SC.Spawn, this.handleAddItems, this)
		EventBus.off(Event.Loot.SC.Despawn, this.handleRemoveItems, this)
		EventBus.off(Event.NPC.SC.List, this.handleNPCList, this)
		
		// Clean up dropped items
		this.droppedItems.forEach(loot => loot.controller.destroy())
		this.droppedItems.clear()

		// Clean up NPCs
		this.npcs.forEach(npc => npc.controller.destroy())
		this.npcs.clear()

		// ... rest of destroy code ...
	}
}