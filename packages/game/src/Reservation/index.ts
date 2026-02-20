import type { StorageManager } from '../Storage'
import type { LootManager } from '../Loot'
import type { ResourceNodesManager } from '../ResourceNodes'
import type { Position } from '../types'
import type { PopulationManager } from '../Population'
import type { BuildingManager } from '../Buildings'
import { ConstructionStage } from '../Buildings/types'
import type { MapManager } from '../Map'
import type { NPCManager } from '../NPC'
import { BaseManager } from '../Managers'
import { v4 as uuidv4 } from 'uuid'
import type { SimulationManager } from '../Simulation'
import type { ReservationSnapshot } from '../state/types'
import { ReservationSystemState } from './ReservationSystemState'
import type {
	ReservationAcquireResult,
	ReservationCommitRequest,
	ReservationRef,
	ReservationRequest
} from './types'
import { ReservationKind } from './types'

export interface ReservationSystemDeps {
	storage: StorageManager
	loot: LootManager
	resourceNodes: ResourceNodesManager
	population: PopulationManager
	buildings: BuildingManager
	map: MapManager
	npc: NPCManager
	simulation: SimulationManager
}

export interface AmenitySlotReservationResult {
	reservationId: string
	slotIndex: number
	position: Position
}

interface AmenitySlotReservation extends AmenitySlotReservationResult {
	buildingInstanceId: string
	settlerId: string
	createdAt: number
}

interface HouseSlotReservation {
	reservationId: string
	houseId: string
	settlerId: string
	createdAt: number
}

export class ReservationSystem extends BaseManager<ReservationSystemDeps> {
	private readonly state = new ReservationSystemState()

	constructor(managers: ReservationSystemDeps) {
		super(managers)
	}

	public reserve(request: ReservationRequest): ReservationAcquireResult | null {
		switch (request.kind) {
			case ReservationKind.Tool: {
				const toolItemType = this.managers.population.getToolItemType(request.profession)
				if (!toolItemType) {
					return null
				}

				const settler = this.managers.population.getSettler(request.ownerId)
				const mapItems = this.managers.loot.getMapItems(request.mapId)
					.filter(item => item.itemType === toolItemType && this.managers.loot.isItemAvailable(item.id))

				for (const tool of mapItems) {
					if (settler) {
						const path = this.managers.map.findPath(request.mapId, settler.position, tool.position, {
							allowDiagonal: true
						})
						if (!path || path.length === 0) {
							continue
						}
					}

					if (!this.managers.loot.reserveItem(tool.id, request.ownerId)) {
						continue
					}

					return {
						kind: ReservationKind.Tool,
						ref: { kind: ReservationKind.Tool, itemId: tool.id },
						itemId: tool.id,
						position: tool.position
					}
				}
				return null
			}
			case ReservationKind.Loot: {
				const success = this.managers.loot.reserveItem(request.itemId, request.ownerId)
				if (!success) {
					return null
				}
				return {
					kind: ReservationKind.Loot,
					ref: { kind: ReservationKind.Loot, itemId: request.itemId, ownerId: request.ownerId }
				}
			}
			case ReservationKind.Node: {
				const success = this.managers.resourceNodes.reserveNode(request.nodeId, request.ownerId)
				if (!success) {
					return null
				}
				return {
					kind: ReservationKind.Node,
					ref: { kind: ReservationKind.Node, nodeId: request.nodeId, ownerId: request.ownerId }
				}
			}
			case ReservationKind.Storage: {
				const result = this.managers.storage.reserveStorage(
					request.buildingInstanceId,
					request.itemType,
					request.quantity,
					request.ownerId,
					request.direction === 'outgoing',
					request.allowInternal === true
				)
				if (!result) {
					return null
				}
				return {
					kind: ReservationKind.Storage,
					ref: { kind: ReservationKind.Storage, reservationId: result.reservationId },
					reservationId: result.reservationId,
					slotId: result.slotId,
					position: result.position,
					quantity: result.quantity
				}
			}
			case ReservationKind.Amenity: {
				const amenity = this.reserveAmenitySlot(request.buildingInstanceId, request.settlerId)
				if (!amenity) {
					return null
				}
				return {
					kind: ReservationKind.Amenity,
					ref: { kind: ReservationKind.Amenity, reservationId: amenity.reservationId },
					reservationId: amenity.reservationId,
					slotIndex: amenity.slotIndex,
					position: amenity.position
				}
			}
			case ReservationKind.House: {
				const reservationId = this.reserveHouseSlot(request.houseId, request.settlerId)
				if (!reservationId) {
					return null
				}
				return {
					kind: ReservationKind.House,
					ref: { kind: ReservationKind.House, reservationId },
					reservationId
				}
			}
			case ReservationKind.Npc: {
				const npc = this.managers.npc.getNPC(request.npcId)
				if (!npc || npc.active === false) {
					return null
				}
				const reservedBy = npc.attributes?.reservedBy
				if (reservedBy && reservedBy !== request.ownerId) {
					return null
				}
				this.managers.npc.setNPCAttribute(request.npcId, 'reservedBy', request.ownerId)
				return {
					kind: ReservationKind.Npc,
					ref: { kind: ReservationKind.Npc, npcId: request.npcId, ownerId: request.ownerId }
				}
			}
			default:
				return null
		}
	}

