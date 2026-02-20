import type { ReservationHandlerContext } from '../handlerContext'
import { ReservationKind, type ReservationAcquireResult, type ReservationRef, type ReservationRequest } from '../types'

type LootReservationRequest = Extract<ReservationRequest, { kind: ReservationKind.Loot }>
type LootReservationResult = Extract<ReservationAcquireResult, { kind: ReservationKind.Loot }>
type LootReservationRef = Extract<ReservationRef, { kind: ReservationKind.Loot }>

export const reserveLootReservation = (
	request: LootReservationRequest,
	context: ReservationHandlerContext
): LootReservationResult | null => {
	const success = context.managers.loot.reserveItem(request.itemId, request.ownerId)
	if (!success) {
		return null
	}
	return {
		kind: ReservationKind.Loot,
		ref: { kind: ReservationKind.Loot, itemId: request.itemId, ownerId: request.ownerId }
	}
}

export const releaseLootReservation = (
	reservation: LootReservationRef,
	context: ReservationHandlerContext
): void => {
	context.managers.loot.releaseReservation(reservation.itemId, reservation.ownerId)
}
