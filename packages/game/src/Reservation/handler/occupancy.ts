import { v4 as uuidv4 } from 'uuid'
import type { Position } from '../../types'
import type { ReservationHandlerContext } from '../handlerContext'
import type { OccupancySlotReservationResult } from '../types'
import { ReservationKind, type ReservationAcquireResult, type ReservationRef, type ReservationRequest } from '../types'
import type { BuildingDefinition } from '../../Buildings/types'

interface OccupancySlotReservation extends OccupancySlotReservationResult {
	buildingInstanceId: string
	settlerId: string
	createdAt: number
}

type OccupancyReservationRequest = Extract<ReservationRequest, { kind: ReservationKind.Occupancy }>
type OccupancyReservationResult = Extract<ReservationAcquireResult, { kind: ReservationKind.Occupancy }>
type OccupancyReservationRef = Extract<ReservationRef, { kind: ReservationKind.Occupancy }>

export const reserveOccupancyReservation = (
	request: OccupancyReservationRequest,
	context: ReservationHandlerContext
): OccupancyReservationResult | null => {
	const building = context.managers.buildings.getBuildingInstance(request.buildingInstanceId)
	if (!building) {
		return null
	}
	const definition = context.managers.buildings.getBuildingDefinition(building.buildingId)
	if (!definition) {
		return null
	}
	const outsidePositions = getOutsideSlotPositions(building.id, definition, context) ?? []
	const capacities = resolveCapacities(definition, outsidePositions.length)
	if (capacities.totalCapacity <= 0) {
		return null
	}
	const counts = getOccupancyReservationCounts(building.id, context)
	if (counts.total >= capacities.totalCapacity) {
		return null
	}

	const reserveInside = (): OccupancyReservationResult | null => {
		if (capacities.insideCapacity <= 0 || counts.inside >= capacities.insideCapacity) {
			return null
		}
		const insidePosition = getInsidePosition(building.id, context)
		const reservationId = uuidv4()
		const reservation: OccupancySlotReservation = {
			reservationId,
			mode: 'inside',
			buildingInstanceId: request.buildingInstanceId,
			settlerId: request.settlerId,
			slotIndex: -1,
			position: insidePosition,
			createdAt: context.managers.simulation.getSimulationTimeMs()
		}
		context.state.occupancyReservations.set(reservationId, reservation)
		return {
			kind: ReservationKind.Occupancy,
			ref: { kind: ReservationKind.Occupancy, reservationId },
			reservationId,
			mode: 'inside',
			slotIndex: -1,
			position: insidePosition
		}
	}

	const reserveOutside = (): OccupancyReservationResult | null => {
		if (outsidePositions.length === 0 || capacities.outsideCapacity <= 0 || counts.outside >= capacities.outsideCapacity) {
			return null
		}
		const reservedSlots = getOutsideSlotsForBuilding(request.buildingInstanceId, context)
		let slotIndex = -1
		for (let index = 0; index < outsidePositions.length; index += 1) {
			if (!reservedSlots.has(index)) {
				slotIndex = index
				break
			}
		}
		if (slotIndex < 0) {
			return null
		}

		const reservationId = uuidv4()
		const reservation: OccupancySlotReservation = {
			reservationId,
			mode: 'outside',
			buildingInstanceId: request.buildingInstanceId,
			settlerId: request.settlerId,
			slotIndex,
			position: outsidePositions[slotIndex],
			createdAt: context.managers.simulation.getSimulationTimeMs()
		}

		context.state.occupancyReservations.set(reservationId, reservation)
		reservedSlots.set(slotIndex, reservationId)

		return {
			kind: ReservationKind.Occupancy,
			ref: { kind: ReservationKind.Occupancy, reservationId },
			reservationId,
			mode: 'outside',
			slotIndex: reservation.slotIndex,
			position: reservation.position
		}
	}

	if (request.mode === 'inside') {
		return reserveInside()
	}
	if (request.mode === 'outside') {
		return reserveOutside()
	}
	return reserveOutside() ?? reserveInside()
}

