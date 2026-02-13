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
import { ResourceNodeSelectionManager } from '../../modules/ResourceNodeSelectionManager'
import { MapPopoverManager } from '../../modules/MapPopoverManager'
import type { Settler, RoadTile, MapObject, BuildingDefinition, BuildingInstance } from '@rugged/game'
import type { AbstractMesh } from '@babylonjs/core'
import { Vector3 } from '@babylonjs/core'
import { itemService } from '../../services/ItemService'
import { buildingService } from '../../services/BuildingService'
import { sceneManager } from '../../services/SceneManager'
import type { GameRuntime } from '../../runtime/GameRuntime'
import type { PointerState } from '../../input/InputManager'
import { ResourceNodeBatcher } from '../../rendering/ResourceNodeBatcher'

const DEBUG_LOAD_TIMING = String(import.meta.env.VITE_DEBUG_LOAD_TIMING || '').toLowerCase() === 'true'

export abstract class GameScene extends MapScene {
	public player: LocalPlayer | null = null
	protected remotePlayers: Map<string, RemotePlayer> = new Map()
	protected droppedItems: Map<string, Loot> = new Map()
	protected npcs: Map<string, NPCController> = new Map()
	protected settlers: Map<string, SettlerController> = new Map()
	protected mapObjects: Map<string, MapObjectEntity> = new Map()
	protected roadOverlay: RoadOverlay | null = null
	protected roadPlacementManager: RoadPlacementManager | null = null
	protected resourceNodeSelectionManager: ResourceNodeSelectionManager | null = null
	protected mapPopoverManager: MapPopoverManager | null = null
	private marketReachBuildingId: string | null = null
	protected keyboard: Keyboard | null = null
	protected portalManager: PortalManager | null = null
	protected buildingPlacementManager: BuildingPlacementManager | null = null
	protected workAreaSelectionManager: WorkAreaSelectionManager | null = null
	protected itemPlacementManager: ItemPlacementManager | null = null
	protected fx: FX | null = null
	public textDisplayService: TextDisplayService | null = null
	protected npcProximityService: NPCProximityService
	protected sceneData: any = {}
	private cameraPanVelocity = { x: 0, y: 0 }
	private resourceNodeBatcher: ResourceNodeBatcher | null = null
	private resourceNodesDirty = false
	private lastResourceCullCenter: { x: number; y: number } | null = null
	private lastResourceCullSize: { width: number; height: number } | null = null
	private resourceNodeStreamTimer = 0
	private resourceNodeStreamIntervalMs = 250
	private resourceNodeChunkQueue: string[] = []
	private resourceNodeChunkRequests: Set<string> = new Set()
	private resourceNodeLoadedChunks: Set<string> = new Set()
	private resourceNodeDesiredChunks: Set<string> = new Set()
	private resourceNodeChunkNodes: Map<string, Set<string>> = new Map()
	private resourceNodeIdToChunk: Map<string, string> = new Map()
	private resourceNodeRequestId = 0
	private resourceNodeDebugQueryLogs = 0
	private resourceNodeDebugSyncLogs = 0
	private readonly resourceNodeChunkSize = 32
	private readonly resourceNodeChunkPadding = 1
	private readonly resourceNodeStreamingAdditive = true
	private readonly resourceNodeDisableCulling = false
	private readonly resourceNodeStreamIntervalMovingMs = 250
	private readonly resourceNodeStreamIntervalIdleMs = 550
	private pendingMapObjectIds: string[] = []
	private pendingMapObjects: Map<string, any> = new Map()
	private mapObjectSpawnCount = 0
	private mapObjectSpawnTimeMs = 0
	private mapObjectSpawnBatched = 0
	private mapObjectSpawnUnbatched = 0
	private mapObjectSpawnLastFlush = 0
	private readonly handleMapRightClick = (pointer: PointerState) => {
		if (pointer.wasDrag || pointer.button !== 2) {
			return
		}
		EventBus.emit(UiEvents.Construction.Cancel, {})
		EventBus.emit(UiEvents.Road.Cancel, {})
		EventBus.emit(UiEvents.Building.WorkAreaCancel, {})
		EventBus.emit(UiEvents.MapPopover.Close, { all: true })
	}

	constructor(runtime: GameRuntime, config: { mapKey: string; mapPath: string }) {
		super(runtime, config.mapKey, config.mapPath)
		this.npcProximityService = new NPCProximityService()
	}

	start(data?: any): void {
		this.sceneData = data || {}
		super.start()
	}

	public getMapObjects(): MapObjectEntity[] {
		return Array.from(this.mapObjects.values())
	}

	public hasRoadAt(tileX: number, tileY: number): boolean {
		return this.roadOverlay?.hasRoadAt(tileX, tileY) ?? false
	}

	public hasPendingRoadAt(tileX: number, tileY: number): boolean {
		return this.roadOverlay?.hasPendingRoadAt(tileX, tileY) ?? false
	}

	public getResourceNodeObjects(): MapObject[] {
		return this.resourceNodeBatcher?.getObjects() ?? []
	}

	public getResourceNodeFromPick(mesh: AbstractMesh, thinInstanceIndex?: number): MapObject | null {
		return this.resourceNodeBatcher?.getObjectForPick(mesh, thinInstanceIndex) ?? null
	}

