import { SettlerState } from '../../../Population/types'
import { TransportSourceType, TransportTargetType, WorkActionType, WorkStepType } from '../types'
import type { TransportSource } from '../types'
import type { StepHandler, StepHandlerResult } from './types'

export const TransportHandler: StepHandler = {
	type: WorkStepType.Transport,
	build: ({ step, assignment, managers, reservationSystem }): StepHandlerResult => {
		if (step.type !== WorkStepType.Transport) {
			return { actions: [] }
		}

		const settler = managers.population.getSettler(assignment.settlerId)
		if (!settler) {
			return { actions: [] }
		}

		const targetBuilding = managers.buildings.getBuildingInstance(step.target.buildingInstanceId)
		if (!targetBuilding) {
			return { actions: [] }
		}

		const releaseFns: Array<() => void> = []
		const roadData = managers.roads.getRoadData(settler.mapName) || undefined

		const canReach = (from: { x: number, y: number }, to: { x: number, y: number }) => {
			const path = managers.map.findPath(settler.mapName, from, to, { roadData, allowDiagonal: true })
			return path && path.length > 0
		}

		if (step.source.type === TransportSourceType.Ground) {
			const source = step.source as Extract<TransportSource, { type: TransportSourceType.Ground }>
			const reserved = reservationSystem.reserveLootItem(source.itemId, assignment.assignmentId)
			if (!reserved) {
				return { actions: [{ type: WorkActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
			}
			releaseFns.push(() => reservationSystem.releaseLootReservation(source.itemId, assignment.assignmentId))

			let targetReservationId: string | null = null
			let targetPosition = targetBuilding.position
			if (step.target.type === TransportTargetType.Storage) {
				const reservation = reservationSystem.reserveStorageIncoming(step.target.buildingInstanceId, step.itemType, step.quantity, assignment.assignmentId)
				if (!reservation) {
					releaseFns.forEach(fn => fn())
					return { actions: [{ type: WorkActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
				}
				targetReservationId = reservation.reservationId
				targetPosition = reservation.position
				releaseFns.push(() => reservationSystem.releaseStorageReservation(reservation.reservationId))
			}

			if (!canReach(settler.position, source.position)) {
				releaseFns.forEach(fn => fn())
				return { actions: [{ type: WorkActionType.Wait, durationMs: 2000, setState: SettlerState.WaitingForWork }] }
			}

			if (!canReach(source.position, targetPosition)) {
				const fallback = managers.map.findNearestWalkablePosition(settler.mapName, targetPosition, 2)
				if (fallback && canReach(source.position, fallback)) {
					targetPosition = fallback
				} else {
					releaseFns.forEach(fn => fn())
					return { actions: [{ type: WorkActionType.Wait, durationMs: 2000, setState: SettlerState.WaitingForWork }] }
				}
			}

			return {
				actions: [
					{ type: WorkActionType.Move, position: source.position, targetType: 'item', targetId: source.itemId, setState: SettlerState.MovingToItem },
					{ type: WorkActionType.PickupLoot, itemId: source.itemId, setState: SettlerState.CarryingItem },
					{ type: WorkActionType.Move, position: targetPosition, targetType: step.target.type === TransportTargetType.Storage ? 'storage_slot' : 'building', targetId: targetReservationId || targetBuilding.id, setState: SettlerState.CarryingItem },
					// Construction consumes collectedResources (pre-storage), so it uses a dedicated action.
					step.target.type === TransportTargetType.Construction
						? { type: WorkActionType.DeliverConstruction, buildingInstanceId: targetBuilding.id, itemType: step.itemType, quantity: step.quantity, setState: SettlerState.Working }
						: { type: WorkActionType.DeliverStorage, buildingInstanceId: targetBuilding.id, itemType: step.itemType, quantity: step.quantity, reservationId: targetReservationId || undefined, setState: SettlerState.Working }
				],
				releaseReservations: () => releaseFns.forEach(fn => fn())
			}
		}

		if (step.source.type === TransportSourceType.Storage) {
			const reservation = reservationSystem.reserveStorageOutgoing(step.source.buildingInstanceId, step.itemType, step.quantity, assignment.assignmentId)
			if (!reservation) {
				return { actions: [{ type: WorkActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
			}
			releaseFns.push(() => reservationSystem.releaseStorageReservation(reservation.reservationId))

			const sourceBuilding = managers.buildings.getBuildingInstance(step.source.buildingInstanceId)
			if (!sourceBuilding) {
				releaseFns.forEach(fn => fn())
				return { actions: [] }
			}

			let targetReservationId: string | null = null
			let targetPosition = targetBuilding.position
			if (step.target.type === TransportTargetType.Storage) {
				const targetReservation = reservationSystem.reserveStorageIncoming(step.target.buildingInstanceId, step.itemType, step.quantity, assignment.assignmentId)
				if (!targetReservation) {
					releaseFns.forEach(fn => fn())
					return { actions: [{ type: WorkActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
				}
				targetReservationId = targetReservation.reservationId
				targetPosition = targetReservation.position
				releaseFns.push(() => reservationSystem.releaseStorageReservation(targetReservation.reservationId))
			}

			if (!canReach(settler.position, reservation.position)) {
				releaseFns.forEach(fn => fn())
				return { actions: [{ type: WorkActionType.Wait, durationMs: 2000, setState: SettlerState.WaitingForWork }] }
			}

			if (!canReach(reservation.position, targetPosition)) {
				const fallback = managers.map.findNearestWalkablePosition(settler.mapName, targetPosition, 2)
				if (fallback && canReach(reservation.position, fallback)) {
					targetPosition = fallback
				} else {
					releaseFns.forEach(fn => fn())
					return { actions: [{ type: WorkActionType.Wait, durationMs: 2000, setState: SettlerState.WaitingForWork }] }
				}
			}

			return {
				actions: [
					{ type: WorkActionType.Move, position: reservation.position, targetType: 'storage_slot', targetId: reservation.reservationId, setState: SettlerState.MovingToBuilding },
					{ type: WorkActionType.WithdrawStorage, buildingInstanceId: sourceBuilding.id, itemType: step.itemType, quantity: step.quantity, reservationId: reservation.reservationId, setState: SettlerState.CarryingItem },
					{ type: WorkActionType.Move, position: targetPosition, targetType: step.target.type === TransportTargetType.Storage ? 'storage_slot' : 'building', targetId: targetReservationId || targetBuilding.id, setState: SettlerState.CarryingItem },
					// Construction consumes collectedResources (pre-storage), so it uses a dedicated action.
					step.target.type === TransportTargetType.Construction
						? { type: WorkActionType.DeliverConstruction, buildingInstanceId: targetBuilding.id, itemType: step.itemType, quantity: step.quantity, setState: SettlerState.Working }
						: { type: WorkActionType.DeliverStorage, buildingInstanceId: targetBuilding.id, itemType: step.itemType, quantity: step.quantity, reservationId: targetReservationId || undefined, setState: SettlerState.Working }
				],
				releaseReservations: () => releaseFns.forEach(fn => fn())
			}
		}

		return { actions: [] }
	}
}