export const releaseOccupancyReservation = (
	reservation: OccupancyReservationRef,
	context: ReservationHandlerContext
): void => {
	const existing = context.state.occupancyReservations.get(reservation.reservationId)
	if (!existing) {
		return
	}
	if (existing.mode === 'outside' && typeof existing.slotIndex === 'number' && existing.slotIndex >= 0) {
		const reservedSlots = context.state.occupancySlotsByBuilding.get(existing.buildingInstanceId)
		reservedSlots?.delete(existing.slotIndex)
		if (reservedSlots && reservedSlots.size === 0) {
			context.state.occupancySlotsByBuilding.delete(existing.buildingInstanceId)
		}
	}
	context.state.occupancyReservations.delete(reservation.reservationId)
}

const getOutsideSlotsForBuilding = (
	buildingInstanceId: string,
	context: ReservationHandlerContext
): Map<number, string> => {
	let reserved = context.state.occupancySlotsByBuilding.get(buildingInstanceId)
	if (!reserved) {
		reserved = new Map<number, string>()
		context.state.occupancySlotsByBuilding.set(buildingInstanceId, reserved)
	}
	return reserved
}

const getOutsideSlotPositions = (
	buildingInstanceId: string,
	definition: BuildingDefinition,
	context: ReservationHandlerContext
): Position[] | null => {
	const building = context.managers.buildings.getBuildingInstance(buildingInstanceId)
	if (!building) {
		return null
	}

	const slotConfig = definition.occupancy?.outsideSlots
	if (!slotConfig || slotConfig.count <= 0) {
		return null
	}

	const tileSize = getTileSize(building.mapId, context)
	const maxSlots = definition.footprint.width * definition.footprint.height
	const slotCount = Math.min(slotConfig.count, maxSlots)
	const offsets = getSlotOffsets(slotConfig.offsets, slotCount, definition.footprint.width)

	return offsets.map(offset => ({
		x: building.position.x + offset.x * tileSize,
		y: building.position.y + offset.y * tileSize
		}))
}

const resolveCapacities = (
	definition: BuildingDefinition,
	outsideSlotsCount: number
): { totalCapacity: number, insideCapacity: number, outsideCapacity: number } => {
	const insideCapacity = Math.max(0, Math.floor(definition.occupancy?.insideCapacity ?? 0))
	const outsideCapacity = Math.max(0, Math.floor(outsideSlotsCount))
	const defaultTotal = insideCapacity + outsideCapacity
	const totalCapacity = Math.max(0, Math.floor(definition.occupancy?.totalCapacity ?? defaultTotal))
	return {
		totalCapacity,
		insideCapacity: Math.min(insideCapacity, totalCapacity),
		outsideCapacity: Math.min(outsideCapacity, totalCapacity)
	}
}

const getOccupancyReservationCounts = (
	buildingInstanceId: string,
	context: ReservationHandlerContext
): { total: number, inside: number, outside: number } => {
	let total = 0
	let inside = 0
	let outside = 0
	for (const reservation of context.state.occupancyReservations.values()) {
		if (reservation.buildingInstanceId !== buildingInstanceId) {
			continue
		}
		total += 1
		if (reservation.mode === 'inside') {
			inside += 1
		} else {
			outside += 1
		}
	}
	return { total, inside, outside }
}

const getInsidePosition = (
	buildingInstanceId: string,
	context: ReservationHandlerContext
): Position => {
	const access = context.managers.buildings.getBuildingAccessPoints(buildingInstanceId)
	if (access?.center) {
		return access.center
	}
	if (access?.entry) {
		return access.entry
	}
	const building = context.managers.buildings.getBuildingInstance(buildingInstanceId)
	return building?.position ?? { x: 0, y: 0 }
}

const getSlotOffsets = (
	offsets: Array<{ x: number, y: number }> | undefined,
	slotCount: number,
	footprintWidth: number
): Array<{ x: number, y: number }> => {
	if (offsets && offsets.length > 0) {
		return offsets.slice(0, slotCount)
	}

	const generatedOffsets: Array<{ x: number, y: number }> = []
	for (let index = 0; index < slotCount; index += 1) {
		const col = index % footprintWidth
		const row = Math.floor(index / footprintWidth)
		generatedOffsets.push({ x: col, y: row })
	}
	return generatedOffsets
}

const getTileSize = (mapId: string, context: ReservationHandlerContext): number => {
	const map = context.managers.map.getMap(mapId)
	return map?.tiledMap.tilewidth || 32
}
