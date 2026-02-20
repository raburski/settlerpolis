import type { ReservationHandlerContext } from '../handlerContext'
import { ReservationKind, type ReservationAcquireResult, type ReservationRef, type ReservationRequest } from '../types'

type NodeReservationRequest = Extract<ReservationRequest, { kind: ReservationKind.Node }>
type NodeReservationResult = Extract<ReservationAcquireResult, { kind: ReservationKind.Node }>
type NodeReservationRef = Extract<ReservationRef, { kind: ReservationKind.Node }>

export const reserveNodeReservation = (
	request: NodeReservationRequest,
	context: ReservationHandlerContext
): NodeReservationResult | null => {
	const success = context.managers.resourceNodes.reserveNode(request.nodeId, request.ownerId)
	if (!success) {
		return null
	}
	return {
		kind: ReservationKind.Node,
		ref: { kind: ReservationKind.Node, nodeId: request.nodeId, ownerId: request.ownerId }
	}
}

export const releaseNodeReservation = (
	reservation: NodeReservationRef,
	context: ReservationHandlerContext
): void => {
	context.managers.resourceNodes.releaseReservation(reservation.nodeId, reservation.ownerId)
}