	public getCameraMoveVector(): { x: number; y: number } | null {
		if (!this.keyboard) return null
		let x = 0
		let y = 0
		if (this.keyboard.isMovingLeft()) x -= 1
		if (this.keyboard.isMovingRight()) x += 1
		if (this.keyboard.isMovingUp()) y -= 1
		if (this.keyboard.isMovingDown()) y += 1
		if (x === 0 && y === 0) return null
		const length = Math.hypot(x, y)
		if (length === 0) return null
		return { x: x / length, y: y / length }
	}

	public getLootBounds(): { x: number; y: number; width: number; height: number }[] {
		return Array.from(this.droppedItems.values()).map((loot) => loot.view.getBounds())
	}

	protected initializeScene(): void {
		const perfStart = DEBUG_LOAD_TIMING ? performance.now() : 0
		let perfLast = perfStart
		const mark = (label: string) => {
			if (!DEBUG_LOAD_TIMING) return
			const now = performance.now()
			const delta = now - perfLast
			const total = now - perfStart
			perfLast = now
			console.info(`[Perf] scene-init ${label} +${delta.toFixed(1)}ms total=${total.toFixed(1)}ms`)
		}

		super.initializeScene()
		if (!this.map) return
		mark('map ready')

		this.keyboard = new Keyboard()
		this.textDisplayService = new TextDisplayService(this)
		this.npcProximityService.initialize()
		mark('input+text')

		const playerX = this.sceneData?.x || 100
		const playerY = this.sceneData?.y || 300
		const isTransition = this.sceneData?.isTransition || false
		const suppressAutoJoin = this.sceneData?.suppressAutoJoin || false

		this.player = createLocalPlayer(this, playerX, playerY, playerService.playerId)
		this.player.view.updatePosition(playerX, playerY)
		mark('player')

		this.setupMultiplayer()
		mark('multiplayer handlers')

		this.cameras.main.startFollow(this.player.view)
		mark('camera follow')

		this.portalManager = new PortalManager(this, this.player.view)
		this.portalManager.setPortalActivatedCallback((portalData) => {
			this.transitionToScene(portalData.target, portalData.targetX, portalData.targetY)
		})
		this.portalManager.processPortals(this.map)
		mark('portals')

		this.buildingPlacementManager = new BuildingPlacementManager(this)
		this.workAreaSelectionManager = new WorkAreaSelectionManager(this)
		this.roadPlacementManager = new RoadPlacementManager(this)
		this.itemPlacementManager = new ItemPlacementManager(this, this.player.controller)
		this.roadOverlay = new RoadOverlay(this, this.map.tileWidth)
		this.fx = new FX(this)
		this.resourceNodeBatcher = new ResourceNodeBatcher(this.runtime.renderer, this.map.tileWidth)
		this.resourceNodeBatcher.setPickableNodeTypes(['stone_deposit', 'resource_deposit'])
		this.mapPopoverManager = new MapPopoverManager(this)
		this.resourceNodeSelectionManager = new ResourceNodeSelectionManager(this)
		this.runtime.input.on('pointerup', this.handleMapRightClick)
		mark('placements+fx')

		EventBus.emit(UiEvents.Scene.Ready, { mapId: this.mapKey })
		mark('scene ready emit')

		const shouldAutoJoin = !isTransition && !suppressAutoJoin
		const workerDebug = String(import.meta.env.VITE_GAME_WORKER_DEBUG || '').toLowerCase() === 'true'
		if (workerDebug) {
			console.log('[GameScene] Auto-join check', { mapId: this.mapKey, isTransition, suppressAutoJoin, shouldAutoJoin })
		}
		if (shouldAutoJoin) {
			EventBus.emit(Event.Players.CS.Join, {
				position: { x: playerX, y: playerY },
				mapId: this.mapKey,
				appearance: {}
			})
			if (workerDebug) {
				console.log('[GameScene] Auto-join emitted', { mapId: this.mapKey })
			}
			mark('auto join emit')
		}
	}

	update(deltaMs: number): void {
		super.update(deltaMs)
		if (!this.assetsLoaded) return

		this.processPendingMapObjects()
		this.updateCameraFromKeyboard(deltaMs)
		this.updateCameraRotationFromKeyboard()
		this.updateCameraZoomFromKeyboard()
		this.updateCameraHomeFromKeyboard()
		this.keyboard?.update()
		this.portalManager?.update()
		this.updateResourceNodeStreaming(deltaMs)
		this.resourceNodeSelectionManager?.update()
		this.mapPopoverManager?.update()

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
		const speed = 1100
		const verticalMultiplier = 1.25
		const accelFactor = 0.3
		const decelFactor = 0.22
		let moveX = 0
		let moveY = 0

		if (this.keyboard.isMovingLeft()) moveX -= 1
		if (this.keyboard.isMovingRight()) moveX += 1
		if (this.keyboard.isMovingUp()) moveY += 1
		if (this.keyboard.isMovingDown()) moveY -= 1

		const camera = this.runtime.renderer.camera
		const right = camera.getDirection(Vector3.Right())
		const up = camera.getDirection(Vector3.Up())
		const rightGround = new Vector3(right.x, 0, right.z)
		const upGround = new Vector3(up.x, 0, up.z)

		if (rightGround.lengthSquared() === 0 || upGround.lengthSquared() === 0) return
		rightGround.normalize()
		upGround.normalize()

		const hasInput = moveX !== 0 || moveY !== 0
		const inputLength = Math.hypot(moveX, moveY) || 1
		const weightedX = moveX / inputLength
		const weightedY = (moveY / inputLength) * verticalMultiplier
		const delta = rightGround.scale(weightedX).add(upGround.scale(weightedY))
		const targetVelocityX = hasInput ? delta.x * speed : 0
		const targetVelocityY = hasInput ? delta.z * speed : 0
		const factor = hasInput ? accelFactor : decelFactor
		const smoothing = 1 - Math.pow(1 - factor, deltaMs / 16.67)

		this.cameraPanVelocity.x += (targetVelocityX - this.cameraPanVelocity.x) * smoothing
		this.cameraPanVelocity.y += (targetVelocityY - this.cameraPanVelocity.y) * smoothing

		if (!hasInput && Math.hypot(this.cameraPanVelocity.x, this.cameraPanVelocity.y) < 0.01) {
			this.cameraPanVelocity.x = 0
			this.cameraPanVelocity.y = 0
			return
		}

		const distance = deltaMs / 1000
		this.cameras.main.panBy(this.cameraPanVelocity.x * distance, this.cameraPanVelocity.y * distance)
	}

