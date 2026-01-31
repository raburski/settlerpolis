import { BaseManager } from '../Managers'
import type { EventManager, EventClient } from '../events'
import { Receiver } from '../Receiver'
import { Event } from '../events'
import type { Logger } from '../Logs'
import type { MapManager } from '../Map'
import type { StorageManager } from '../Storage'
import { RoadEvents } from './events'
import { ROAD_SPEED_MULTIPLIERS, RoadType, type RoadBuildRequestData, type RoadData, type RoadTile, type RoadTilesSyncData, type RoadTilesUpdatedData, type RoadPendingSyncData, type RoadPendingUpdatedData, type RoadJobData } from './types'
import { v4 as uuidv4 } from 'uuid'

export interface RoadManagerDeps {
	map: MapManager
	storage: StorageManager
}

interface RoadJob {
	jobId: string
	mapName: string
	playerId: string
	tileX: number
	tileY: number
	roadType: RoadType
	createdAt: number
	assignedSettlerId?: string
}

const ROAD_BUILD_DURATION_MS = 1200
const ROAD_UPGRADE_DURATION_MS = 1800
const ROAD_UPGRADE_STONE_COST = 1

export class RoadManager extends BaseManager<RoadManagerDeps> {
	private roadsByMap = new Map<string, RoadData>()
	private jobsByMap = new Map<string, RoadJob[]>()

	constructor(
		managers: RoadManagerDeps,
		private event: EventManager,
		private logger: Logger
	) {
		super(managers)
		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		this.event.on<RoadBuildRequestData>(RoadEvents.CS.Place, (data, client) => {
			this.handleRoadRequest(data, client)
		})

	this.event.on(Event.Players.CS.Join, (data: { mapId?: string }, client: EventClient) => {
		const mapId = data.mapId || client.currentGroup
		this.sendRoadSync(mapId)
		this.sendPendingRoadSync(mapId)
	})

	this.event.on(Event.Players.CS.TransitionTo, (data: { mapId?: string }, client: EventClient) => {
		const mapId = data.mapId || client.currentGroup
		this.sendRoadSync(mapId)
		this.sendPendingRoadSync(mapId)
	})
}

	public getRoadData(mapName: string): RoadData | null {
		return this.ensureRoadData(mapName)
	}

	public getRoadTypeAtTile(mapName: string, tileX: number, tileY: number): RoadType {
		const roadData = this.ensureRoadData(mapName)
		if (!roadData) {
			return RoadType.None
		}

		const index = tileY * roadData.width + tileX
		if (index < 0 || index >= roadData.data.length) {
			return RoadType.None
		}

		return roadData.data[index] ?? RoadType.None
	}

	public isRoadPlannedOrBuilt(mapName: string, tileX: number, tileY: number): boolean {
		if (this.getRoadTypeAtTile(mapName, tileX, tileY) !== RoadType.None) {
			return true
		}
		const jobs = this.jobsByMap.get(mapName)
		if (!jobs || jobs.length === 0) {
			return false
		}
		return jobs.some(job => job.tileX === tileX && job.tileY === tileY)
	}

	public getSpeedMultiplier(mapName: string, position: { x: number, y: number }): number {
		const roadData = this.ensureRoadData(mapName)
		if (!roadData) {
			return 1
		}

		const tileSize = this.getTileSize(mapName)
		const tileX = Math.floor(position.x / tileSize)
		const tileY = Math.floor(position.y / tileSize)
		const roadType = this.getRoadTypeAtTile(mapName, tileX, tileY)
		return ROAD_SPEED_MULTIPLIERS[roadType] || 1
	}

	public getSpeedMultiplierForSegment(
		mapName: string,
		fromPosition: { x: number, y: number },
		toPosition: { x: number, y: number }
	): number {
		const roadData = this.ensureRoadData(mapName)
		if (!roadData) {
			return 1
		}

		const tileSize = this.getTileSize(mapName)
		const fromTileX = Math.floor(fromPosition.x / tileSize)
		const fromTileY = Math.floor(fromPosition.y / tileSize)
		const toTileX = Math.floor(toPosition.x / tileSize)
		const toTileY = Math.floor(toPosition.y / tileSize)

		const fromType = this.getRoadTypeAtTile(mapName, fromTileX, fromTileY)
		const toType = this.getRoadTypeAtTile(mapName, toTileX, toTileY)
		if (fromType === RoadType.None || toType === RoadType.None) {
			return 1
		}

		const fromMultiplier = ROAD_SPEED_MULTIPLIERS[fromType] || 1
		const toMultiplier = ROAD_SPEED_MULTIPLIERS[toType] || 1
		return Math.min(fromMultiplier, toMultiplier)
	}

