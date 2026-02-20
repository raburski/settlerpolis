import { ConstructionStage } from '../../Buildings/types'
import { v4 as uuidv4 } from 'uuid'
import type { ReservationHandlerContext } from '../handlerContext'
import {
	ReservationKind,
	type ReservationAcquireResult,
	type ReservationCommitRequest,
	type ReservationRef,
	type ReservationRequest
} from '../types'

interface HouseSlotReservation {
	reservationId: string
	houseId: string
	settlerId: string
	createdAt: number
}

type HouseReservationRequest = Extract<ReservationRequest, { kind: ReservationKind.House }>
type HouseReservationResult = Extract<ReservationAcquireResult, { kind: ReservationKind.House }>
type HouseReservationRef = Extract<ReservationRef, { kind: ReservationKind.House }>
type HouseReservationCommitRequest = Extract<ReservationCommitRequest, { kind: ReservationKind.House }>

export const canReserveHouseSlot = (houseId: string, context: ReservationHandlerContext): boolean => {
	const capacity = getHouseCapacity(houseId, context)
	if (capacity <= 0) {
		return false
	}
	const occupants = context.managers.population.getHouseOccupantCount(houseId)
	const reserved = getHouseReservationsForHouse(houseId, context).size
	return occupants + reserved < capacity
}

export const reserveHouseReservation = (
	request: HouseReservationRequest,
	context: ReservationHandlerContext
): HouseReservationResult | null => {
	const reservedByHouse = getHouseReservationsForHouse(request.houseId, context)
	const existing = reservedByHouse.get(request.settlerId)
	if (existing) {
		return {
			kind: ReservationKind.House,
			ref: { kind: ReservationKind.House, reservationId: existing },
			reservationId: existing
		}
	}

	if (!canReserveHouseSlot(request.houseId, context)) {
		return null
	}

	const reservationId = uuidv4()
	const reservation: HouseSlotReservation = {
		reservationId,
		houseId: request.houseId,
		settlerId: request.settlerId,
		createdAt: context.managers.simulation.getSimulationTimeMs()
	}

	context.state.houseReservations.set(reservationId, reservation)
	reservedByHouse.set(request.settlerId, reservationId)

	return {
		kind: ReservationKind.House,
		ref: { kind: ReservationKind.House, reservationId },
		reservationId
	}
}

export const releaseHouseReservation = (
	reservation: HouseReservationRef,
	context: ReservationHandlerContext
): void => {
	releaseHouseReservationById(reservation.reservationId, context)
}

export const commitHouseReservation = (
	request: HouseReservationCommitRequest,
	context: ReservationHandlerContext
): boolean => {
	const reservation = context.state.houseReservations.get(request.reservationId)
	if (!reservation) {
		return false
	}

	if (request.expectedHouseId && reservation.houseId !== request.expectedHouseId) {
		releaseHouseReservationById(request.reservationId, context)
		return false
	}

	const success = context.managers.population.moveSettlerToHouse(reservation.settlerId, reservation.houseId)
	if (!success) {
		releaseHouseReservationById(request.reservationId, context)
		return false
	}

	releaseHouseReservationById(request.reservationId, context)
	return true
}

const releaseHouseReservationById = (
	reservationId: string,
	context: ReservationHandlerContext
): void => {
	const reservation = context.state.houseReservations.get(reservationId)
	if (!reservation) {
		return
	}

	const reservedByHouse = context.state.houseReservationsByHouse.get(reservation.houseId)
	reservedByHouse?.delete(reservation.settlerId)
	context.state.houseReservations.delete(reservationId)
}

const getHouseReservationsForHouse = (
	houseId: string,
	context: ReservationHandlerContext
): Map<string, string> => {
	let reserved = context.state.houseReservationsByHouse.get(houseId)
	if (!reserved) {
		reserved = new Map<string, string>()
		context.state.houseReservationsByHouse.set(houseId, reserved)
	}
	return reserved
}

const getHouseCapacity = (houseId: string, context: ReservationHandlerContext): number => {
	const building = context.managers.buildings.getBuildingInstance(houseId)
	if (!building || building.stage !== ConstructionStage.Completed) {
		return 0
	}

	const definition = context.managers.buildings.getBuildingDefinition(building.buildingId)
	if (!definition?.spawnsSettlers) {
		return 0
	}

	return definition.maxOccupants ?? 0
}