	public release(reservation: ReservationRef): void {
		switch (reservation.kind) {
			case ReservationKind.Storage:
				this.managers.storage.releaseReservation(reservation.reservationId)
				return
			case ReservationKind.Loot:
				this.managers.loot.releaseReservation(reservation.itemId, reservation.ownerId)
				return
			case ReservationKind.Tool:
				this.managers.loot.releaseReservation(reservation.itemId)
				return
			case ReservationKind.Node:
				this.managers.resourceNodes.releaseReservation(reservation.nodeId, reservation.ownerId)
				return
			case ReservationKind.Amenity:
				this.releaseAmenitySlot(reservation.reservationId)
				return
			case ReservationKind.House:
				this.releaseHouseReservation(reservation.reservationId)
				return
			case ReservationKind.Npc: {
				const npc = this.managers.npc.getNPC(reservation.npcId)
				const reservedBy = npc?.attributes?.reservedBy
				if (reservedBy === reservation.ownerId) {
					this.managers.npc.removeNPCAttribute(reservation.npcId, 'reservedBy')
				}
				return
			}
			default:
				return
		}
	}

	public releaseMany(reservations: ReservationRef[]): void {
		for (const reservation of reservations) {
			this.release(reservation)
		}
	}

	public commit(request: ReservationCommitRequest): boolean {
		if (request.kind !== ReservationKind.House) {
			return false
		}
		return this.commitHouseReservation(request.reservationId, request.expectedHouseId)
	}

	private reserveAmenitySlot(buildingInstanceId: string, settlerId: string): AmenitySlotReservationResult | null {
		const positions = this.getAmenitySlotPositions(buildingInstanceId)
		if (!positions || positions.length === 0) {
			return null
		}

		const reservedSlots = this.getAmenitySlotsForBuilding(buildingInstanceId)
		let slotIndex = -1
		for (let i = 0; i < positions.length; i++) {
			if (!reservedSlots.has(i)) {
				slotIndex = i
				break
			}
		}

		if (slotIndex < 0) {
			return null
		}

		const reservationId = uuidv4()
		const reservation: AmenitySlotReservation = {
			reservationId,
			buildingInstanceId,
			settlerId,
			slotIndex,
			position: positions[slotIndex],
			createdAt: this.managers.simulation.getSimulationTimeMs()
		}

		this.state.amenityReservations.set(reservationId, reservation)
		reservedSlots.set(slotIndex, reservationId)

		return {
			reservationId,
			slotIndex,
			position: reservation.position
		}
	}

	private releaseAmenitySlot(reservationId: string): void {
		const reservation = this.state.amenityReservations.get(reservationId)
		if (!reservation) {
			return
		}

		const reservedSlots = this.state.amenitySlotsByBuilding.get(reservation.buildingInstanceId)
		reservedSlots?.delete(reservation.slotIndex)
		this.state.amenityReservations.delete(reservationId)
	}

	public canReserveHouseSlot(houseId: string): boolean {
		const capacity = this.getHouseCapacity(houseId)
		if (capacity <= 0) {
			return false
		}
		const occupants = this.managers.population.getHouseOccupantCount(houseId)
		const reserved = this.getHouseReservationsForHouse(houseId).size
		return occupants + reserved < capacity
	}

