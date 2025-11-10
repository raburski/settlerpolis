import { EventBus } from "../../EventBus";
import { MapScene } from "./MapScene";
import { Event } from "@rugged/game"
import { createLocalPlayer, LocalPlayer } from '../../entities/LocalPlayer'
import { PlayerView } from '../../entities/Player/View'
import { PlayerView2 } from '../../entities/Player/View2'
import { LocalPlayerController } from '../../entities/Player/LocalPlayerController'
import { createRemotePlayer, RemotePlayer } from '../../entities/RemotePlayer'
import { createNPC, NPC } from '../../entities/NPC'
import { Keyboard } from '../../modules/Keyboard'
import { createLoot, Loot, DroppedItem } from '../../entities/Loot'
import { PortalManager } from "../../modules/Portals";
import networkManager from "../../network";
import { playerService } from "../../services/PlayerService";
import { createMapObject, MapObjectEntity } from '../../entities/MapObject'
import { BuildingPlacementManager } from '../../modules/BuildingPlacement'
import { FX } from '../../modules/FX'
import { TextDisplayService } from '../../services/TextDisplayService'
import { NPCProximityService } from '../../services/NPCProximityService'
import { NPCController } from '../../entities/NPC/NPCController'

export abstract class GameScene extends MapScene {
    protected player: LocalPlayer | null = null
	protected remotePlayers: Map<string, RemotePlayer> = new Map()
	protected droppedItems: Map<string, Loot> = new Map()
	protected npcs: Map<string, NPCController> = new Map()
	protected mapObjects: Map<string, MapObjectEntity> = new Map()
	protected keyboard: Keyboard | null = null
	protected portalManager: PortalManager | null = null
	protected buildingPlacementManager: BuildingPlacementManager | null = null
	protected fx: FX | null = null
	protected textDisplayService: TextDisplayService | null = null
	protected npcProximityService: NPCProximityService

	constructor(config: { key: string, mapKey: string, mapPath: string }) {
		super(config.key, config.mapKey, config.mapPath)
		this.npcProximityService = new NPCProximityService(this)
	}

