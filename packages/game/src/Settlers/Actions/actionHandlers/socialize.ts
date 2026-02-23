import { MoveTargetType } from '../../../Movement/types'
import { ReservationKind } from '../../../Reservation'
import type { ReservationRef } from '../../../Reservation'
import { SettlerActionFailureReason } from '../../failureReasons'
import { SettlerActionType } from '../types'
import type { ActionHandler } from './types'

export const SocializeActionHandler: ActionHandler = {
	type: SettlerActionType.Socialize,
	start: ({ settlerId, action, managers, nowMs, setInProgress, fail }) => {
		if (action.type !== SettlerActionType.Socialize) {
			return
		}

		const building = managers.buildings.getBuildingInstance(action.buildingInstanceId)
		if (!building) {
			fail(SettlerActionFailureReason.BuildingNotFound)
			return
		}

		const definition = managers.buildings.getBuildingDefinition(building.buildingId)
		if (!definition?.socialVenue) {
			fail(SettlerActionFailureReason.WrongTarget)
			return
		}

		if (!action.reservationRefs) {
			action.reservationRefs = []
		}

		const beginDwell = () => {
			setInProgress({
				type: SettlerActionType.Socialize,
				endAtMs: nowMs + Math.max(0, action.durationMs)
			})
		}

		const acquireOutside = (): { reservationId: string, position: { x: number, y: number } } | null => {
			const existingId = action.occupancySlot?.reservationId
			const existingPos = action.occupancySlot?.position
			if (existingId && existingPos) {
				ensureOccupancyRef(action.reservationRefs!, existingId)
				return { reservationId: existingId, position: existingPos }
			}
			const occupancyReservation = managers.reservations.reserve({
				kind: ReservationKind.Occupancy,
				buildingInstanceId: building.id,
				settlerId,
				mode: 'outside'
			})
			if (!occupancyReservation || occupancyReservation.kind !== ReservationKind.Occupancy) {
				return null
			}
			action.reservationRefs!.push(occupancyReservation.ref)
			action.occupancySlot = {
				reservationId: occupancyReservation.reservationId,
				position: occupancyReservation.position
			}
			return {
				reservationId: occupancyReservation.reservationId,
				position: occupancyReservation.position
			}
		}

		const acquireInside = (): { reservationId: string, position: { x: number, y: number } } | null => {
			const occupancyReservation = managers.reservations.reserve({
				kind: ReservationKind.Occupancy,
				buildingInstanceId: building.id,
				settlerId,
				mode: 'inside'
			})
			if (!occupancyReservation || occupancyReservation.kind !== ReservationKind.Occupancy) {
				return null
			}
			action.reservationRefs!.push(occupancyReservation.ref)
			action.occupancySlot = undefined
			return {
				reservationId: occupancyReservation.reservationId,
				position: occupancyReservation.position
			}
		}

		const moveOutsideAndDwell = (reservationId: string, position: { x: number, y: number }) => {
			managers.population.setSettlerInsideBuilding(settlerId, undefined)
			managers.population.setSettlerTarget(settlerId, reservationId, position, MoveTargetType.OccupancySlot)
			const started = managers.movement.moveToPosition(settlerId, position, {
				targetType: MoveTargetType.OccupancySlot,
				targetId: reservationId,
				callbacks: {
					onPathComplete: () => beginDwell(),
					onCancelled: () => fail(SettlerActionFailureReason.MovementCancelled)
				}
			})
			if (!started) {
				beginDwell()
			}
		}

		const moveInsideAndDwell = (_reservationId: string) => {
			const access = managers.buildings.getBuildingAccessPoints(building.id)
			const target = access?.center ?? access?.entry ?? building.position
			managers.population.setSettlerTarget(settlerId, building.id, target, MoveTargetType.Building)
			const started = managers.movement.moveToPosition(settlerId, target, {
				targetType: MoveTargetType.Building,
				targetId: building.id,
				callbacks: {
					onPathComplete: () => {
						managers.population.setSettlerInsideBuilding(settlerId, building.id)
						beginDwell()
					},
					onCancelled: () => fail(SettlerActionFailureReason.MovementCancelled)
				}
			})
			if (!started) {
				managers.population.setSettlerInsideBuilding(settlerId, building.id)
				beginDwell()
			}
		}

		const preferredMode = action.mode === 'inside' ? 'inside' : 'outside'
		if (preferredMode === 'outside') {
			const outside = acquireOutside()
			if (outside) {
				moveOutsideAndDwell(outside.reservationId, outside.position)
				return
			}
			const inside = acquireInside()
			if (inside) {
				moveInsideAndDwell(inside.reservationId)
				return
			}
		} else {
			const inside = acquireInside()
			if (inside) {
				moveInsideAndDwell(inside.reservationId)
				return
			}
			const outside = acquireOutside()
			if (outside) {
				moveOutsideAndDwell(outside.reservationId, outside.position)
				return
			}
		}

		// Reservation failed in all supported modes - do not attempt movement.
		managers.population.setSettlerInsideBuilding(settlerId, undefined)
		managers.population.setSettlerTarget(settlerId, undefined, undefined, undefined)
		releaseOccupancyRefs(action.reservationRefs, managers.reservations)
		action.reservationRefs = []
		action.occupancySlot = undefined
		fail(SettlerActionFailureReason.VenueFull)
	},
	onComplete: ({ settlerId, action, managers }) => {
		managers.population.setSettlerInsideBuilding(settlerId, undefined)
		managers.population.setSettlerTarget(settlerId, undefined, undefined, undefined)
		if (action.type !== SettlerActionType.Socialize) {
			return
		}
		releaseOccupancyRefs(action.reservationRefs, managers.reservations)
		action.reservationRefs = []
		action.occupancySlot = undefined
	},
	onFail: ({ settlerId, action, managers }) => {
		managers.population.setSettlerInsideBuilding(settlerId, undefined)
		managers.population.setSettlerTarget(settlerId, undefined, undefined, undefined)
		if (action.type !== SettlerActionType.Socialize) {
			return
		}
		releaseOccupancyRefs(action.reservationRefs, managers.reservations)
		action.reservationRefs = []
		action.occupancySlot = undefined
	}
}

const ensureOccupancyRef = (refs: ReservationRef[], reservationId: string): void => {
	const hasRef = refs.some((ref) =>
		ref.kind === ReservationKind.Occupancy && ref.reservationId === reservationId
	)
	if (!hasRef) {
		refs.push({
			kind: ReservationKind.Occupancy,
			reservationId
		})
	}
}

const releaseOccupancyRefs = (
	refs: ReservationRef[] | undefined,
	reservations: { release: (ref: ReservationRef) => void }
): void => {
	if (!refs || refs.length === 0) {
		return
	}
	for (const ref of refs) {
		if (ref.kind !== ReservationKind.Occupancy) {
			continue
		}
		reservations.release(ref)
	}
}
