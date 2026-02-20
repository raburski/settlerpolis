import { v4 as uuidv4 } from 'uuid'
import type { Position } from '../../types'
import type { ReservationHandlerContext } from '../handlerContext'
import type { AmenitySlotReservationResult } from '../types'
import { ReservationKind, type ReservationAcquireResult, type ReservationRef, type ReservationRequest } from '../types'

interface AmenitySlotReservation extends AmenitySlotReservationResult {
	buildingInstanceId: string
	settlerId: string
	createdAt: number
}

type AmenityReservationRequest = Extract<ReservationRequest, { kind: ReservationKind.Amenity }>
type AmenityReservationResult = Extract<ReservationAcquireResult, { kind: ReservationKind.Amenity }>
type AmenityReservationRef = Extract<ReservationRef, { kind: ReservationKind.Amenity }>

export const reserveAmenityReservation = (
	request: AmenityReservationRequest,
	context: ReservationHandlerContext
): AmenityReservationResult | null => {
	const positions = getAmenitySlotPositions(request.buildingInstanceId, context)
	if (!positions || positions.length === 0) {
		return null
	}

	const reservedSlots = getAmenitySlotsForBuilding(request.buildingInstanceId, context)
	let slotIndex = -1
	for (let index = 0; index < positions.length; index += 1) {
		if (!reservedSlots.has(index)) {
			slotIndex = index
			break
		}
	}
	if (slotIndex < 0) {
		return null
	}

	const reservationId = uuidv4()
	const reservation: AmenitySlotReservation = {
		reservationId,
		buildingInstanceId: request.buildingInstanceId,
		settlerId: request.settlerId,
		slotIndex,
		position: positions[slotIndex],
		createdAt: context.managers.simulation.getSimulationTimeMs()
	}

	context.state.amenityReservations.set(reservationId, reservation)
	reservedSlots.set(slotIndex, reservationId)

	return {
		kind: ReservationKind.Amenity,
		ref: { kind: ReservationKind.Amenity, reservationId },
		reservationId,
		slotIndex: reservation.slotIndex,
		position: reservation.position
	}
}

export const releaseAmenityReservation = (
	reservation: AmenityReservationRef,
	context: ReservationHandlerContext
): void => {
	const existing = context.state.amenityReservations.get(reservation.reservationId)
	if (!existing) {
		return
	}
	const reservedSlots = context.state.amenitySlotsByBuilding.get(existing.buildingInstanceId)
	reservedSlots?.delete(existing.slotIndex)
	context.state.amenityReservations.delete(reservation.reservationId)
}

const getAmenitySlotsForBuilding = (
	buildingInstanceId: string,
	context: ReservationHandlerContext
): Map<number, string> => {
	let reserved = context.state.amenitySlotsByBuilding.get(buildingInstanceId)
	if (!reserved) {
		reserved = new Map<number, string>()
		context.state.amenitySlotsByBuilding.set(buildingInstanceId, reserved)
	}
	return reserved
}

const getAmenitySlotPositions = (
	buildingInstanceId: string,
	context: ReservationHandlerContext
): Position[] | null => {
	const building = context.managers.buildings.getBuildingInstance(buildingInstanceId)
	if (!building) {
		return null
	}

	const definition = context.managers.buildings.getBuildingDefinition(building.buildingId)
	const slotConfig = definition?.amenitySlots
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
