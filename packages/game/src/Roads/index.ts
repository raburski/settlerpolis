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
import { SimulationEvents } from '../Simulation/events'
import type { SimulationTickData } from '../Simulation/types'
import type { RoadsSnapshot } from '../state/types'
import { RoadManagerState } from './RoadManagerState'

export interface RoadManagerDeps {
	event: EventManager
	map: MapManager
	storage: StorageManager
}

interface RoadJob {
	jobId: string
	mapId: string
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
	private readonly state = new RoadManagerState()

	private get roadsByMap(): Map<string, RoadData> {
		return this.state.roadsByMap
	}

	private get jobsByMap(): Map<string, RoadJob[]> {
		return this.state.jobsByMap
	}

	private get simulationTimeMs(): number {
		return this.state.simulationTimeMs
	}

	private set simulationTimeMs(value: number) {
		this.state.simulationTimeMs = value
	}

	constructor(
		managers: RoadManagerDeps,
		private logger: Logger
	) {
		super(managers)
		this.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		this.managers.event.on(SimulationEvents.SS.Tick, this.handleSimulationSSTick)
		this.managers.event.on<RoadBuildRequestData>(RoadEvents.CS.Place, this.handleRoadCSPlace)
		this.managers.event.on(Event.Players.CS.Join, this.handlePlayersCSJoin)
		this.managers.event.on(Event.Players.CS.TransitionTo, this.handlePlayersCSTransitionTo)
	}

	/* EVENT HANDLERS */
	private readonly handleSimulationSSTick = (data: SimulationTickData): void => {
		this.simulationTimeMs = data.nowMs
	}

	private readonly handleRoadCSPlace = (data: RoadBuildRequestData, client: EventClient): void => {
		this.handleRoadRequest(data, client)
	}

	private readonly handlePlayersCSJoin = (data: { mapId?: string }, client: EventClient): void => {
		const mapId = data.mapId || client.currentGroup
		this.sendRoadSync(mapId, client)
		this.sendPendingRoadSync(mapId, client)
	}

	private readonly handlePlayersCSTransitionTo = (data: { mapId?: string }, client: EventClient): void => {
		const mapId = data.mapId || client.currentGroup
		this.sendRoadSync(mapId, client)
		this.sendPendingRoadSync(mapId, client)
	}

	/* METHODS */
	public getRoadData(mapId: string): RoadData | null {
		return this.ensureRoadData(mapId)
	}

	public getRoadTypeAtTile(mapId: string, tileX: number, tileY: number): RoadType {
		const roadData = this.ensureRoadData(mapId)
		if (!roadData) {
			return RoadType.None
		}

		const index = tileY * roadData.width + tileX
		if (index < 0 || index >= roadData.data.length) {
			return RoadType.None
		}

		return roadData.data[index] ?? RoadType.None
	}

	public isRoadPlannedOrBuilt(mapId: string, tileX: number, tileY: number): boolean {
		if (this.getRoadTypeAtTile(mapId, tileX, tileY) !== RoadType.None) {
			return true
		}
		const jobs = this.jobsByMap.get(mapId)
		if (!jobs || jobs.length === 0) {
			return false
		}
		return jobs.some(job => job.tileX === tileX && job.tileY === tileY)
	}

	public getSpeedMultiplier(mapId: string, position: { x: number, y: number }): number {
		const roadData = this.ensureRoadData(mapId)
		if (!roadData) {
			return 1
		}

		const tileSize = this.getTileSize(mapId)
		const tileX = Math.floor(position.x / tileSize)
		const tileY = Math.floor(position.y / tileSize)
		const roadType = this.getRoadTypeAtTile(mapId, tileX, tileY)
		return ROAD_SPEED_MULTIPLIERS[roadType] || 1
	}

