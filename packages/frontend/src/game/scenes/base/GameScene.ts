import { EventBus } from '../../EventBus'
import { UiEvents } from '../../uiEvents'
import { MapScene } from './MapScene'
import { Event } from '@rugged/game'
import { createLocalPlayer, type LocalPlayer } from '../../entities/LocalPlayer'
import { createRemotePlayer, type RemotePlayer } from '../../entities/RemotePlayer'
import { createNPC, type NPCController } from '../../entities/NPC'
import { createSettler, type SettlerController } from '../../entities/Settler'
import { Keyboard } from '../../modules/Keyboard'
import { createLoot, type Loot } from '../../entities/Loot'
import { PortalManager } from '../../modules/Portals'
import { playerService } from '../../services/PlayerService'
import { createMapObject, type MapObjectEntity } from '../../entities/MapObject'
import { BuildingPlacementManager } from '../../modules/BuildingPlacement'
import { WorkAreaSelectionManager } from '../../modules/WorkAreaSelection'
import { ItemPlacementManager } from '../../modules/ItemPlacement'
import { FX } from '../../modules/FX'
import { RoadOverlay } from '../../modules/RoadOverlay'
import { RoadPlacementManager } from '../../modules/RoadPlacement'
import { TextDisplayService } from '../../services/TextDisplayService'
import { NPCProximityService } from '../../services/NPCProximityService'
import type { Settler, RoadTile } from '@rugged/game'
import { Vector3 } from '@babylonjs/core'
import { itemService } from '../../services/ItemService'
import { sceneManager } from '../../services/SceneManager'
import type { GameRuntime } from '../../runtime/GameRuntime'

export abstract class GameScene extends MapScene {
	public player: LocalPlayer | null = null
	protected remotePlayers: Map<string, RemotePlayer> = new Map()
	protected droppedItems: Map<string, Loot> = new Map()
	protected npcs: Map<string, NPCController> = new Map()
	protected settlers: Map<string, SettlerController> = new Map()
	protected mapObjects: Map<string, MapObjectEntity> = new Map()
	protected roadOverlay: RoadOverlay | null = null
	protected roadPlacementManager: RoadPlacementManager | null = null
	protected keyboard: Keyboard | null = null
	protected portalManager: PortalManager | null = null
	protected buildingPlacementManager: BuildingPlacementManager | null = null
	protected workAreaSelectionManager: WorkAreaSelectionManager | null = null
	protected itemPlacementManager: ItemPlacementManager | null = null
	protected fx: FX | null = null
	public textDisplayService: TextDisplayService | null = null
	protected npcProximityService: NPCProximityService
	protected sceneData: any = {}

	constructor(runtime: GameRuntime, config: { mapKey: string; mapPath: string }) {
		super(runtime, config.mapKey, config.mapPath)
		this.npcProximityService = new NPCProximityService()
	}

	start(data?: any): void {
		this.sceneData = data || {}
		super.start()
	}

	protected initializeScene(): void {
		super.initializeScene()
		if (!this.map) return

		this.keyboard = new Keyboard()
		this.textDisplayService = new TextDisplayService(this)
		this.npcProximityService.initialize()

		const playerX = this.sceneData?.x || 100
		const playerY = this.sceneData?.y || 300
		const isTransition = this.sceneData?.isTransition || false
		const suppressAutoJoin = this.sceneData?.suppressAutoJoin || false

		this.player = createLocalPlayer(this, playerX, playerY, playerService.playerId)
		this.player.view.updatePosition(playerX, playerY)

		this.setupMultiplayer()

		this.cameras.main.startFollow(this.player.view)

		this.portalManager = new PortalManager(this, this.player.view)
		this.portalManager.setPortalActivatedCallback((portalData) => {
			this.transitionToScene(portalData.target, portalData.targetX, portalData.targetY)
		})
		this.portalManager.processPortals(this.map)

		this.buildingPlacementManager = new BuildingPlacementManager(this)
		this.workAreaSelectionManager = new WorkAreaSelectionManager(this)
		this.roadPlacementManager = new RoadPlacementManager(this)
		this.itemPlacementManager = new ItemPlacementManager(this, this.player.controller)
		this.roadOverlay = new RoadOverlay(this, this.map.tileWidth)
		this.fx = new FX(this)

		EventBus.emit(UiEvents.Scene.Ready, { mapId: this.mapKey })

		if (!isTransition && !suppressAutoJoin) {
			EventBus.emit(Event.Players.CS.Join, {
				position: { x: playerX, y: playerY },
				mapId: this.mapKey,
				appearance: {}
			})
		}
	}

