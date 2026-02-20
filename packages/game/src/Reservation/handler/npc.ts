import type { ReservationHandlerContext } from '../handlerContext'
import { ReservationKind, type ReservationAcquireResult, type ReservationRef, type ReservationRequest } from '../types'

type NpcReservationRequest = Extract<ReservationRequest, { kind: ReservationKind.Npc }>
type NpcReservationResult = Extract<ReservationAcquireResult, { kind: ReservationKind.Npc }>
type NpcReservationRef = Extract<ReservationRef, { kind: ReservationKind.Npc }>

export const reserveNpcReservation = (
	request: NpcReservationRequest,
	context: ReservationHandlerContext
): NpcReservationResult | null => {
	const npc = context.managers.npc.getNPC(request.npcId)
	if (!npc || npc.active === false) {
		return null
	}
	const reservedBy = npc.attributes?.reservedBy
	if (reservedBy && reservedBy !== request.ownerId) {
		return null
	}

	context.managers.npc.setNPCAttribute(request.npcId, 'reservedBy', request.ownerId)
	return {
		kind: ReservationKind.Npc,
		ref: { kind: ReservationKind.Npc, npcId: request.npcId, ownerId: request.ownerId }
	}
}

export const releaseNpcReservation = (
	reservation: NpcReservationRef,
	context: ReservationHandlerContext
): void => {
	const npc = context.managers.npc.getNPC(reservation.npcId)
	const reservedBy = npc?.attributes?.reservedBy
	if (reservedBy === reservation.ownerId) {
		context.managers.npc.removeNPCAttribute(reservation.npcId, 'reservedBy')
	}
}