	private updateCameraRotationFromKeyboard(): void {
		if (!this.keyboard) return
		if (this.keyboard.isRotateLeft()) {
			this.cameras.main.rotateByDegrees(-90)
		} else if (this.keyboard.isRotateRight()) {
			this.cameras.main.rotateByDegrees(90)
		}
	}

	private updateCameraHomeFromKeyboard(): void {
		if (!this.keyboard) return
		if (this.keyboard.isCameraHome()) {
			this.cameras.main.recenterOnFollowTarget()
		}
	}

	private updateCameraZoomFromKeyboard(): void {
		if (!this.keyboard) return
		if (this.keyboard.isZoomOut()) {
			this.cameras.main.zoomOut()
		} else if (this.keyboard.isZoomIn()) {
			this.cameras.main.zoomIn()
		}
	}

	private handleCameraFocus = (data: { x: number; y: number; duration?: number; mapId?: string }) => {
		if (!data || typeof data.x !== 'number' || typeof data.y !== 'number') return
		if (data.mapId && data.mapId !== this.mapKey) return
		this.cameras.main.focusOn(data.x, data.y, data.duration ?? 800)
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
		EventBus.on(Event.ResourceNodes.SC.Sync, this.handleResourceNodesSync, this)

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

		EventBus.on(UiEvents.Building.Select, this.handleBuildingSelected, this)
		EventBus.on(UiEvents.Building.Close, this.handleBuildingClosed, this)
		EventBus.on(UiEvents.Building.Highlight, this.handleBuildingHighlight, this)
		EventBus.on(UiEvents.Camera.Focus, this.handleCameraFocus, this)
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
		if (data.object.mapId !== this.mapKey) return
		const obj = data.object
		if (obj?.metadata?.resourceNode) {
			const chunkKey = this.getResourceNodeChunkForObject(obj)
			const shouldRespectDesired = !this.resourceNodeStreamingAdditive && this.resourceNodeDesiredChunks.size > 0
			if (chunkKey && shouldRespectDesired && !this.resourceNodeDesiredChunks.has(chunkKey)) {
				return
			}
			if (chunkKey) {
				if (!this.resourceNodeIdToChunk.has(obj.id)) {
					this.trackResourceNodeChunk(obj.id, chunkKey)
				}
			}
		}
		const id = obj.id
		if (!this.pendingMapObjects.has(id)) {
			this.pendingMapObjectIds.push(id)
		}
		this.pendingMapObjects.set(id, obj)
	}

	private handleMapObjectDespawn = (data: { objectId: string }) => {
		if (this.pendingMapObjects.has(data.objectId)) {
			this.pendingMapObjects.delete(data.objectId)
		}
		const chunkKey = this.resourceNodeIdToChunk.get(data.objectId)
		if (chunkKey) {
			this.untrackResourceNodeChunk(data.objectId, chunkKey)
		}
		if (this.resourceNodeBatcher?.remove(data.objectId)) {
			this.resourceNodesDirty = true
		}
		const mapObject = this.mapObjects.get(data.objectId)
		if (mapObject) {
			mapObject.controller.destroy()
			this.mapObjects.delete(data.objectId)
		}
	}