	public getPendingJobGroups(): Array<{ mapName: string, playerId: string, count: number }> {
		const groups = new Map<string, { mapName: string, playerId: string, count: number }>()
		for (const jobs of this.jobsByMap.values()) {
			for (const job of jobs) {
				if (job.assignedSettlerId) {
					continue
				}
				const key = `${job.mapName}:${job.playerId}`
				const entry = groups.get(key)
				if (entry) {
					entry.count += 1
				} else {
					groups.set(key, { mapName: job.mapName, playerId: job.playerId, count: 1 })
				}
			}
		}
		return Array.from(groups.values())
	}

	public getJobForSettler(settlerId: string): RoadJobData | null {
		for (const jobs of this.jobsByMap.values()) {
			const job = jobs.find(candidate => candidate.assignedSettlerId === settlerId)
			if (job) {
				return this.toJobData(job)
			}
		}
		return null
	}

	public claimJob(mapName: string, playerId: string, settlerId: string): RoadJobData | null {
		const jobs = this.jobsByMap.get(mapName)
		if (!jobs || jobs.length === 0) {
			return null
		}

		const job = jobs.find(candidate => !candidate.assignedSettlerId && candidate.playerId === playerId)
		if (!job) {
			return null
		}

		job.assignedSettlerId = settlerId
		return this.toJobData(job)
	}

	public completeJob(jobId: string): void {
		for (const [mapName, jobs] of this.jobsByMap.entries()) {
			const index = jobs.findIndex(job => job.jobId === jobId)
			if (index < 0) {
				continue
			}

			const job = jobs[index]
			this.setRoadTile(mapName, job.tileX, job.tileY, job.roadType)
			this.emitPendingRemoval(mapName, job.tileX, job.tileY)
			jobs.splice(index, 1)
			if (jobs.length === 0) {
				this.jobsByMap.delete(mapName)
			}
			return
		}
	}

	public releaseJob(jobId: string): void {
		for (const jobs of this.jobsByMap.values()) {
			const job = jobs.find(candidate => candidate.jobId === jobId)
			if (job) {
				job.assignedSettlerId = undefined
				return
			}
		}
	}

	private handleRoadRequest(data: RoadBuildRequestData, client: EventClient): void {
		const mapName = client.currentGroup
		const roadData = this.ensureRoadData(mapName)
		if (!roadData) {
			return
		}

		if (data.roadType === RoadType.None) {
			return
		}

	const collision = this.managers.map.getMap(mapName)?.collision
	const jobs = this.getJobsForMap(mapName)
	const addedTiles: RoadTile[] = []

	for (const tile of data.tiles) {
			if (!this.isTileWithinBounds(roadData, tile.x, tile.y)) {
				continue
			}

			if (collision) {
				const collisionIndex = tile.y * collision.width + tile.x
				if (collision.data[collisionIndex] !== 0) {
					continue
				}
			}

			const existing = this.getRoadTypeAtTile(mapName, tile.x, tile.y)
			if (existing === data.roadType) {
				continue
			}

			if (existing === RoadType.Stone) {
				continue
			}

			if (data.roadType === RoadType.Stone) {
				const consumed = this.consumeRoadMaterials(mapName, ROAD_UPGRADE_STONE_COST)
				if (!consumed) {
					this.logger.warn(`[Roads] Not enough stone to upgrade road at ${tile.x},${tile.y}`)
					continue
				}
			}

			const alreadyQueued = jobs.some(job => job.tileX === tile.x && job.tileY === tile.y)
			if (alreadyQueued) {
				continue
			}

		jobs.push({
			jobId: uuidv4(),
			mapName,
			playerId: client.id,
			tileX: tile.x,
			tileY: tile.y,
			roadType: data.roadType,
			createdAt: Date.now()
		})

		addedTiles.push({ x: tile.x, y: tile.y, roadType: data.roadType })
	}

	if (addedTiles.length > 0) {
		this.event.emit(Receiver.Group, RoadEvents.SC.PendingUpdated, {
			mapName,
			tiles: addedTiles
		} as RoadPendingUpdatedData, mapName)
	}
}