    protected initializeScene(): void {
        super.initializeScene()
		
		// Initialize keyboard
		this.keyboard = new Keyboard(this)

        // Initialize text display service
		this.textDisplayService = new TextDisplayService(this)

        // Initialize NPC proximity service
		this.npcProximityService.initialize()

        // Get scene data passed during transition
		const sceneData = this.scene.settings.data
		const playerX = sceneData?.x || 100
		const playerY = sceneData?.y || 300
		const isTransition = sceneData?.isTransition || false
		
		// Create player
		this.player = createLocalPlayer(this, playerX, playerY, playerService.playerId)
		
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

		// Initialize the building placement manager
		this.buildingPlacementManager = new BuildingPlacementManager(this)

		// Initialize FX
		this.fx = new FX(this)

		// Set up collision for the player
		this.initializeCollision([this.player.view])

		// Only emit join event if this is not a scene transition
		if (!isTransition) {
			EventBus.emit(Event.Players.CS.Join, { 
				position: { x: playerX, y: playerY}, 
				mapId: this.mapKey,
				appearance: {}
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
		this.npcs.forEach((controller) => {
			controller.update()
		})

		// Update map objects
		this.mapObjects.forEach(mapObject => {
			mapObject.controller.update()
		})

		// Update building placement manager
		if (this.buildingPlacementManager) {
			this.buildingPlacementManager.update()
		}

		this.textDisplayService?.update()

		// Update NPC proximity service if we have a player
		if (this.player) {
			this.npcProximityService.update(
				{ x: this.player.view.x, y: this.player.view.y },
				this.npcs
			)
		}
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
		EventBus.on(Event.NPC.SC.Spawn, this.handleNPCSpawn, this)
		EventBus.on(Event.NPC.SC.Despawn, this.handleNPCDespawn, this)

		// Set up map objects event listeners
		EventBus.on(Event.MapObjects.SC.Spawn, this.handleMapObjectSpawn, this)
		EventBus.on(Event.MapObjects.SC.Despawn, this.handleMapObjectDespawn, this)

		// Set up building event listeners
		EventBus.on(Event.Buildings.SC.Placed, this.handleBuildingPlaced, this)
		EventBus.on(Event.Buildings.SC.Progress, this.handleBuildingProgress, this)
		EventBus.on(Event.Buildings.SC.Completed, this.handleBuildingCompleted, this)
		EventBus.on(Event.Buildings.SC.Cancelled, this.handleBuildingCancelled, this)
	}

	private handlePlayerJoined = (data: { playerId: string, position: { x: number, y: number } }) => {
		const remotePlayer = createRemotePlayer(
			this,
			data.position.x,
			data.position.y,
			data.playerId
		)
		this.remotePlayers.set(data.playerId, remotePlayer)
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

	private handleAddItems = (data: { item: DroppedItem }) => {
		console.log('[CLIENT DEBUG] handleAddItems called with item:', data.item)
		if (this.player) {
			const loot = createLoot(this, data.item, this.player.view)
			this.droppedItems.set(data.item.id, loot)
			console.log('[CLIENT DEBUG] Added item to droppedItems. Current items:',
				Array.from(this.droppedItems.keys())
			)
		}
	}

	private handleRemoveItems = (data: { itemId: string }) => {
		const loot = this.droppedItems.get(data.itemId)
		if (loot) {
			loot.controller.destroy()
			this.droppedItems.delete(data.itemId)
		}
	}

	private handleNPCSpawn = (data: { npc: NPC }) => {
		const npc = createNPC(this, data.npc.position.x, data.npc.position.y, data.npc)
		this.npcs.set(data.npc.id, npc)

		// If we have a player, set up collision with the new NPC
		if (this.player) {
			this.physics.add.collider(this.player.view, npc.view)
		}
	}

	private handleNPCDespawn = (data: { npc: NPC }) => {
		const npcController = this.npcs.get(data.npc.id)
		if (npcController) {
			npcController.destroy()
			this.npcs.delete(data.npc.id)
		}
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

	private handleMapObjectSpawn = (data: { object: any }) => {
		// Only add objects for the current map
		if (data.object.mapName === this.mapKey) {
			const mapObject = createMapObject(this, data.object)
			this.mapObjects.set(data.object.id, mapObject)
			
			// If we have a player, set up collision with the map object
			if (this.player) {
				this.physics.add.collider(this.player.view, mapObject.view.getSprite())
			}
		}
	}

	private handleMapObjectDespawn = (data: { objectId: string }) => {
		const mapObject = this.mapObjects.get(data.objectId)
		if (mapObject) {
			mapObject.controller.destroy()
			this.mapObjects.delete(data.objectId)
		}
	}

	private handleBuildingPlaced = (data: { building: any }) => {
		// Building is already handled via MapObject spawn, but we can add specific logic here
		console.log('[GameScene] Building placed:', data.building)
	}

	private handleBuildingProgress = (data: { buildingInstanceId: string, progress: number, stage: string }) => {
		// Find the map object associated with this building and update its progress
		// For Phase A, we'll update the visual representation
		console.log('[GameScene] Building progress:', data)
	}

	private handleBuildingCompleted = (data: { building: any }) => {
		// Update building visual to show completed state
		console.log('[GameScene] Building completed:', data.building)
	}

	private handleBuildingCancelled = (data: { buildingInstanceId: string, refundedItems: any[] }) => {
		// Building removal is handled via MapObject despawn
		console.log('[GameScene] Building cancelled:', data)
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
			// Start the new scene with the player's position and the current map ID
			this.scene.start(targetScene, { 
				x: targetX, 
				y: targetY,
				playerX: playerX,
				playerY: playerY,
				isTransition: true,
				fromMapId: this.mapKey
			})
		})
	}


    protected cleanupScene(): void {
		// Clean up keyboard
		if (this.keyboard) {
			this.keyboard.destroy()
			this.keyboard = null
		}

		// Clean up FX
		if (this.fx) {
			this.fx.destroy()
			this.fx = null
		}

		// Clean up text display service
		if (this.textDisplayService) {
			this.textDisplayService.destroy()
			this.textDisplayService = null
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

		// Clean up map objects
		this.mapObjects.forEach(mapObject => {
			mapObject.controller.destroy()
		})
		this.mapObjects.clear()

		// Clean up portal manager
		if (this.portalManager) {
			this.portalManager = null
		}

		// Clean up item placement manager
		if (this.itemPlacementManager) {
			this.itemPlacementManager.destroy()
			this.itemPlacementManager = null
		}

		// Clean up event listeners
		EventBus.off(Event.Players.SC.Joined, this.handlePlayerJoined)
		EventBus.off(Event.Players.SC.Left, this.handlePlayerLeft)
		EventBus.off(Event.Loot.SC.Spawn, this.handleAddItems)
		EventBus.off(Event.Loot.SC.Despawn, this.handleRemoveItems)
		EventBus.off(Event.NPC.SC.List, this.handleNPCList)
		EventBus.off(Event.NPC.SC.Spawn, this.handleNPCSpawn)
		EventBus.off(Event.NPC.SC.Despawn, this.handleNPCDespawn)
		EventBus.off(Event.MapObjects.SC.Spawn, this.handleMapObjectSpawn)
		EventBus.off(Event.MapObjects.SC.Despawn, this.handleMapObjectDespawn)
	}

    public destroy(): void {
		// Remove event listeners
		EventBus.off(Event.Players.SC.Joined, this.handlePlayerJoined)
		EventBus.off(Event.Players.SC.Left, this.handlePlayerLeft)
		EventBus.off(Event.Loot.SC.Spawn, this.handleAddItems)
		EventBus.off(Event.Loot.SC.Despawn, this.handleRemoveItems)
		EventBus.off(Event.NPC.SC.List, this.handleNPCList)
		EventBus.off(Event.NPC.SC.Spawn, this.handleNPCSpawn)
		EventBus.off(Event.NPC.SC.Despawn, this.handleNPCDespawn)
		EventBus.off(Event.MapObjects.SC.Spawn, this.handleMapObjectSpawn)
		EventBus.off(Event.MapObjects.SC.Despawn, this.handleMapObjectDespawn)
		
		this.npcProximityService.destroy()
		super.destroy()
	}

	private handleNPCUpdate = (data: { npc: NPC }) => {
		const existingController = this.npcs.get(data.npc.id)
		if (existingController) {
			existingController.updateNPC(data.npc)
		} else {
			const controller = createNPC(data.npc, this)
			this.npcs.set(data.npc.id, controller)
		}
	}

}