	private updateResourceNodeStreaming(deltaMs: number): void {
		if (!this.resourceNodeBatcher || !this.map) return
		this.resourceNodeStreamTimer += deltaMs
		if (this.resourceNodeStreamTimer < this.resourceNodeStreamIntervalMs) return
		this.resourceNodeStreamTimer = 0
		const growthDirty = this.resourceNodeBatcher.updateGrowthStages(
			typeof performance !== 'undefined' ? performance.now() : Date.now()
		)
		if (growthDirty) {
			this.resourceNodesDirty = true
		}

		const tileSize = this.map.tileWidth || 32
		const worldBounds = this.getVisibleWorldBounds(tileSize * 10)
		if (!worldBounds) return
		let minX = worldBounds.minX
		let maxX = worldBounds.maxX
		let minY = worldBounds.minY
		let maxY = worldBounds.maxY
		const mapWidthPx = this.map.widthInPixels
		const mapHeightPx = this.map.heightInPixels
		if (Number.isFinite(mapWidthPx) && Number.isFinite(mapHeightPx) && mapWidthPx > 0 && mapHeightPx > 0) {
			minX = Math.max(0, Math.min(mapWidthPx, minX))
			maxX = Math.max(0, Math.min(mapWidthPx, maxX))
			minY = Math.max(0, Math.min(mapHeightPx, minY))
			maxY = Math.max(0, Math.min(mapHeightPx, maxY))
		}
		if (minX > maxX || minY > maxY) return

		const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }
		const viewSize = { width: maxX - minX, height: maxY - minY }
		const cadenceMovementThreshold = tileSize * 0.2
		const cadenceZoomThreshold = tileSize * 0.2
		const movementThreshold = tileSize * 0.75
		const zoomThreshold = tileSize * 0.5
		const lastCenter = this.lastResourceCullCenter
		const lastSize = this.lastResourceCullSize
		const hasMotion = lastCenter
			? Math.hypot(center.x - lastCenter.x, center.y - lastCenter.y) >= cadenceMovementThreshold
			: true
		const hasZoomMotion = lastSize
			? Math.abs(viewSize.width - lastSize.width) >= cadenceZoomThreshold ||
				Math.abs(viewSize.height - lastSize.height) >= cadenceZoomThreshold
			: true
		const hasPendingChunkWork = this.resourceNodeChunkQueue.length > 0 || this.resourceNodeChunkRequests.size > 0
		this.resourceNodeStreamIntervalMs =
			this.resourceNodesDirty || hasPendingChunkWork || hasMotion || hasZoomMotion
				? this.resourceNodeStreamIntervalMovingMs
				: this.resourceNodeStreamIntervalIdleMs
		const movedEnough = lastCenter
			? Math.hypot(center.x - lastCenter.x, center.y - lastCenter.y) >= movementThreshold
			: true
		const zoomChangedEnough = lastSize
			? Math.abs(viewSize.width - lastSize.width) >= zoomThreshold ||
				Math.abs(viewSize.height - lastSize.height) >= zoomThreshold
			: true
		const shouldRefreshView = this.resourceNodesDirty || movedEnough || zoomChangedEnough

		if (!shouldRefreshView) {
			this.flushResourceNodeChunkQueries(this.resourceNodeDesiredChunks)
			return
		}

		this.lastResourceCullCenter = center
		this.lastResourceCullSize = viewSize

		const minTileX = Math.floor(minX / tileSize)
		const maxTileX = Math.ceil(maxX / tileSize)
		const minTileY = Math.floor(minY / tileSize)
		const maxTileY = Math.ceil(maxY / tileSize)

		const chunkSize = this.resourceNodeChunkSize
		const minChunkX = Math.floor(minTileX / chunkSize) - this.resourceNodeChunkPadding
		const maxChunkX = Math.floor(maxTileX / chunkSize) + this.resourceNodeChunkPadding
		const minChunkY = Math.floor(minTileY / chunkSize) - this.resourceNodeChunkPadding
		const maxChunkY = Math.floor(maxTileY / chunkSize) + this.resourceNodeChunkPadding

		if (this.resourceNodeDisableCulling) {
			this.resourceNodeBatcher.updateAll()
		} else {
			const visibleBounds = {
				minX: minChunkX * chunkSize * tileSize,
				minY: minChunkY * chunkSize * tileSize,
				maxX: (maxChunkX + 1) * chunkSize * tileSize,
				maxY: (maxChunkY + 1) * chunkSize * tileSize
			}
			this.resourceNodeBatcher.updateVisible(visibleBounds)
		}
		this.resourceNodesDirty = false

		const desired = new Set<string>()
		for (let cx = minChunkX; cx <= maxChunkX; cx += 1) {
			for (let cy = minChunkY; cy <= maxChunkY; cy += 1) {
				desired.add(`${cx},${cy}`)
			}
		}

		this.resourceNodeDesiredChunks = desired

		if (!this.resourceNodeStreamingAdditive) {
			for (const key of this.resourceNodeLoadedChunks) {
				if (!desired.has(key)) {
					this.unloadResourceNodeChunk(key)
				}
			}
		}

		for (const key of Array.from(this.resourceNodeChunkRequests)) {
			if (!desired.has(key)) {
				this.resourceNodeChunkRequests.delete(key)
			}
		}

		if (this.resourceNodeChunkQueue.length > 0) {
			this.resourceNodeChunkQueue = this.resourceNodeChunkQueue.filter((key) => desired.has(key))
		}

		for (const key of desired) {
			if (this.resourceNodeLoadedChunks.has(key)) continue
			if (this.resourceNodeChunkRequests.has(key)) continue
			this.resourceNodeChunkRequests.add(key)
			this.resourceNodeChunkQueue.push(key)
		}