	public getSpeedMultiplierForSegment(
		mapId: string,
		fromPosition: { x: number, y: number },
		toPosition: { x: number, y: number }
	): number {
		const roadData = this.ensureRoadData(mapId)
		if (!roadData) {
			return 1
		}

		const tileSize = this.getTileSize(mapId)
		const fromTileX = Math.floor(fromPosition.x / tileSize)
		const fromTileY = Math.floor(fromPosition.y / tileSize)
		const toTileX = Math.floor(toPosition.x / tileSize)
		const toTileY = Math.floor(toPosition.y / tileSize)

		const fromType = this.getRoadTypeAtTile(mapId, fromTileX, fromTileY)
		const toType = this.getRoadTypeAtTile(mapId, toTileX, toTileY)
		if (fromType === RoadType.None || toType === RoadType.None) {
			return 1
		}

		const fromMultiplier = ROAD_SPEED_MULTIPLIERS[fromType] || 1
		const toMultiplier = ROAD_SPEED_MULTIPLIERS[toType] || 1
		return Math.min(fromMultiplier, toMultiplier)
	}

	public getPendingJobGroups(): Array<{ mapId: string, playerId: string, count: number }> {
		const groups = new Map<string, { mapId: string, playerId: string, count: number }>()
		for (const jobs of this.jobsByMap.values()) {
			for (const job of jobs) {
				if (job.assignedSettlerId) {
					continue
				}
				const key = `${job.mapId}:${job.playerId}`
				const entry = groups.get(key)
				if (entry) {
					entry.count += 1
				} else {
					groups.set(key, { mapId: job.mapId, playerId: job.playerId, count: 1 })
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

	public claimJob(mapId: string, playerId: string, settlerId: string): RoadJobData | null {
		const jobs = this.jobsByMap.get(mapId)
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
		for (const [mapId, jobs] of this.jobsByMap.entries()) {
			const index = jobs.findIndex(job => job.jobId === jobId)
			if (index < 0) {
				continue
			}

			const job = jobs[index]
			this.setRoadTile(mapId, job.tileX, job.tileY, job.roadType)
			this.emitPendingRemoval(mapId, job.tileX, job.tileY)
			jobs.splice(index, 1)
			if (jobs.length === 0) {
				this.jobsByMap.delete(mapId)
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
		const mapId = client.currentGroup
		const roadData = this.ensureRoadData(mapId)
		if (!roadData) {
			return
		}

		if (data.roadType === RoadType.None) {
			return
		}

	const collision = this.managers.map.getMap(mapId)?.collision
	const jobs = this.getJobsForMap(mapId)
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

			const existing = this.getRoadTypeAtTile(mapId, tile.x, tile.y)
			if (existing === data.roadType) {
				continue
			}

			if (existing === RoadType.Stone) {
				continue
			}

			if (data.roadType === RoadType.Stone) {
				const consumed = this.consumeRoadMaterials(mapId, ROAD_UPGRADE_STONE_COST)
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
			mapId,
			playerId: client.id,
			tileX: tile.x,
			tileY: tile.y,
			roadType: data.roadType,
			createdAt: this.simulationTimeMs
		})

		addedTiles.push({ x: tile.x, y: tile.y, roadType: data.roadType })
	}

	if (addedTiles.length > 0) {
		this.managers.event.emit(Receiver.Group, RoadEvents.SC.PendingUpdated, {
			mapId,
			tiles: addedTiles
		} as RoadPendingUpdatedData, mapId)
	}
}

	private consumeRoadMaterials(mapId: string, stoneCost: number): boolean {
		if (stoneCost <= 0) {
			return true
		}
		const available = this.managers.storage.getTotalQuantity(mapId, 'stone')
		if (available < stoneCost) {
			return false
		}
		return this.managers.storage.consumeFromAnyStorage(mapId, 'stone', stoneCost)
	}

	private toJobData(job: RoadJob): RoadJobData {
		const position = this.getWorldPosition(job.mapId, job.tileX, job.tileY)
		return {
			jobId: job.jobId,
			mapId: job.mapId,
			playerId: job.playerId,
			position,
			tile: { x: job.tileX, y: job.tileY },
			roadType: job.roadType,
			durationMs: job.roadType === RoadType.Stone ? ROAD_UPGRADE_DURATION_MS : ROAD_BUILD_DURATION_MS
		}
	}

	private setRoadTile(mapId: string, tileX: number, tileY: number, roadType: RoadType): void {
		const roadData = this.ensureRoadData(mapId)
		if (!roadData) {
			return
		}

		const index = tileY * roadData.width + tileX
		roadData.data[index] = roadType

		this.managers.event.emit(Receiver.Group, RoadEvents.SC.Updated, {
			mapId,
			tiles: [{ x: tileX, y: tileY, roadType }]
		} as RoadTilesUpdatedData, mapId)
	}

	private sendRoadSync(mapId: string, client?: EventClient): void {
		const roadData = this.ensureRoadData(mapId)
		if (!roadData) {
			return
		}

		const tiles: RoadTile[] = []
		for (let y = 0; y < roadData.height; y++) {
			for (let x = 0; x < roadData.width; x++) {
				const index = y * roadData.width + x
				const roadType = roadData.data[index]
				if (roadType !== RoadType.None) {
					tiles.push({ x, y, roadType })
				}
			}
		}

		const payload = {
			mapId,
			tiles
		} as RoadTilesSyncData

		if (client) {
			client.emit(Receiver.Sender, RoadEvents.SC.Sync, payload)
		} else {
			this.managers.event.emit(Receiver.Group, RoadEvents.SC.Sync, payload, mapId)
		}
}

private sendPendingRoadSync(mapId: string, client?: EventClient): void {
	const jobs = this.jobsByMap.get(mapId)
	if (!jobs || jobs.length === 0) {
		const payload = {
			mapId,
			tiles: []
		} as RoadPendingSyncData
		if (client) {
			client.emit(Receiver.Sender, RoadEvents.SC.PendingSync, payload)
		} else {
			this.managers.event.emit(Receiver.Group, RoadEvents.SC.PendingSync, payload, mapId)
		}
		return
	}

	const tiles: RoadTile[] = jobs.map(job => ({
		x: job.tileX,
		y: job.tileY,
		roadType: job.roadType
	}))

	const payload = {
		mapId,
		tiles
	} as RoadPendingSyncData
	if (client) {
		client.emit(Receiver.Sender, RoadEvents.SC.PendingSync, payload)
	} else {
		this.managers.event.emit(Receiver.Group, RoadEvents.SC.PendingSync, payload, mapId)
	}
}

private emitPendingRemoval(mapId: string, tileX: number, tileY: number): void {
	this.managers.event.emit(Receiver.Group, RoadEvents.SC.PendingUpdated, {
		mapId,
		tiles: [{ x: tileX, y: tileY, roadType: RoadType.None }]
	} as RoadPendingUpdatedData, mapId)
}

private ensureRoadData(mapId: string): RoadData | null {
		let roadData = this.roadsByMap.get(mapId)
		if (roadData) {
			return roadData
		}

		const map = this.managers.map.getMap(mapId)
		if (!map) {
			return null
		}

		roadData = {
			width: map.tiledMap.width,
			height: map.tiledMap.height,
			data: new Array(map.tiledMap.width * map.tiledMap.height).fill(RoadType.None)
		}

		this.roadsByMap.set(mapId, roadData)
		return roadData
	}

	private getJobsForMap(mapId: string): RoadJob[] {
		let jobs = this.jobsByMap.get(mapId)
		if (!jobs) {
			jobs = []
			this.jobsByMap.set(mapId, jobs)
		}
		return jobs
	}

	private getTileSize(mapId: string): number {
		const map = this.managers.map.getMap(mapId)
		return map?.tiledMap.tilewidth || 32
	}

	private getWorldPosition(mapId: string, tileX: number, tileY: number): { x: number, y: number } {
		const tileSize = this.getTileSize(mapId)
		return {
			x: tileX * tileSize + tileSize / 2,
			y: tileY * tileSize + tileSize / 2
		}
	}

	private isTileWithinBounds(roadData: RoadData, tileX: number, tileY: number): boolean {
		return tileX >= 0 && tileX < roadData.width && tileY >= 0 && tileY < roadData.height
	}

	serialize(): RoadsSnapshot {
		return this.state.serialize()
	}

	deserialize(state: RoadsSnapshot): void {
		this.state.deserialize(state)
	}

	reset(): void {
		this.state.reset()
	}
}

export * from './types'
export * from './events'
export * from './RoadManagerState'