	update(deltaMs: number): void {
		super.update(deltaMs)
		if (!this.assetsLoaded) return

		this.updateCameraFromKeyboard(deltaMs)
		this.updateCameraRotationFromKeyboard()
		this.keyboard?.update()
		this.portalManager?.update()

		if (this.player) {
			this.player.controller.update(deltaMs)
		}

		this.remotePlayers.forEach((player) => {
			player.controller.update(deltaMs)
		})

		this.npcs.forEach((controller) => {
			controller.update(deltaMs)
		})

		this.settlers.forEach((settler) => {
			settler.update(deltaMs)
		})

		this.mapObjects.forEach((mapObject) => {
			mapObject.controller.update(deltaMs)
		})

		this.buildingPlacementManager?.update()
		this.workAreaSelectionManager?.update()
		this.roadPlacementManager?.update()
		this.itemPlacementManager?.update()
		this.roadOverlay?.update()

		this.physics.update(deltaMs)

		this.player?.view.syncFromBody()

		this.remotePlayers.forEach((player) => player.view.syncFromBody())
		this.npcs.forEach((controller) => controller.view.syncFromBody())
		this.settlers.forEach((settler) => settler.view.syncFromBody())
		this.mapObjects.forEach((mapObject) => mapObject.view.syncFromBody())
		this.droppedItems.forEach((item) => item.view.syncFromBody())

		this.textDisplayService?.update()

		if (this.player) {
			this.npcProximityService.update({ x: this.player.view.x, y: this.player.view.y }, this.npcs)
		}
	}

	private updateCameraFromKeyboard(deltaMs: number): void {
		if (!this.keyboard) return
		const speed = 900
		const verticalMultiplier = 1.25
		let moveX = 0
		let moveY = 0

		if (this.keyboard.isMovingLeft()) moveX -= 1
		if (this.keyboard.isMovingRight()) moveX += 1
		if (this.keyboard.isMovingUp()) moveY += 1
		if (this.keyboard.isMovingDown()) moveY -= 1

		if (moveX === 0 && moveY === 0) return

		const distance = (speed * deltaMs) / 1000
		const camera = this.runtime.renderer.camera
		const right = camera.getDirection(Vector3.Right())
		const up = camera.getDirection(Vector3.Up())
		const rightGround = new Vector3(right.x, 0, right.z)
		const upGround = new Vector3(up.x, 0, up.z)

		if (rightGround.lengthSquared() === 0 || upGround.lengthSquared() === 0) return
		rightGround.normalize()
		upGround.normalize()

		const inputLength = Math.hypot(moveX, moveY) || 1
		const weightedX = moveX / inputLength
		const weightedY = (moveY / inputLength) * verticalMultiplier
		const delta = rightGround.scale(weightedX).add(upGround.scale(weightedY))
		this.cameras.main.panBy(delta.x * distance, delta.z * distance)
	}

	private updateCameraRotationFromKeyboard(): void {
		if (!this.keyboard) return
		if (this.keyboard.isRotateLeft()) {
			this.cameras.main.rotateByDegrees(-90)
		} else if (this.keyboard.isRotateRight()) {
			this.cameras.main.rotateByDegrees(90)
		}
	}

	private setupMultiplayer() {
		EventBus.on(Event.Players.SC.Joined, this.handlePlayerJoined, this)
		EventBus.on(Event.Players.SC.Left, this.handlePlayerLeft, this)
		EventBus.on(Event.Players.SC.Move, this.handlePlayerMove, this)

		EventBus.on(Event.Loot.SC.Spawn, this.handleAddItems, this)
		EventBus.on(Event.Loot.SC.Despawn, this.handleRemoveItems, this)
		EventBus.on(Event.Loot.SC.Update, this.handleUpdateItems, this)
		EventBus.on(Event.NPC.SC.List, this.handleNPCList, this)
		EventBus.on(Event.NPC.SC.Spawn, this.handleNPCSpawn, this)
		EventBus.on(Event.NPC.SC.Despawn, this.handleNPCDespawn, this)

		EventBus.on(Event.MapObjects.SC.Spawn, this.handleMapObjectSpawn, this)
		EventBus.on(Event.MapObjects.SC.Despawn, this.handleMapObjectDespawn, this)

		EventBus.on(Event.Buildings.SC.Placed, this.handleBuildingPlaced, this)
		EventBus.on(Event.Buildings.SC.Progress, this.handleBuildingProgress, this)
		EventBus.on(Event.Buildings.SC.Completed, this.handleBuildingCompleted, this)
		EventBus.on(Event.Buildings.SC.Cancelled, this.handleBuildingCancelled, this)
		EventBus.on(Event.Storage.SC.Spoilage, this.handleStorageSpoilage, this)

		EventBus.on(Event.Population.SC.List, this.handlePopulationList, this)
		EventBus.on(Event.Population.SC.SettlerSpawned, this.handleSettlerSpawned, this)
		EventBus.on(Event.Population.SC.SettlerDied, this.handleSettlerDied, this)
		EventBus.on(UiEvents.Population.SettlerSpawned, this.handleUISettlerSpawned, this)
		EventBus.on(UiEvents.Population.SettlerDied, this.handleSettlerDied, this)
		EventBus.on(UiEvents.Population.ProfessionChanged, this.handleSettlerProfessionChanged, this)

		EventBus.on(Event.Roads.SC.Sync, this.handleRoadSync, this)
		EventBus.on(Event.Roads.SC.Updated, this.handleRoadUpdated, this)
		EventBus.on(Event.Roads.SC.PendingSync, this.handleRoadPendingSync, this)
		EventBus.on(Event.Roads.SC.PendingUpdated, this.handleRoadPendingUpdated, this)
	}

