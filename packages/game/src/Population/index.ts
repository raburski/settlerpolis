import { EventManager, Event, EventClient } from '../events'
import { PopulationEvents } from './events'
import { MovementEvents } from '../Movement/events'
import {
	SettlerId,
	Settler,
	ProfessionType,
	SettlerState,
	ProfessionDefinition,
	ProfessionToolDefinition,
	SpawnSettlerData,
	RequestListData
} from './types'
import { NEED_CRITICAL_THRESHOLD } from '../Needs/NeedsState'
import { Receiver } from '../Receiver'
import { v4 as uuidv4 } from 'uuid'
import type { BuildingManager } from '../Buildings'
import { ConstructionStage } from '../Buildings/types'
import type { Scheduler } from '../Scheduler'
import type { MapManager } from '../Map'
import type { LootManager } from '../Loot'
import type { ItemsManager } from '../Items'
import type { MovementManager } from '../Movement'
import type { StorageManager } from '../Storage'
import { Position } from '../types'
import { Logger } from '../Logs'
import { BaseManager } from '../Managers'
import { PopulationStats } from './Stats'
import type { PlayerJoinData } from '../Players/types'
import { SimulationEvents } from '../Simulation/events'
import type { SimulationTickData } from '../Simulation/types'
import type { PopulationSnapshot } from '../state/types'

const SETTLER_SPEED = 80 // pixels per second (slower baseline)

export interface PopulationDeps {
	buildings: BuildingManager
	scheduler: Scheduler
	map: MapManager
	loot: LootManager
	items: ItemsManager
	movement: MovementManager
	storage: StorageManager
}

export class PopulationManager extends BaseManager<PopulationDeps> {
	private settlers = new Map<string, Settler>() // settlerId -> Settler
	private houseOccupants = new Map<string, Set<string>>() // houseId -> settlerIds
	private professionTools = new Map<string, ProfessionType>() // itemType -> ProfessionType
	private professions = new Map<ProfessionType, ProfessionDefinition>() // professionType -> ProfessionDefinition
	private stats: PopulationStats
	private startingPopulation: Array<{ profession: ProfessionType, count: number }> = []
	private houseSpawnSchedule = new Map<string, { nextSpawnAtMs: number, rateMs: number }>()
	private simulationTimeMs = 0

	constructor(
		managers: PopulationDeps,
		private event: EventManager,
		startingPopulation: Array<{ profession: ProfessionType, count: number }>,
		private logger: Logger
	) {
		super(managers)
		this.startingPopulation = startingPopulation || []

		this.stats = new PopulationStats(
			event,
			(mapName: string, playerId: string) => {
				return Array.from(this.settlers.values()).filter(
					s => s.mapName === mapName && s.playerId === playerId
				)
			},
			(mapName: string, playerId: string) => {
				return this.getHousingCapacity(mapName, playerId)
			}
		)

		this.setupEventHandlers()
		this.stats.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		this.event.on(SimulationEvents.SS.Tick, (data: SimulationTickData) => {
			this.handleSimulationTick(data)
		})

		this.event.on<PlayerJoinData>(Event.Players.CS.Join, (data, client) => {
			if (this.hasAnySettlersForPlayer(client.id)) {
				return
			}
			const mapName = data.mapId || this.managers.map.getDefaultMapId()
			this.spawnInitialPopulation(mapName, client.id, data.position)
		})

		this.event.on(Event.Buildings.SS.HouseCompleted, (data: { buildingInstanceId: string, buildingId: string }) => {
			const buildingDef = this.managers.buildings.getBuildingDefinition(data.buildingId)
			if (buildingDef && buildingDef.spawnsSettlers) {
				this.onHouseCompleted(data.buildingInstanceId, data.buildingId)
			}
		})

		this.event.on<RequestListData>(PopulationEvents.CS.RequestList, (data, client) => {
			this.sendPopulationList(client)
		})

		this.event.on(MovementEvents.SS.StepComplete, (data: { entityId: string, position: Position }) => {
			const settler = this.settlers.get(data.entityId)
			if (settler) {
				settler.position = data.position
			}
		})
	}

