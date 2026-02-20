import type { ReservationHandlerContext } from '../handlerContext'
import { ReservationKind, type ReservationAcquireResult, type ReservationRef, type ReservationRequest } from '../types'

type StorageReservationRequest = Extract<ReservationRequest, { kind: ReservationKind.Storage }>
type StorageReservationResult = Extract<ReservationAcquireResult, { kind: ReservationKind.Storage }>
type StorageReservationRef = Extract<ReservationRef, { kind: ReservationKind.Storage }>

export const reserveStorageReservation = (
	request: StorageReservationRequest,
	context: ReservationHandlerContext
): StorageReservationResult | null => {
	const result = context.managers.storage.reserveStorage(
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

export const releaseStorageReservation = (
	reservation: StorageReservationRef,
	context: ReservationHandlerContext
): void => {
	context.managers.storage.releaseReservation(reservation.reservationId)
}
