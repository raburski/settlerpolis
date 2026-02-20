import type { ReservationHandlerContext } from '../handlerContext'
import { ReservationKind, type ReservationAcquireResult, type ReservationRef, type ReservationRequest } from '../types'

type ToolReservationRequest = Extract<ReservationRequest, { kind: ReservationKind.Tool }>
type ToolReservationResult = Extract<ReservationAcquireResult, { kind: ReservationKind.Tool }>
type ToolReservationRef = Extract<ReservationRef, { kind: ReservationKind.Tool }>

export const reserveToolReservation = (
	request: ToolReservationRequest,
	context: ReservationHandlerContext
): ToolReservationResult | null => {
	const toolItemType = context.managers.population.getToolItemType(request.profession)
	if (!toolItemType) {
		return null
	}

	const settler = context.managers.population.getSettler(request.ownerId)
	const mapItems = context.managers.loot.getMapItems(request.mapId)
		.filter(item => item.itemType === toolItemType && context.managers.loot.isItemAvailable(item.id))

	for (const tool of mapItems) {
		if (settler) {
			const path = context.managers.map.findPath(request.mapId, settler.position, tool.position, {
				allowDiagonal: true
			})
			if (!path || path.length === 0) {
				continue
			}
		}

		if (!context.managers.loot.reserveItem(tool.id, request.ownerId)) {
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

export const releaseToolReservation = (
	reservation: ToolReservationRef,
	context: ReservationHandlerContext
): void => {
	context.managers.loot.releaseReservation(reservation.itemId)
}