	private handleSimulationTick(data: SimulationTickData): void {
		this.simulationTimeMs = data.nowMs
		this.processHouseSpawns()
	}

	private processHouseSpawns(): void {
		if (this.houseSpawnSchedule.size === 0) {
			return
		}

		for (const [houseId, schedule] of this.houseSpawnSchedule.entries()) {
			if (this.simulationTimeMs < schedule.nextSpawnAtMs) {
				continue
			}

			const house = this.managers.buildings.getBuildingInstance(houseId)
			if (!house) {
				this.houseSpawnSchedule.delete(houseId)
				continue
			}

			// Catch up if the simulation advanced past multiple intervals
			while (this.simulationTimeMs >= schedule.nextSpawnAtMs) {
				this.spawnSettler({ houseBuildingInstanceId: houseId })
				schedule.nextSpawnAtMs += schedule.rateMs
			}
		}
	}

	// Public method to load profession tools (called from ContentLoader)
	public loadProfessionTools(tools: ProfessionToolDefinition[]): void {
		this.professionTools.clear()
		tools.forEach(tool => {
			this.professionTools.set(tool.itemType, tool.targetProfession)
		})
		this.logger.log(`Loaded ${tools.length} profession tools`)
	}

	// Public method to load professions (called from ContentLoader)
	public loadProfessions(professions: ProfessionDefinition[]): void {
		this.professions.clear()
		professions.forEach(prof => {
			this.professions.set(prof.type, prof)
		})
		this.logger.log(`Loaded ${professions.length} professions`)
	}

	public getSettler(settlerId: string): Settler | undefined {
		return this.settlers.get(settlerId)
	}

	public getSettlers(): Settler[] {
		return Array.from(this.settlers.values())
	}

	private hasAnySettlersForPlayer(playerId: string): boolean {
		for (const settler of this.settlers.values()) {
			if (settler.playerId === playerId) {
				return true
			}
		}
		return false
	}

	public getAvailableSettlers(mapName: string, playerId: string): Settler[] {
		return Array.from(this.settlers.values())
			.filter(settler => settler.mapName === mapName && settler.playerId === playerId)
			.filter(settler => settler.state === SettlerState.Idle)
			.filter(settler => !this.isSettlerCritical(settler))
	}

	public getAvailableCarriers(mapName: string, playerId: string): Settler[] {
		return this.getAvailableSettlers(mapName, playerId)
			.filter(settler => settler.profession === ProfessionType.Carrier)
	}

	private getHousingCapacity(mapName: string, playerId: string): number {
		let capacity = 0
		for (const building of this.managers.buildings.getAllBuildings()) {
			if (building.mapName !== mapName || building.playerId !== playerId) {
				continue
			}
			if (building.stage !== ConstructionStage.Completed) {
				continue
			}
			const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
			if (!definition?.spawnsSettlers) {
				continue
			}
			capacity += definition.maxOccupants ?? 0
		}
		return capacity
	}

	private getHouseCapacity(houseId: string): number {
		const building = this.managers.buildings.getBuildingInstance(houseId)
		if (!building) {
			return 0
		}
		const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
		if (!definition?.spawnsSettlers) {
			return 0
		}
		return definition.maxOccupants ?? 0
	}

	private getHouseOccupants(houseId: string): Set<string> {
		let occupants = this.houseOccupants.get(houseId)
		if (!occupants) {
			occupants = new Set<string>()
			this.houseOccupants.set(houseId, occupants)
		}
		return occupants
	}

	public getHouseOccupantCount(houseId: string): number {
		const occupants = this.houseOccupants.get(houseId)
		return occupants ? occupants.size : 0
	}

	public moveSettlerToHouse(settlerId: string, houseId: string): boolean {
		return this.assignSettlerToHouse(settlerId, houseId)
	}