		this.flushResourceNodeChunkQueries(desired)
	}

	private flushResourceNodeChunkQueries(desired: Set<string>): void {
		let sent = 0
		const maxPerTick = 4
		while (sent < maxPerTick && this.resourceNodeChunkQueue.length > 0) {
			const key = this.resourceNodeChunkQueue.shift()
			if (!key) break
			if (!desired.has(key)) {
				this.resourceNodeChunkRequests.delete(key)
				continue
			}
			const bounds = this.getResourceNodeChunkBounds(key)
			if (!bounds) {
				this.resourceNodeChunkRequests.delete(key)
				continue
			}
			this.resourceNodeRequestId += 1
			if (this.resourceNodeDebugQueryLogs < 5) {
				console.info('[ResourceNodes] query', {
					mapId: this.mapKey,
					chunkKey: key,
					bounds,
					requestId: this.resourceNodeRequestId
				})
				this.resourceNodeDebugQueryLogs += 1
			}
			EventBus.emit(Event.ResourceNodes.CS.Query, {
				mapId: this.mapKey,
				bounds,
				chunkKey: key,
				requestId: this.resourceNodeRequestId
			})
			sent += 1
		}
	}

	private processPendingMapObjects(): void {
		if (this.pendingMapObjectIds.length === 0) return
		const start = performance.now()
		const maxDurationMs = 6
		const maxPerFrame = 200
		let processed = 0

		while (this.pendingMapObjectIds.length > 0) {
			if (processed >= maxPerFrame) break
			if (performance.now() - start > maxDurationMs) break
			const id = this.pendingMapObjectIds.shift()
			if (!id) break
			const obj = this.pendingMapObjects.get(id)
			if (!obj) continue
			this.pendingMapObjects.delete(id)

			const perfStart = DEBUG_LOAD_TIMING ? performance.now() : 0
			if (obj.mapId === this.mapKey) {
				if (this.resourceNodeBatcher?.add(obj)) {
					this.resourceNodesDirty = true
					if (DEBUG_LOAD_TIMING) {
						this.mapObjectSpawnBatched += 1
					}
				} else {
					if (DEBUG_LOAD_TIMING) {
						this.mapObjectSpawnUnbatched += 1
					}
					const existing = this.mapObjects.get(obj.id)
					if (existing) {
						existing.controller.destroy()
						this.mapObjects.delete(obj.id)
					}
					const mapObject = createMapObject(this, obj)
					this.mapObjects.set(obj.id, mapObject)
				}
			}
			if (DEBUG_LOAD_TIMING) {
				this.mapObjectSpawnCount += 1
				this.mapObjectSpawnTimeMs += performance.now() - perfStart
				this.flushMapObjectSpawnStats()
			}
			processed += 1
		}

		if (DEBUG_LOAD_TIMING && processed > 0 && this.pendingMapObjectIds.length > 0) {
			console.info(`[Perf] map-objects pending=${this.pendingMapObjectIds.length}`)
		}
	}

	private handleResourceNodesSync = (data: { mapId: string; nodes: any[]; chunkKey?: string }) => {
		if (data.mapId !== this.mapKey) return
		const shouldRespectDesired = !this.resourceNodeStreamingAdditive && this.resourceNodeDesiredChunks.size > 0
		if (this.resourceNodeDebugSyncLogs < 5) {
			const counts: Record<string, number> = {}
			for (const node of data.nodes || []) {
				const type = node?.metadata?.resourceNodeType || 'unknown'
				counts[type] = (counts[type] || 0) + 1
			}
			console.info('[ResourceNodes] sync', {
				mapId: data.mapId,
				chunkKey: data.chunkKey,
				count: data.nodes?.length ?? 0,
				byType: counts
			})
			this.resourceNodeDebugSyncLogs += 1
		}
		const chunkKey = data.chunkKey
		if (chunkKey && shouldRespectDesired && !this.resourceNodeDesiredChunks.has(chunkKey)) {
			this.resourceNodeChunkRequests.delete(chunkKey)
			return
		}
		if (chunkKey) {
			this.resourceNodeLoadedChunks.add(chunkKey)
			this.resourceNodeChunkRequests.delete(chunkKey)
		}

		let added = 0
		data.nodes?.forEach((obj) => {
			const key = chunkKey ?? this.getResourceNodeChunkForObject(obj)
			if (key && shouldRespectDesired && !this.resourceNodeDesiredChunks.has(key)) {
				return
			}
			if (key && this.resourceNodeIdToChunk.has(obj.id)) {
				return
			}
			if (key) {
				this.trackResourceNodeChunk(obj.id, key)
			}
			if (!this.pendingMapObjects.has(obj.id)) {
				this.pendingMapObjectIds.push(obj.id)
			}
			this.pendingMapObjects.set(obj.id, obj)
			added += 1
		})
		if (added > 0) {
			this.resourceNodesDirty = true
		}
	}

	private getResourceNodeChunkForObject(obj: { position: { x: number; y: number } } | null): string | null {
		if (!obj || !this.map) return null
		const tileSize = this.map.tileWidth || 32
		const tileX = Math.floor(obj.position.x / tileSize)
		const tileY = Math.floor(obj.position.y / tileSize)
		return this.getResourceNodeChunkKey(tileX, tileY)
	}

	private getResourceNodeChunkKey(tileX: number, tileY: number): string {
		const chunkX = Math.floor(tileX / this.resourceNodeChunkSize)
		const chunkY = Math.floor(tileY / this.resourceNodeChunkSize)
		return `${chunkX},${chunkY}`
	}

	private getResourceNodeChunkBounds(chunkKey: string): { minX: number; minY: number; maxX: number; maxY: number } | null {
		const [rawX, rawY] = chunkKey.split(',')
		const chunkX = Number(rawX)
		const chunkY = Number(rawY)
		if (!Number.isFinite(chunkX) || !Number.isFinite(chunkY)) return null
		const minX = chunkX * this.resourceNodeChunkSize
		const minY = chunkY * this.resourceNodeChunkSize
		return {
			minX,
			minY,
			maxX: minX + this.resourceNodeChunkSize - 1,
			maxY: minY + this.resourceNodeChunkSize - 1
		}
	}

	private trackResourceNodeChunk(objectId: string, chunkKey: string): void {
		if (this.resourceNodeIdToChunk.has(objectId)) return
		this.resourceNodeIdToChunk.set(objectId, chunkKey)
		let set = this.resourceNodeChunkNodes.get(chunkKey)
		if (!set) {
			set = new Set()
			this.resourceNodeChunkNodes.set(chunkKey, set)
		}
		set.add(objectId)
	}

	private untrackResourceNodeChunk(objectId: string, chunkKey: string): void {
		this.resourceNodeIdToChunk.delete(objectId)
		const set = this.resourceNodeChunkNodes.get(chunkKey)
		if (!set) return
		set.delete(objectId)
		if (set.size === 0 && !this.resourceNodeLoadedChunks.has(chunkKey)) {
			this.resourceNodeChunkNodes.delete(chunkKey)
		}
	}

	private unloadResourceNodeChunk(chunkKey: string): void {
		const ids = this.resourceNodeChunkNodes.get(chunkKey)
		if (ids) {
			ids.forEach((id) => {
				this.resourceNodeIdToChunk.delete(id)
				this.pendingMapObjects.delete(id)
				this.resourceNodeBatcher?.remove(id)
				const mapObject = this.mapObjects.get(id)
				if (mapObject) {
					mapObject.controller.destroy()
					this.mapObjects.delete(id)
				}
			})
		}
		this.resourceNodeChunkNodes.delete(chunkKey)
		this.resourceNodeLoadedChunks.delete(chunkKey)
		this.resourceNodeChunkRequests.delete(chunkKey)
		this.resourceNodesDirty = true
	}

	private getVisibleWorldBounds(padding: number): { minX: number; minY: number; maxX: number; maxY: number } | null {
		const renderer = this.runtime.renderer
		const width = renderer.engine.getRenderWidth()
		const height = renderer.engine.getRenderHeight()
		if (width <= 0 || height <= 0) return null

		const corners = [
			renderer.screenToWorld(0, 0, { useGroundPick: false }),
			renderer.screenToWorld(width, 0, { useGroundPick: false }),
			renderer.screenToWorld(width, height, { useGroundPick: false }),
			renderer.screenToWorld(0, height, { useGroundPick: false })
		].filter(Boolean) as Vector3[]

		if (corners.length === 0) return null
		let minX = corners[0].x
		let maxX = corners[0].x
		let minY = corners[0].z
		let maxY = corners[0].z
		for (let i = 1; i < corners.length; i += 1) {
			const point = corners[i]
			minX = Math.min(minX, point.x)
			maxX = Math.max(maxX, point.x)
			minY = Math.min(minY, point.z)
			maxY = Math.max(maxY, point.z)
		}

		return {
			minX: minX - padding,
			maxX: maxX + padding,
			minY: minY - padding,
			maxY: maxY + padding
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
		if (data.settler.mapId !== this.mapKey) {
			return
		}
		const existing = this.settlers.get(data.settler.id)
		if (existing) {
			existing.updateSettler(data.settler)
			return
		}
		const settler = createSettler(this, data.settler)
		this.settlers.set(data.settler.id, settler)
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
		const perfStart = DEBUG_LOAD_TIMING ? performance.now() : 0
		this.roadOverlay.setTiles(data.tiles)
		if (this.marketReachBuildingId) {
			this.updateMarketReachOverlay()
		}
		if (DEBUG_LOAD_TIMING) {
			const elapsed = performance.now() - perfStart
			console.info(
				`[Perf] roads sync tiles=${data.tiles.length} time=${elapsed.toFixed(1)}ms map=${data.mapId}`
			)
		}
	}

	private handleRoadUpdated = (data: { mapId: string; tiles: RoadTile[] }) => {
		if (!this.roadOverlay || data.mapId !== this.mapKey) return
		const perfStart = DEBUG_LOAD_TIMING ? performance.now() : 0
		this.roadOverlay.applyUpdates(data.tiles)
		if (this.marketReachBuildingId) {
			this.updateMarketReachOverlay()
		}
		if (DEBUG_LOAD_TIMING) {
			const elapsed = performance.now() - perfStart
			console.info(
				`[Perf] roads updated tiles=${data.tiles.length} time=${elapsed.toFixed(1)}ms map=${data.mapId}`
			)
		}
	}

	private handleRoadPendingSync = (data: { mapId: string; tiles: RoadTile[] }) => {
		if (!this.roadOverlay || data.mapId !== this.mapKey) return
		const perfStart = DEBUG_LOAD_TIMING ? performance.now() : 0
		this.roadOverlay.setPendingTiles(data.tiles)
		if (DEBUG_LOAD_TIMING) {
			const elapsed = performance.now() - perfStart
			console.info(
				`[Perf] roads pending sync tiles=${data.tiles.length} time=${elapsed.toFixed(1)}ms map=${data.mapId}`
			)
		}
	}

	private handleRoadPendingUpdated = (data: { mapId: string; tiles: RoadTile[] }) => {
		if (!this.roadOverlay || data.mapId !== this.mapKey) return
		const perfStart = DEBUG_LOAD_TIMING ? performance.now() : 0
		this.roadOverlay.applyPendingUpdates(data.tiles)
		if (DEBUG_LOAD_TIMING) {
			const elapsed = performance.now() - perfStart
			console.info(
				`[Perf] roads pending updated tiles=${data.tiles.length} time=${elapsed.toFixed(1)}ms map=${data.mapId}`
			)
		}
	}

	private handleBuildingSelected = (data: { buildingInstance: BuildingInstance; buildingDefinition: BuildingDefinition }) => {
		if (!data?.buildingInstance || !data?.buildingDefinition) {
			this.clearMarketReachOverlay()
			return
		}
		const definition = data.buildingDefinition
		if (!definition.marketDistribution) {
			this.clearMarketReachOverlay()
			return
		}
		this.marketReachBuildingId = data.buildingInstance.id
		this.updateMarketReachOverlay()
	}

	private handleBuildingClosed = () => {
		this.clearMarketReachOverlay()
	}

	private handleBuildingHighlight = (data: { buildingInstanceId: string; highlighted: boolean }) => {
		if (!data?.highlighted && this.marketReachBuildingId === data.buildingInstanceId) {
			this.clearMarketReachOverlay()
		}
	}

	private clearMarketReachOverlay(): void {
		this.marketReachBuildingId = null
		this.roadOverlay?.clearHighlightTiles()
	}

	private updateMarketReachOverlay(): void {
		if (!this.roadOverlay || !this.marketReachBuildingId || !this.map) {
			return
		}
		const instance = buildingService.getBuildingInstance(this.marketReachBuildingId)
		if (!instance || instance.mapId !== this.mapKey) {
			this.clearMarketReachOverlay()
			return
		}
		const definition = buildingService.getBuildingDefinition(instance.buildingId)
		if (!definition?.marketDistribution) {
			this.clearMarketReachOverlay()
			return
		}

		const tileSize = this.map.tileWidth || 32
		const marketTile = {
			x: Math.floor(instance.position.x / tileSize),
			y: Math.floor(instance.position.y / tileSize)
		}
		const roadTiles = this.roadOverlay.getRoadTiles()
		if (roadTiles.length === 0) {
			this.roadOverlay.clearHighlightTiles()
			return
		}

		const mapWidthTiles = Math.floor(this.map.widthInPixels / tileSize)
		const mapHeightTiles = Math.floor(this.map.heightInPixels / tileSize)
		const roadSet = new Set<string>()
		for (const tile of roadTiles) {
			roadSet.add(this.roadKey(tile.x, tile.y))
		}

		const roadSearchRadius = Math.max(0, definition.marketDistribution.roadSearchRadiusTiles ?? 8)
		const maxDistanceTiles = Math.max(1, definition.marketDistribution.maxDistanceTiles ?? 25)
		const startRoad = this.findClosestRoadTile(roadSet, marketTile, roadSearchRadius, mapWidthTiles, mapHeightTiles)
		if (!startRoad) {
			this.roadOverlay.clearHighlightTiles()
			return
		}

		const reachable = this.buildRoadReach(roadSet, startRoad, maxDistanceTiles, mapWidthTiles, mapHeightTiles)
		this.roadOverlay.setHighlightTiles(reachable, '#6fbf6a', 0.45)
	}

	private buildRoadReach(
		roadSet: Set<string>,
		start: { x: number; y: number },
		maxSteps: number,
		width: number,
		height: number
	): Array<{ x: number; y: number }> {
		const queue: Array<{ x: number; y: number }> = [start]
		let head = 0
		const distanceByKey = new Map<string, number>([[this.roadKey(start.x, start.y), 0]])
		const reachable: Array<{ x: number; y: number }> = [start]

		while (head < queue.length) {
			const current = queue[head]
			head += 1
			const currentKey = this.roadKey(current.x, current.y)
			const currentDistance = distanceByKey.get(currentKey) ?? 0
			if (currentDistance >= maxSteps) {
				continue
			}
			const neighbors = [
				{ x: current.x, y: current.y - 1 },
				{ x: current.x + 1, y: current.y },
				{ x: current.x, y: current.y + 1 },
				{ x: current.x - 1, y: current.y }
			]
			for (const neighbor of neighbors) {
				if (!this.isRoadTile(roadSet, neighbor, width, height)) {
					continue
				}
				const neighborKey = this.roadKey(neighbor.x, neighbor.y)
				if (distanceByKey.has(neighborKey)) {
					continue
				}
				distanceByKey.set(neighborKey, currentDistance + 1)
				queue.push(neighbor)
				reachable.push(neighbor)
			}
		}

		return reachable
	}

	private findClosestRoadTile(
		roadSet: Set<string>,
		origin: { x: number; y: number },
		maxRadius: number,
		width: number,
		height: number
	): { x: number; y: number } | null {
		if (this.isRoadTile(roadSet, origin, width, height)) {
			return origin
		}
		for (let radius = 1; radius <= maxRadius; radius += 1) {
			for (let dx = -radius; dx <= radius; dx += 1) {
				const dy = radius - Math.abs(dx)
				const candidates = [
					{ x: origin.x + dx, y: origin.y + dy },
					{ x: origin.x + dx, y: origin.y - dy }
				]
				for (const candidate of candidates) {
					if (this.isRoadTile(roadSet, candidate, width, height)) {
						return candidate
					}
				}
			}
		}
		return null
	}

	private isRoadTile(
		roadSet: Set<string>,
		tile: { x: number; y: number },
		width: number,
		height: number
	): boolean {
		if (tile.x < 0 || tile.y < 0 || tile.x >= width || tile.y >= height) {
			return false
		}
		return roadSet.has(this.roadKey(tile.x, tile.y))
	}

	private roadKey(x: number, y: number): string {
		return `${x},${y}`
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
		this.runtime.input.off('pointerup', this.handleMapRightClick)

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

		this.resourceNodeSelectionManager?.destroy()
		this.resourceNodeSelectionManager = null
		this.mapPopoverManager?.destroy()
		this.mapPopoverManager = null
		EventBus.emit(UiEvents.MapPopover.Close, { all: true })

		this.resourceNodeBatcher?.dispose()
		this.resourceNodeBatcher = null
		this.resourceNodesDirty = false
		this.lastResourceCullCenter = null
		this.lastResourceCullSize = null
		this.resourceNodeStreamTimer = 0
		this.resourceNodeStreamIntervalMs = this.resourceNodeStreamIntervalMovingMs
		this.resourceNodeChunkQueue = []
		this.resourceNodeChunkRequests.clear()
		this.resourceNodeLoadedChunks.clear()
		this.resourceNodeDesiredChunks.clear()
		this.resourceNodeChunkNodes.clear()
		this.resourceNodeIdToChunk.clear()
		this.resourceNodeRequestId = 0
		this.pendingMapObjectIds = []
		this.pendingMapObjects.clear()
		this.flushMapObjectSpawnStats(true)

		EventBus.off(Event.Players.SC.Joined, this.handlePlayerJoined)
		EventBus.off(Event.Players.SC.Left, this.handlePlayerLeft)
		EventBus.off(Event.Players.SC.Move, this.handlePlayerMove)
		EventBus.off(Event.Loot.SC.Spawn, this.handleAddItems)
		EventBus.off(Event.Loot.SC.Despawn, this.handleRemoveItems)
		EventBus.off(Event.Loot.SC.Update, this.handleUpdateItems)
		EventBus.off(Event.NPC.SC.List, this.handleNPCList)
		EventBus.off(Event.NPC.SC.Spawn, this.handleNPCSpawn)
		EventBus.off(Event.NPC.SC.Despawn, this.handleNPCDespawn)
		EventBus.off(Event.MapObjects.SC.Spawn, this.handleMapObjectSpawn)
		EventBus.off(Event.MapObjects.SC.Despawn, this.handleMapObjectDespawn)
		EventBus.off(Event.ResourceNodes.SC.Sync, this.handleResourceNodesSync)
		EventBus.off(Event.Buildings.SC.Placed, this.handleBuildingPlaced)
		EventBus.off(Event.Buildings.SC.Progress, this.handleBuildingProgress)
		EventBus.off(Event.Buildings.SC.Completed, this.handleBuildingCompleted)
		EventBus.off(Event.Buildings.SC.Cancelled, this.handleBuildingCancelled)
		EventBus.off(Event.Storage.SC.Spoilage, this.handleStorageSpoilage)
		EventBus.off(Event.Population.SC.List, this.handlePopulationList)
		EventBus.off(Event.Population.SC.SettlerSpawned, this.handleSettlerSpawned)
		EventBus.off(Event.Population.SC.SettlerDied, this.handleSettlerDied)
		EventBus.off(UiEvents.Population.SettlerSpawned, this.handleUISettlerSpawned)
		EventBus.off(UiEvents.Population.SettlerDied, this.handleSettlerDied)
		EventBus.off(UiEvents.Population.ProfessionChanged, this.handleSettlerProfessionChanged)
		EventBus.off(Event.Roads.SC.Sync, this.handleRoadSync)
		EventBus.off(Event.Roads.SC.Updated, this.handleRoadUpdated)
		EventBus.off(Event.Roads.SC.PendingSync, this.handleRoadPendingSync)
		EventBus.off(Event.Roads.SC.PendingUpdated, this.handleRoadPendingUpdated)
		EventBus.off(UiEvents.Building.Select, this.handleBuildingSelected)
		EventBus.off(UiEvents.Building.Close, this.handleBuildingClosed)
		EventBus.off(UiEvents.Building.Highlight, this.handleBuildingHighlight)
		EventBus.off(UiEvents.Camera.Focus, this.handleCameraFocus)
	}

	private flushMapObjectSpawnStats(force: boolean = false): void {
		if (!DEBUG_LOAD_TIMING) return
		const now = performance.now()
		if (!force && this.mapObjectSpawnLastFlush > 0 && now - this.mapObjectSpawnLastFlush < 1000) {
			return
		}
		if (this.mapObjectSpawnCount === 0) return
		const avg = this.mapObjectSpawnTimeMs / Math.max(1, this.mapObjectSpawnCount)
		console.info(
			`[Perf] map-objects spawn count=${this.mapObjectSpawnCount} time=${this.mapObjectSpawnTimeMs.toFixed(
				1
			)}ms avg=${avg.toFixed(2)}ms batched=${this.mapObjectSpawnBatched} unbatched=${this.mapObjectSpawnUnbatched}`
		)
		this.mapObjectSpawnCount = 0
		this.mapObjectSpawnTimeMs = 0
		this.mapObjectSpawnBatched = 0
		this.mapObjectSpawnUnbatched = 0
		this.mapObjectSpawnLastFlush = now
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
