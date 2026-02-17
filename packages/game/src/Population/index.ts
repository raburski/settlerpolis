import { EventManager, Event, EventClient } from '../events'
import { PopulationEvents } from './events'
import { MovementEvents } from '../Movement/events'
import {
	Settler,
	ProfessionType,
	SettlerState,
	ProfessionDefinition,
	ProfessionToolDefinition,
	SpawnSettlerData,
	RequestListData,
	SettlerPatch
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
import type { ItemType } from '../Items/types'
import type { MoveTargetType } from '../Movement/types'
import type { PlayerJoinData } from '../Players/types'
import { SimulationEvents } from '../Simulation/events'
import type { SimulationTickData } from '../Simulation/types'
import type { PopulationSnapshot } from '../state/types'
import { PopulationManagerState } from './PopulationManagerState'

const SETTLER_SPEED = 80 // pixels per second (slower baseline)
const TOMBSTONE_ITEM_TYPE = 'tombstone'
const CART_ITEM_TYPE = 'cart'
const BASE_CARRY_CAPACITY = 1
const CART_CARRY_CAPACITY = 8

export interface PopulationDeps {
	event: EventManager
	buildings: BuildingManager
	scheduler: Scheduler
	map: MapManager
	loot: LootManager
	items: ItemsManager
	movement: MovementManager
	storage: StorageManager
}

export class PopulationManager extends BaseManager<PopulationDeps> {
	private readonly state = new PopulationManagerState()
	private stats: PopulationStats

	private get settlers(): Map<string, Settler> {
		return this.state.settlers
	}

	private get houseOccupants(): Map<string, Set<string>> {
		return this.state.houseOccupants
	}

	private get professionTools(): Map<ProfessionType, ItemType> {
		return this.state.professionTools
	}

	private get professions(): Map<ProfessionType, ProfessionDefinition> {
		return this.state.professions
	}

	private get startingPopulation(): Array<{ profession: ProfessionType, count: number }> {
		return this.state.startingPopulation
	}

	private set startingPopulation(value: Array<{ profession: ProfessionType, count: number }>) {
		this.state.startingPopulation = value
	}

	private get houseSpawnSchedule(): Map<string, { nextSpawnAtMs: number, rateMs: number }> {
		return this.state.houseSpawnSchedule
	}

	private get simulationTimeMs(): number {
		return this.state.simulationTimeMs
	}

	private set simulationTimeMs(value: number) {
		this.state.simulationTimeMs = value
	}

	constructor(
		managers: PopulationDeps,
		startingPopulation: Array<{ profession: ProfessionType, count: number }>,
		private logger: Logger
	) {
		super(managers)
		this.startingPopulation = startingPopulation || []

		this.stats = new PopulationStats(
			managers.event,
			(mapId: string, playerId: string) => {
				return Array.from(this.settlers.values()).filter(
					s => s.mapId === mapId && s.playerId === playerId
				)
			},
			(mapId: string, playerId: string) => {
				return this.getHousingCapacity(mapId, playerId)
			}
		)

		this.setupEventHandlers()
		this.stats.setupEventHandlers()
	}

	private setupEventHandlers(): void {
		this.managers.event.on(SimulationEvents.SS.Tick, this.handleSimulationSSTick)
		this.managers.event.on<PlayerJoinData>(Event.Players.CS.Join, this.handlePlayersCSJoin)
		this.managers.event.on(Event.Buildings.SS.HouseCompleted, this.handleBuildingsSSHouseCompleted)
		this.managers.event.on<RequestListData>(PopulationEvents.CS.RequestList, this.handlePopulationCSRequestList)
		this.managers.event.on(MovementEvents.SS.SegmentComplete, this.handleMovementSSSegmentComplete)
		this.managers.event.on(MovementEvents.SS.StepComplete, this.handleMovementSSStepComplete)
	}

	/* EVENT HANDLERS */
	private readonly handleSimulationSSTick = (data: SimulationTickData): void => {
		this.handleSimulationTick(data)
	}

	private readonly handlePlayersCSJoin = (data: PlayerJoinData, client: EventClient): void => {
		if (this.hasAnySettlersForPlayer(client.id)) {
			return
		}
		const mapId = data.mapId || this.managers.map.getDefaultMapId()
		this.spawnInitialPopulation(mapId, client.id, data.position)
	}

	private readonly handleBuildingsSSHouseCompleted = (data: { buildingInstanceId: string, buildingId: string }): void => {
		const buildingDef = this.managers.buildings.getBuildingDefinition(data.buildingId)
		if (buildingDef && buildingDef.spawnsSettlers) {
			this.onHouseCompleted(data.buildingInstanceId, data.buildingId)
		}
	}

	private readonly handlePopulationCSRequestList = (_data: RequestListData, client: EventClient): void => {
		this.sendPopulationList(client)
	}

	private readonly handleMovementSSSegmentComplete = (data: { entityId: string, position: Position }): void => {
		this.syncSettlerPosition(data)
	}

	private readonly handleMovementSSStepComplete = (data: { entityId: string, position: Position }): void => {
		this.syncSettlerPosition(data)
	}

	/* METHODS */
	private syncSettlerPosition(data: { entityId: string, position: Position }): void {
		const settler = this.settlers.get(data.entityId)
		if (!settler) {
			return
		}
		settler.position = { ...data.position }
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
			this.professionTools.set(tool.targetProfession, tool.itemType)
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

	public getAvailableSettlers(mapId: string, playerId: string): Settler[] {
		return Array.from(this.settlers.values())
			.filter(settler => settler.mapId === mapId && settler.playerId === playerId)
			.filter(settler => settler.state === SettlerState.Idle)
			.filter(settler => !this.isSettlerCritical(settler))
	}

	public getAvailableCarriers(mapId: string, playerId: string): Settler[] {
		return this.getAvailableSettlers(mapId, playerId)
			.filter(settler => settler.profession === ProfessionType.Carrier)
	}

	private getHousingCapacity(mapId: string, playerId: string): number {
		let capacity = 0
		for (const building of this.managers.buildings.getAllBuildings()) {
			if (building.mapId !== mapId || building.playerId !== playerId) {
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
		this.patchSettler(settlerId, { houseId: undefined })
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
		this.patchSettler(settlerId, { houseId })
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
			.filter(settler => settler.mapId === building.mapId && settler.playerId === building.playerId)
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

	private emitSettlerPatched(settler: Settler, patch: SettlerPatch): void {
		this.managers.event.emit(Receiver.Group, PopulationEvents.SC.SettlerPatched, {
			settlerId: settler.id,
			patch
		}, settler.mapId)
	}

	private patchSettler(settlerId: string, patch: SettlerPatch): void {
		const settler = this.settlers.get(settlerId)
		if (!settler) {
			return
		}

		const normalizedPatch: SettlerPatch = {}
		if (patch.state !== undefined) {
			settler.state = patch.state
			normalizedPatch.state = patch.state
		}
		if (patch.profession !== undefined) {
			settler.profession = patch.profession
			normalizedPatch.profession = patch.profession
		}
		if (patch.health !== undefined) {
			settler.health = patch.health
			normalizedPatch.health = patch.health
		}
		if (patch.needs !== undefined) {
			settler.needs = {
				hunger: patch.needs.hunger,
				fatigue: patch.needs.fatigue
			}
			normalizedPatch.needs = { ...settler.needs }
		}
		if (patch.stateContext !== undefined) {
			settler.stateContext = {
				...settler.stateContext,
				...patch.stateContext
			}
			normalizedPatch.stateContext = { ...patch.stateContext }
		}
		if ('buildingId' in patch) {
			settler.buildingId = patch.buildingId
			normalizedPatch.buildingId = patch.buildingId
		}
		if ('houseId' in patch) {
			settler.houseId = patch.houseId
			normalizedPatch.houseId = patch.houseId
		}
		if (patch.position !== undefined) {
			settler.position = { ...patch.position }
			normalizedPatch.position = { ...patch.position }
		}

		if (Object.keys(normalizedPatch).length === 0) {
			return
		}

		this.emitSettlerPatched(settler, normalizedPatch)
	}

	public setSettlerState(settlerId: string, state: SettlerState): void {
		this.patchSettler(settlerId, { state })
	}

	public setSettlerAssignment(settlerId: string, assignmentId?: string, providerId?: string, buildingId?: string): void {
		this.patchSettler(settlerId, {
			stateContext: {
				assignmentId,
				providerId
			},
			buildingId
		})
	}

	public setSettlerCarryingItem(settlerId: string, itemType?: ItemType, quantity?: number): void {
		this.patchSettler(settlerId, {
			stateContext: {
				carryingItemType: itemType,
				carryingQuantity: itemType ? quantity : undefined
			}
		})
	}

	public getSettlerCarryCapacity(settlerId: string): number {
		const settler = this.settlers.get(settlerId)
		if (!settler) {
			return BASE_CARRY_CAPACITY
		}
		return this.getCarryCapacityForSettler(settler)
	}

	private getCarryCapacityForSettler(settler: Settler): number {
		if (settler.stateContext.equippedItemType === CART_ITEM_TYPE) {
			return CART_CARRY_CAPACITY
		}
		return BASE_CARRY_CAPACITY
	}

	public setSettlerWaitReason(settlerId: string, reason?: string): void {
		this.patchSettler(settlerId, { stateContext: { waitReason: reason } })
	}

	public setSettlerLastStep(settlerId: string, stepType?: string, reason?: string): void {
		this.patchSettler(settlerId, {
			stateContext: {
				lastStepType: stepType,
				lastStepReason: reason
			}
		})
	}

	public setSettlerEquippedItem(settlerId: string, itemType?: ItemType, quantity?: number): void {
		this.patchSettler(settlerId, {
			stateContext: {
				equippedItemType: itemType,
				equippedQuantity: itemType ? quantity : undefined
			}
		})
	}

	public setSettlerTarget(settlerId: string, targetId?: string, targetPosition?: Position, targetType?: MoveTargetType): void {
		this.patchSettler(settlerId, {
			stateContext: {
				targetId,
				targetPosition,
				targetType
			}
		})
	}

	public setSettlerNeeds(settlerId: string, needs: { hunger: number, fatigue: number }): void {
		this.patchSettler(settlerId, {
			needs: {
				hunger: Math.max(0, Math.min(1, needs.hunger)),
				fatigue: Math.max(0, Math.min(1, needs.fatigue))
			}
		})
	}

	public setSettlerHealth(settlerId: string, health: number): boolean {
		const settler = this.settlers.get(settlerId)
		if (!settler) {
			return false
		}

		const clamped = Math.max(0, Math.min(1, health))
		settler.health = clamped

		if (clamped <= 0) {
			this.handleSettlerDeath(settler)
			return false
		}

		this.emitSettlerPatched(settler, { health: clamped })
		return true
	}

	public addSettlerHealthDelta(settlerId: string, delta: number): boolean {
		const settler = this.settlers.get(settlerId)
		if (!settler) {
			return false
		}
		const current = typeof settler.health === 'number' ? settler.health : 1
		return this.setSettlerHealth(settlerId, current + delta)
	}

	public setSettlerProfession(settlerId: string, profession: ProfessionType): void {
		const settler = this.settlers.get(settlerId)
		if (!settler) {
			return
		}
		const oldProfession = settler.profession
		settler.profession = profession
		this.managers.event.emit(Receiver.Group, PopulationEvents.SC.ProfessionChanged, {
			settlerId,
			oldProfession,
			newProfession: profession
		}, settler.mapId)
		this.emitSettlerPatched(settler, { profession })
	}

	public getToolItemType(profession: ProfessionType): ItemType | null {
		return this.professionTools.get(profession) ?? null
	}

	public findAvailableToolOnMap(mapId: string, itemType: ItemType): { id: string, position: Position } | null {
		const tool = this.findToolOnMap(mapId, itemType)
		if (!tool) {
			return null
		}
		if (!this.managers.loot.isItemAvailable(tool.id)) {
			return null
		}
		return tool
	}

	public findToolOnMap(mapId: string, itemType: ItemType): { id: string, position: Position } | null {
		const mapItems = this.managers.loot.getMapItems(mapId)
		const tool = mapItems.find(item => item.itemType === itemType)
		if (!tool) {
			return null
		}
		return { id: tool.id, position: tool.position }
	}

	public getServerClient(mapId?: string): EventClient {
		return {
			id: 'server',
			currentGroup: mapId || 'GLOBAL',
			setGroup: () => {},
			emit: (to, event, data, groupName) => {
				this.managers.event.emit(to, event, data, groupName)
			}
		}
	}

	private handleSettlerDeath(settler: Settler): void {
		this.managers.event.emit(Receiver.All, PopulationEvents.SS.SettlerDied, { settlerId: settler.id })

		if (settler.houseId) {
			const occupants = this.houseOccupants.get(settler.houseId)
			occupants?.delete(settler.id)
		}

		this.managers.movement.unregisterEntity(settler.id)

		const serverClient = this.getServerClient(settler.mapId)
		const dropPosition = { ...settler.position }
		const carriedType = settler.stateContext.carryingItemType
		const carriedQuantity = typeof settler.stateContext.carryingQuantity === 'number'
			? settler.stateContext.carryingQuantity
			: 1
		if (carriedType && carriedQuantity > 0) {
			this.managers.loot.dropItem(
				{ id: uuidv4(), itemType: carriedType },
				dropPosition,
				serverClient,
				carriedQuantity
			)
		}
		const equippedType = settler.stateContext.equippedItemType
		const equippedQuantity = typeof settler.stateContext.equippedQuantity === 'number'
			? settler.stateContext.equippedQuantity
			: 1
		if (equippedType && equippedQuantity > 0) {
			this.managers.loot.dropItem(
				{ id: uuidv4(), itemType: equippedType },
				dropPosition,
				serverClient,
				equippedQuantity
			)
		}
		this.managers.loot.dropItem(
			{ id: uuidv4(), itemType: TOMBSTONE_ITEM_TYPE },
			dropPosition,
			serverClient,
			1,
			{ settlerId: settler.id }
		)

		this.settlers.delete(settler.id)

		this.managers.event.emit(Receiver.Group, PopulationEvents.SC.SettlerDied, { settlerId: settler.id }, settler.mapId)
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
			mapId: house.mapId,
			position: { ...house.position },
			profession: ProfessionType.Carrier,
			state: SettlerState.Idle,
			stateContext: {},
			health: 1,
			houseId: house.id,
			speed: SETTLER_SPEED,
			createdAt: this.simulationTimeMs
		}

		this.settlers.set(id, settler)
		this.getHouseOccupants(house.id).add(id)
		this.managers.movement.registerEntity({
			id: settler.id,
			position: settler.position,
			mapId: settler.mapId,
			speed: settler.speed
		})

			this.managers.event.emit(Receiver.Group, PopulationEvents.SC.SettlerSpawned, { settler }, settler.mapId)
			return settler
		}

	public spawnInitialPopulation(mapId: string, playerId: string, spawnPosition: Position): void {
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
					mapId,
					position,
					profession: popEntry.profession,
					state: SettlerState.Idle,
					stateContext: {},
					health: 1,
					speed: SETTLER_SPEED,
					createdAt: now
				}

				this.settlers.set(settlerId, settler)
				this.managers.movement.registerEntity({
					id: settler.id,
					position: settler.position,
					mapId: settler.mapId,
					speed: settler.speed
				})

					this.managers.event.emit(Receiver.Group, PopulationEvents.SC.SettlerSpawned, { settler }, mapId)
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
		return this.state.serialize()
	}

	deserialize(state: PopulationSnapshot): void {
		const restoredSettlers = this.state.deserialize(state)
		for (const restored of restoredSettlers) {
			this.managers.movement.registerEntity({
				id: restored.id,
				position: restored.position,
				mapId: restored.mapId,
				speed: restored.speed
			})
		}

	}

	reset(): void {
		this.state.reset()
	}

	private getEmptyByProfession(): Record<ProfessionType, number> {
		const byProfession = {} as Record<ProfessionType, number>
		Object.values(ProfessionType).forEach(profession => {
			byProfession[profession] = 0
		})
		return byProfession
	}
}

export * from './PopulationManagerState'