	private handlePlayerJoined = (data: { playerId: string; position: { x: number; y: number } }) => {
		const remotePlayer = createRemotePlayer(this, data.position.x, data.position.y, data.playerId)
		this.remotePlayers.set(data.playerId, remotePlayer)
	}

	private handlePlayerMove = (data: any) => {
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

	private handleAddItems = (data: { item: any }) => {
		if (!this.player) return

		const existingLoot = this.droppedItems.get(data.item.id)
		if (existingLoot) {
			existingLoot.view.setQuantity(data.item.quantity)
			return
		}

		const loot = createLoot(this, data.item, this.player.view)
		this.droppedItems.set(data.item.id, loot)
	}

	private handleRemoveItems = (data: { itemId: string }) => {
		const loot = this.droppedItems.get(data.itemId)
		if (loot) {
			loot.controller.destroy()
			this.droppedItems.delete(data.itemId)
		}
	}

	private handleUpdateItems = (data: { item: any }) => {
		const loot = this.droppedItems.get(data.item.id)
		if (loot) {
			loot.view.setQuantity(data.item.quantity)
		} else if (this.player) {
			const newLoot = createLoot(this, data.item, this.player.view)
			this.droppedItems.set(data.item.id, newLoot)
		}
	}

	private handleNPCSpawn = (data: { npc: any }) => {
		const npc = createNPC(this, data.npc.position.x, data.npc.position.y, data.npc)
		this.npcs.set(data.npc.id, npc)
	}

	private handleNPCDespawn = (data: { npc: any }) => {
		const npcController = this.npcs.get(data.npc.id)
		if (npcController) {
			npcController.destroy()
			this.npcs.delete(data.npc.id)
		}
	}

	private handleNPCList = (data: { npcs: any[] }) => {
		this.npcs.forEach((npc) => npc.destroy())
		this.npcs.clear()
		data.npcs.forEach((npcData) => {
			const npc = createNPC(this, npcData.position.x, npcData.position.y, npcData)
			this.npcs.set(npcData.id, npc)
		})
	}

	private handleMapObjectSpawn = (data: { object: any }) => {
		if (data.object.mapId === this.mapKey) {
			const existing = this.mapObjects.get(data.object.id)
			if (existing) {
				existing.controller.destroy()
				this.mapObjects.delete(data.object.id)
			}
			const mapObject = createMapObject(this, data.object)
			this.mapObjects.set(data.object.id, mapObject)
		}
	}

	private handleMapObjectDespawn = (data: { objectId: string }) => {
		const mapObject = this.mapObjects.get(data.objectId)
		if (mapObject) {
			mapObject.controller.destroy()
			this.mapObjects.delete(data.objectId)
		}
	}

	private handleBuildingPlaced = (_data: { building: any }) => {
		void _data
	}
	private handleBuildingProgress = (_data: { buildingInstanceId: string; progress: number; stage: string }) => {
		void _data
	}
	private handleBuildingCompleted = (_data: { building: any }) => {
		void _data
	}
	private handleBuildingCancelled = (_data: { buildingInstanceId: string; refundedItems: any[] }) => {
		void _data
	}

	private handlePopulationList = (data: { settlers: Settler[] }) => {
		this.settlers.forEach((settler) => settler.destroy())
		this.settlers.clear()

		data.settlers.forEach((settlerData) => {
			if (settlerData.mapId === this.mapKey) {
				const settler = createSettler(this, settlerData)
				this.settlers.set(settlerData.id, settler)
			}
		})
	}

	private handleSettlerSpawned = (data: { settler: Settler }) => {
		if (data.settler.mapId === this.mapKey) {
			const settler = createSettler(this, data.settler)
			this.settlers.set(data.settler.id, settler)
		}
	}

	private handleSettlerDied = (data: { settlerId: string }) => {
		const settler = this.settlers.get(data.settlerId)
		if (settler) {
			settler.destroy()
			this.settlers.delete(data.settlerId)
		}
	}

	private handleUISettlerSpawned = (settlerData: Settler) => {
		if (settlerData.mapId === this.mapKey && !this.settlers.has(settlerData.id)) {
			const settler = createSettler(this, settlerData)
			this.settlers.set(settlerData.id, settler)
		}
	}

	private handleSettlerProfessionChanged = (_data: { settlerId: string; oldProfession: any; newProfession: any }) => {
		void _data
	}

	private handleRoadSync = (data: { mapId: string; tiles: RoadTile[] }) => {
		if (!this.roadOverlay || data.mapId !== this.mapKey) return
		this.roadOverlay.setTiles(data.tiles)
	}

	private handleRoadUpdated = (data: { mapId: string; tiles: RoadTile[] }) => {
		if (!this.roadOverlay || data.mapId !== this.mapKey) return
		this.roadOverlay.applyUpdates(data.tiles)
	}

	private handleRoadPendingSync = (data: { mapId: string; tiles: RoadTile[] }) => {
		if (!this.roadOverlay || data.mapId !== this.mapKey) return
		this.roadOverlay.setPendingTiles(data.tiles)
	}

	private handleRoadPendingUpdated = (data: { mapId: string; tiles: RoadTile[] }) => {
		if (!this.roadOverlay || data.mapId !== this.mapKey) return
		this.roadOverlay.applyPendingUpdates(data.tiles)
	}

	protected transitionToScene(targetScene: string, targetX: number = 0, targetY: number = 0) {
		if (this.transitioning) return
		this.transitioning = true

		const mapped = sceneManager.getSceneKeyForTarget(targetScene) || targetScene
		EventBus.emit(Event.Map.CS.Transition, {
			toMapId: mapped,
			position: { x: targetX, y: targetY }
		})
	}

	protected cleanupScene(): void {
		this.keyboard?.destroy()
		this.keyboard = null

		this.fx?.destroy()
		this.fx = null

		this.textDisplayService?.destroy()
		this.textDisplayService = null

		this.player?.controller.destroy()
		this.player = null

		this.remotePlayers.forEach((player) => player.controller.destroy())
		this.remotePlayers.clear()

		this.droppedItems.forEach((item) => item.controller.destroy())
		this.droppedItems.clear()

		this.npcs.forEach((npc) => npc.destroy())
		this.npcs.clear()

		this.mapObjects.forEach((mapObject) => mapObject.controller.destroy())
		this.mapObjects.clear()

		this.portalManager?.cleanup()
		this.portalManager = null

		this.roadPlacementManager?.destroy()
		this.roadPlacementManager = null

		this.workAreaSelectionManager?.destroy()
		this.workAreaSelectionManager = null

		this.itemPlacementManager?.destroy()
		this.itemPlacementManager = null

		this.buildingPlacementManager?.destroy()
		this.buildingPlacementManager = null

		this.roadOverlay?.destroy()
		this.roadOverlay = null

		EventBus.off(Event.Players.SC.Joined, this.handlePlayerJoined)
		EventBus.off(Event.Players.SC.Left, this.handlePlayerLeft)
		EventBus.off(Event.Loot.SC.Spawn, this.handleAddItems)
		EventBus.off(Event.Loot.SC.Despawn, this.handleRemoveItems)
		EventBus.off(Event.Loot.SC.Update, this.handleUpdateItems)
		EventBus.off(Event.NPC.SC.List, this.handleNPCList)
		EventBus.off(Event.NPC.SC.Spawn, this.handleNPCSpawn)
		EventBus.off(Event.NPC.SC.Despawn, this.handleNPCDespawn)
		EventBus.off(Event.MapObjects.SC.Spawn, this.handleMapObjectSpawn)
		EventBus.off(Event.MapObjects.SC.Despawn, this.handleMapObjectDespawn)
		EventBus.off(Event.Storage.SC.Spoilage, this.handleStorageSpoilage)
		EventBus.off(Event.Roads.SC.Sync, this.handleRoadSync)
		EventBus.off(Event.Roads.SC.Updated, this.handleRoadUpdated)
		EventBus.off(Event.Roads.SC.PendingSync, this.handleRoadPendingSync)
		EventBus.off(Event.Roads.SC.PendingUpdated, this.handleRoadPendingUpdated)
	}

	destroy(): void {
		this.cleanupScene()
		this.npcProximityService.destroy()
		super.destroy()
	}

	private handleStorageSpoilage = (data: { buildingInstanceId: string; slotId: string; itemType: string; spoiledQuantity: number; position: { x: number; y: number } }) => {
		if (!this.textDisplayService) return
		const itemMeta = itemService.getItemType(data.itemType)
		const emoji = itemMeta?.emoji || ''
		const message = emoji ? `-${data.spoiledQuantity} ${emoji} spoiled` : `-${data.spoiledQuantity} spoiled`
		this.textDisplayService.displayMessage({
			message,
			worldPosition: data.position,
			fontSize: '16px',
			color: '#d35400',
			backgroundColor: 'transparent',
			duration: 2000
		})
	}
}