	private reserveHouseSlot(houseId: string, settlerId: string): string | null {
		const reservedByHouse = this.getHouseReservationsForHouse(houseId)
		const existing = reservedByHouse.get(settlerId)
		if (existing) {
			return existing
		}

		if (!this.canReserveHouseSlot(houseId)) {
			return null
		}

		const reservationId = uuidv4()
		const reservation: HouseSlotReservation = {
			reservationId,
			houseId,
			settlerId,
			createdAt: this.managers.simulation.getSimulationTimeMs()
		}

		this.state.houseReservations.set(reservationId, reservation)
		reservedByHouse.set(settlerId, reservationId)
		return reservationId
	}

	private releaseHouseReservation(reservationId: string): void {
		const reservation = this.state.houseReservations.get(reservationId)
		if (!reservation) {
			return
		}

		const reservedByHouse = this.state.houseReservationsByHouse.get(reservation.houseId)
		reservedByHouse?.delete(reservation.settlerId)
		this.state.houseReservations.delete(reservationId)
	}

	private commitHouseReservation(reservationId: string, expectedHouseId?: string): boolean {
		const reservation = this.state.houseReservations.get(reservationId)
		if (!reservation) {
			return false
		}
		if (expectedHouseId && reservation.houseId !== expectedHouseId) {
			this.releaseHouseReservation(reservationId)
			return false
		}

		const success = this.managers.population.moveSettlerToHouse(reservation.settlerId, reservation.houseId)
		if (!success) {
			this.releaseHouseReservation(reservationId)
			return false
		}

		this.releaseHouseReservation(reservationId)
		return true
	}

	private getAmenitySlotsForBuilding(buildingInstanceId: string): Map<number, string> {
		let reserved = this.state.amenitySlotsByBuilding.get(buildingInstanceId)
		if (!reserved) {
			reserved = new Map<number, string>()
			this.state.amenitySlotsByBuilding.set(buildingInstanceId, reserved)
		}
		return reserved
	}

	private getHouseReservationsForHouse(houseId: string): Map<string, string> {
		let reserved = this.state.houseReservationsByHouse.get(houseId)
		if (!reserved) {
			reserved = new Map<string, string>()
			this.state.houseReservationsByHouse.set(houseId, reserved)
		}
		return reserved
	}

	private getAmenitySlotPositions(buildingInstanceId: string): Position[] | null {
		const building = this.managers.buildings.getBuildingInstance(buildingInstanceId)
		if (!building) {
			return null
		}

		const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
		const slotConfig = definition?.amenitySlots
		if (!slotConfig || slotConfig.count <= 0) {
			return null
		}

		const tileSize = this.getTileSize(building.mapId)
		const maxSlots = definition.footprint.width * definition.footprint.height
		const slotCount = Math.min(slotConfig.count, maxSlots)

		let offsets: Array<{ x: number, y: number }> = []
		if (slotConfig.offsets && slotConfig.offsets.length > 0) {
			offsets = slotConfig.offsets.slice(0, slotCount)
		} else {
			for (let i = 0; i < slotCount; i++) {
				const col = i % definition.footprint.width
				const row = Math.floor(i / definition.footprint.width)
				offsets.push({ x: col, y: row })
			}
		}

		return offsets.map(offset => ({
			x: building.position.x + offset.x * tileSize,
			y: building.position.y + offset.y * tileSize
		}))
	}

	private getTileSize(mapId: string): number {
		const map = this.managers.map.getMap(mapId)
		return map?.tiledMap.tilewidth || 32
	}

	private getHouseCapacity(houseId: string): number {
		const building = this.managers.buildings.getBuildingInstance(houseId)
		if (!building || building.stage !== ConstructionStage.Completed) {
			return 0
		}
		const definition = this.managers.buildings.getBuildingDefinition(building.buildingId)
		if (!definition?.spawnsSettlers) {
			return 0
		}
		return definition.maxOccupants ?? 0
	}

	serialize(): ReservationSnapshot {
		return this.state.serialize()
	}

	deserialize(state: ReservationSnapshot): void {
		this.state.deserialize(state)
	}

	reset(): void {
		this.state.reset()
	}
}

export * from './ReservationSystemState'
export * from './types'