	private removeSettlerFromHouse(settlerId: string): void {
		const settler = this.settlers.get(settlerId)
		if (!settler?.houseId) {
			return
		}
		const occupants = this.houseOccupants.get(settler.houseId)
		occupants?.delete(settlerId)
		settler.houseId = undefined
		this.event.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, { settler }, settler.mapName)
	}

	private assignSettlerToHouse(settlerId: string, houseId: string): boolean {
		const settler = this.settlers.get(settlerId)
		if (!settler) {
			return false
		}
		const capacity = this.getHouseCapacity(houseId)
		if (capacity <= 0) {
			return false
		}
		const occupants = this.getHouseOccupants(houseId)
		if (occupants.size >= capacity) {
			return false
		}
		if (settler.houseId && settler.houseId !== houseId) {
			this.removeSettlerFromHouse(settlerId)
		}
		occupants.add(settlerId)
		settler.houseId = houseId
		this.event.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, { settler }, settler.mapName)
		return true
	}

	private assignHomelessToHouse(houseId: string): void {
		const building = this.managers.buildings.getBuildingInstance(houseId)
		if (!building) {
			return
		}
		const capacity = this.getHouseCapacity(houseId)
		if (capacity <= 0) {
			return
		}
		const occupants = this.getHouseOccupants(houseId)
		let available = capacity - occupants.size
		if (available <= 0) {
			return
		}
		const homeless = Array.from(this.settlers.values())
			.filter(settler => settler.mapName === building.mapName && settler.playerId === building.playerId)
			.filter(settler => !settler.houseId)
			.sort((a, b) => a.createdAt - b.createdAt)

		for (const settler of homeless) {
			if (available <= 0) {
				break
			}
			if (this.assignSettlerToHouse(settler.id, houseId)) {
				available -= 1
			}
		}
	}

	private canSpawnFromHouse(houseId: string): boolean {
		const capacity = this.getHouseCapacity(houseId)
		if (capacity <= 0) {
			return false
		}
		const occupants = this.getHouseOccupants(houseId)
		return occupants.size < capacity
	}

	private isSettlerCritical(settler: Settler): boolean {
		if (!settler.needs) {
			return false
		}
		return settler.needs.hunger <= NEED_CRITICAL_THRESHOLD || settler.needs.fatigue <= NEED_CRITICAL_THRESHOLD
	}

	public setSettlerState(settlerId: string, state: SettlerState): void {
		const settler = this.settlers.get(settlerId)
		if (!settler) {
			return
		}
		settler.state = state
		this.event.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, { settler }, settler.mapName)
	}

	public setSettlerAssignment(settlerId: string, assignmentId?: string, providerId?: string, buildingId?: string): void {
		const settler = this.settlers.get(settlerId)
		if (!settler) {
			return
		}
		settler.stateContext = {
			...settler.stateContext,
			assignmentId,
			providerId
		}
		settler.buildingId = buildingId
		this.event.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, { settler }, settler.mapName)
	}

	public setSettlerCarryingItem(settlerId: string, itemType?: string, quantity?: number): void {
		const settler = this.settlers.get(settlerId)
		if (!settler) {
			return
		}
		settler.stateContext = {
			...settler.stateContext,
			carryingItemType: itemType,
			carryingQuantity: itemType ? quantity : undefined
		}
		this.event.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, { settler }, settler.mapName)
	}

	public setSettlerWaitReason(settlerId: string, reason?: string): void {
		const settler = this.settlers.get(settlerId)
		if (!settler) {
			return
		}
		settler.stateContext = {
			...settler.stateContext,
			waitReason: reason
		}
		this.event.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, { settler }, settler.mapName)
	}

	public setSettlerLastStep(settlerId: string, stepType?: string, reason?: string): void {
		const settler = this.settlers.get(settlerId)
		if (!settler) {
			return
		}
		settler.stateContext = {
			...settler.stateContext,
			lastStepType: stepType,
			lastStepReason: reason
		}
		this.event.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, { settler }, settler.mapName)
	}

	public setSettlerEquippedItem(settlerId: string, itemType?: string, quantity?: number): void {
		const settler = this.settlers.get(settlerId)
		if (!settler) {
			return
		}
		settler.stateContext = {
			...settler.stateContext,
			equippedItemType: itemType,
			equippedQuantity: itemType ? quantity : undefined
		}
		this.event.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, { settler }, settler.mapName)
	}

	public setSettlerTarget(settlerId: string, targetId?: string, targetPosition?: Position, targetType?: string): void {
		const settler = this.settlers.get(settlerId)
		if (!settler) {
			return
		}
		settler.stateContext = {
			...settler.stateContext,
			targetId,
			targetPosition,
			targetType
		}
		this.event.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, { settler }, settler.mapName)
	}

	public setSettlerNeeds(settlerId: string, needs: { hunger: number, fatigue: number }): void {
		const settler = this.settlers.get(settlerId)
		if (!settler) {
			return
		}
		settler.needs = {
			hunger: Math.max(0, Math.min(1, needs.hunger)),
			fatigue: Math.max(0, Math.min(1, needs.fatigue))
		}
		this.event.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, { settler }, settler.mapName)
	}

	public setSettlerProfession(settlerId: string, profession: ProfessionType): void {
		const settler = this.settlers.get(settlerId)
		if (!settler) {
			return
		}
		const oldProfession = settler.profession
		settler.profession = profession
		this.event.emit(Receiver.Group, PopulationEvents.SC.ProfessionChanged, {
			settlerId,
			oldProfession,
			newProfession: profession
		}, settler.mapName)
		this.event.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, { settler }, settler.mapName)
	}

	public getToolItemType(profession: ProfessionType): string | null {
		for (const [itemType, targetProfession] of this.professionTools.entries()) {
			if (targetProfession === profession) {
				return itemType
			}
		}
		return null
	}

	public findAvailableToolOnMap(mapName: string, itemType: string): { id: string, position: Position } | null {
		const tool = this.findToolOnMap(mapName, itemType)
		if (!tool) {
			return null
		}
		if (!this.managers.loot.isItemAvailable(tool.id)) {
			return null
		}
		return tool
	}

	public findToolOnMap(mapName: string, itemType: string): { id: string, position: Position } | null {
		const mapItems = this.managers.loot.getMapItems(mapName)
		const tool = mapItems.find(item => item.itemType === itemType)
		if (!tool) {
			return null
		}
		return { id: tool.id, position: tool.position }
	}

	public getServerClient(mapName?: string): EventClient {
		return {
			id: 'server',
			currentGroup: mapName || 'GLOBAL',
			setGroup: () => {},
			emit: (to, event, data, groupName) => {
				this.event.emit(to, event, data, groupName)
			}
		}
	}

	private onHouseCompleted(buildingInstanceId: string, buildingId: string): void {
		const buildingDef = this.managers.buildings.getBuildingDefinition(buildingId)
		if (!buildingDef || !buildingDef.spawnRate) {
			return
		}

		const spawnRateMs = buildingDef.spawnRate * 1000
		if (this.houseSpawnSchedule.has(buildingInstanceId)) {
			return
		}

		this.assignHomelessToHouse(buildingInstanceId)
		this.spawnSettler({ houseBuildingInstanceId: buildingInstanceId })
		this.houseSpawnSchedule.set(buildingInstanceId, {
			nextSpawnAtMs: this.simulationTimeMs + spawnRateMs,
			rateMs: spawnRateMs
		})
	}

	private spawnSettler(data: SpawnSettlerData): Settler | null {
		const house = this.managers.buildings.getBuildingInstance(data.houseBuildingInstanceId)
		if (!house) {
			return null
		}

		if (!this.canSpawnFromHouse(house.id)) {
			return null
		}

		const id = uuidv4()
		const settler: Settler = {
			id,
			playerId: house.playerId,
			mapName: house.mapName,
			position: { ...house.position },
			profession: ProfessionType.Carrier,
			state: SettlerState.Idle,
			stateContext: {},
			houseId: house.id,
			speed: SETTLER_SPEED,
			createdAt: this.simulationTimeMs
		}

		this.settlers.set(id, settler)
		this.getHouseOccupants(house.id).add(id)
		this.managers.movement.registerEntity({
			id: settler.id,
			position: settler.position,
			mapName: settler.mapName,
			speed: settler.speed
		})

		this.event.emit(Receiver.Group, PopulationEvents.SC.SettlerSpawned, { settler }, settler.mapName)
		this.event.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, { settler }, settler.mapName)
		return settler
	}

	public spawnInitialPopulation(mapName: string, playerId: string, spawnPosition: Position): void {
		const now = this.simulationTimeMs
		for (const popEntry of this.startingPopulation) {
			if (!this.professions.has(popEntry.profession)) {
				this.logger.warn(`Starting population profession ${popEntry.profession} does not exist, skipping`)
				continue
			}

			for (let i = 0; i < popEntry.count; i++) {
				const offset = 16
				const position = {
					x: spawnPosition.x + (i % 3) * offset,
					y: spawnPosition.y + Math.floor(i / 3) * offset
				}
				const settlerId = uuidv4()
				const settler: Settler = {
					id: settlerId,
					playerId,
					mapName,
					position,
					profession: popEntry.profession,
					state: SettlerState.Idle,
					stateContext: {},
					speed: SETTLER_SPEED,
					createdAt: now
				}

				this.settlers.set(settlerId, settler)
				this.managers.movement.registerEntity({
					id: settler.id,
					position: settler.position,
					mapName: settler.mapName,
					speed: settler.speed
				})

				this.event.emit(Receiver.Group, PopulationEvents.SC.SettlerSpawned, { settler }, mapName)
				this.event.emit(Receiver.Group, PopulationEvents.SC.SettlerUpdated, { settler }, mapName)
			}
		}
	}

	private sendPopulationList(client: EventClient): void {
		const settlers = Array.from(this.settlers.values())
		const totalCount = settlers.length
		const byProfession = this.getEmptyByProfession()
		const byProfessionActive = this.getEmptyByProfession()
		let idleCount = 0
		let workingCount = 0

		for (const settler of settlers) {
			byProfession[settler.profession] = (byProfession[settler.profession] || 0) + 1
			if (settler.state === SettlerState.Idle) {
				idleCount += 1
			} else {
				byProfessionActive[settler.profession] = (byProfessionActive[settler.profession] || 0) + 1
				if (settler.state === SettlerState.Working || settler.state === SettlerState.Harvesting) {
					workingCount += 1
				}
			}
		}

		client.emit(Receiver.Sender, PopulationEvents.SC.List, {
			settlers,
			totalCount,
			byProfession,
			byProfessionActive,
			idleCount,
			workingCount
		})
	}

	serialize(): PopulationSnapshot {
		return {
			settlers: Array.from(this.settlers.values()).map(settler => ({
				...settler,
				position: { ...settler.position },
				stateContext: { ...settler.stateContext },
				needs: settler.needs ? { ...settler.needs } : undefined
			})),
			houseOccupants: Array.from(this.houseOccupants.entries()).map(([houseId, occupants]) => ([
				houseId,
				Array.from(occupants.values())
			])),
			houseSpawnSchedule: Array.from(this.houseSpawnSchedule.entries()),
			simulationTimeMs: this.simulationTimeMs
		}
	}

	deserialize(state: PopulationSnapshot): void {
		this.settlers.clear()
		this.houseOccupants.clear()
		this.houseSpawnSchedule.clear()
		this.simulationTimeMs = state.simulationTimeMs

		for (const settler of state.settlers) {
			const restored: Settler = {
				...settler,
				position: { ...settler.position },
				stateContext: { ...settler.stateContext },
				needs: settler.needs ? { ...settler.needs } : undefined
			}
			this.settlers.set(restored.id, restored)
			this.managers.movement.registerEntity({
				id: restored.id,
				position: restored.position,
				mapName: restored.mapName,
				speed: restored.speed
			})
		}

		for (const [houseId, occupants] of state.houseOccupants) {
			this.houseOccupants.set(houseId, new Set(occupants))
		}

		for (const [houseId, schedule] of state.houseSpawnSchedule) {
			this.houseSpawnSchedule.set(houseId, { ...schedule })
		}
	}

	reset(): void {
		this.settlers.clear()
		this.houseOccupants.clear()
		this.houseSpawnSchedule.clear()
		this.simulationTimeMs = 0
	}

	private getEmptyByProfession(): Record<ProfessionType, number> {
		const byProfession = {} as Record<ProfessionType, number>
		Object.values(ProfessionType).forEach(profession => {
			byProfession[profession] = 0
		})
		return byProfession
	}
}
