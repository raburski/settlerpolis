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
	// protected npcService: NPCService

	constructor(key: string, mapKey: string, mapPath: string) {
		super(key, mapKey, mapPath)
		// this.npcService = new NPCService(EventBus, this.multiplayerService)
	}

    protected initializeScene(): void {
        super.initializeScene()
		
		// Initialize keyboard
		this.keyboard = new Keyboard(this)

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

        EventBus.emit(Event.Players.CS.Join, { position: { x: playerX, y: playerY}, scene: 'FarmScene', appareance: {}})
    }

    update() {
		if (this.keyboard) {
			this.keyboard.update()
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

		// Set up scene event listeners
		EventBus.on(Event.Loot.SC.Spawn, this.handleAddItems, this)
		EventBus.on(Event.Loot.SC.Despawn, this.handleRemoveItems, this)
		EventBus.on(Event.NPC.SC.List, this.handleNPCList, this)


	}

	private handlePlayerJoined = (data: { sourcePlayerId: string, position: { x: number, y: number } }) => {
		const remotePlayer = createRemotePlayer(
			this,
			data.position.x,
			data.position.y,
			data.sourcePlayerId
		)
		this.remotePlayers.set(data.sourcePlayerId, remotePlayer)
	}

	private handlePlayerLeft = (data: { sourcePlayerId: string }) => {
		const remotePlayer = this.remotePlayers.get(data.sourcePlayerId)
		if (remotePlayer) {
			remotePlayer.controller.destroy()
			this.remotePlayers.delete(data.sourcePlayerId)
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


    protected cleanupScene(): void {
		// Clean up keyboard
		if (this.keyboard) {
			this.keyboard.destroy()
			this.keyboard = null
		}

		// Clean up remote players
		this.remotePlayers.forEach(player => {
			player.controller.destroy()
		})
		this.remotePlayers.clear()

		// Clean up NPCs
		this.npcs.forEach(npc => {
			npc.controller.destroy()
		})
		this.npcs.clear()

		// Clean up dropped items
		this.droppedItems.forEach(loot => {
			loot.controller.destroy()
		})
		this.droppedItems.clear()

		// Remove event listeners
		EventBus.off(Event.Players.SC.Joined, this.handlePlayerJoined, this)
		EventBus.off(Event.Players.SC.Left, this.handlePlayerLeft, this)
		EventBus.off(Event.Loot.SC.Spawn, this.handleAddItems, this)
		EventBus.off(Event.Loot.SC.Despawn, this.handleRemoveItems, this)
		EventBus.off(Event.NPC.SC.List, this.handleNPCList, this)
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