	private consumeRoadMaterials(mapName: string, stoneCost: number): boolean {
		if (stoneCost <= 0) {
			return true
		}
		const available = this.managers.storage.getTotalQuantity(mapName, 'stone')
		if (available < stoneCost) {
			return false
		}
		return this.managers.storage.consumeFromAnyStorage(mapName, 'stone', stoneCost)
	}

	private toJobData(job: RoadJob): RoadJobData {
		const position = this.getWorldPosition(job.mapName, job.tileX, job.tileY)
		return {
			jobId: job.jobId,
			mapName: job.mapName,
			playerId: job.playerId,
			position,
			tile: { x: job.tileX, y: job.tileY },
			roadType: job.roadType,
			durationMs: job.roadType === RoadType.Stone ? ROAD_UPGRADE_DURATION_MS : ROAD_BUILD_DURATION_MS
		}
	}

	private setRoadTile(mapName: string, tileX: number, tileY: number, roadType: RoadType): void {
		const roadData = this.ensureRoadData(mapName)
		if (!roadData) {
			return
		}

		const index = tileY * roadData.width + tileX
		roadData.data[index] = roadType

		this.event.emit(Receiver.Group, RoadEvents.SC.Updated, {
			mapName,
			tiles: [{ x: tileX, y: tileY, roadType }]
		} as RoadTilesUpdatedData, mapName)
	}

	private sendRoadSync(mapName: string): void {
		const roadData = this.ensureRoadData(mapName)
		if (!roadData) {
			return
		}

		const tiles: RoadTile[] = []
		for (let y = 0; y < roadData.height; y++) {
			for (let x = 0; x < roadData.width; x++) {
				const index = y * roadData.width + x
				const roadType = roadData.data[index]
				if (roadType && roadType !== RoadType.None) {
					tiles.push({ x, y, roadType })
				}
			}
		}

	this.event.emit(Receiver.Group, RoadEvents.SC.Sync, {
		mapName,
		tiles
	} as RoadTilesSyncData, mapName)
}

private sendPendingRoadSync(mapName: string): void {
	const jobs = this.jobsByMap.get(mapName)
	if (!jobs || jobs.length === 0) {
		this.event.emit(Receiver.Group, RoadEvents.SC.PendingSync, {
			mapName,
			tiles: []
		} as RoadPendingSyncData, mapName)
		return
	}

	const tiles: RoadTile[] = jobs.map(job => ({
		x: job.tileX,
		y: job.tileY,
		roadType: job.roadType
	}))

	this.event.emit(Receiver.Group, RoadEvents.SC.PendingSync, {
		mapName,
		tiles
	} as RoadPendingSyncData, mapName)
}

private emitPendingRemoval(mapName: string, tileX: number, tileY: number): void {
	this.event.emit(Receiver.Group, RoadEvents.SC.PendingUpdated, {
		mapName,
		tiles: [{ x: tileX, y: tileY, roadType: RoadType.None }]
	} as RoadPendingUpdatedData, mapName)
}

private ensureRoadData(mapName: string): RoadData | null {
		let roadData = this.roadsByMap.get(mapName)
		if (roadData) {
			return roadData
		}

		const map = this.managers.map.getMap(mapName)
		if (!map) {
			return null
		}

		roadData = {
			width: map.tiledMap.width,
			height: map.tiledMap.height,
			data: new Array(map.tiledMap.width * map.tiledMap.height).fill(RoadType.None)
		}

		this.roadsByMap.set(mapName, roadData)
		return roadData
	}

	private getJobsForMap(mapName: string): RoadJob[] {
		let jobs = this.jobsByMap.get(mapName)
		if (!jobs) {
			jobs = []
			this.jobsByMap.set(mapName, jobs)
		}
		return jobs
	}

	private getTileSize(mapName: string): number {
		const map = this.managers.map.getMap(mapName)
		return map?.tiledMap.tilewidth || 32
	}

	private getWorldPosition(mapName: string, tileX: number, tileY: number): { x: number, y: number } {
		const tileSize = this.getTileSize(mapName)
		return {
			x: tileX * tileSize + tileSize / 2,
			y: tileY * tileSize + tileSize / 2
		}
	}

	private isTileWithinBounds(roadData: RoadData, tileX: number, tileY: number): boolean {
		return tileX >= 0 && tileX < roadData.width && tileY >= 0 && tileY < roadData.height
	}
}

export * from './types'
export * from './events'
