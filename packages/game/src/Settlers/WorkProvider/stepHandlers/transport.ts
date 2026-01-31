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

		const targetBuilding = managers.buildings.getBuildingInstance(step.target.buildingInstanceId)
		if (!targetBuilding) {
			return { actions: [] }
		}

		const releaseFns: Array<() => void> = []

		if (step.source.type === TransportSourceType.Ground) {
			const source = step.source as Extract<TransportSource, { type: TransportSourceType.Ground }>
			const reserved = reservationSystem.reserveLootItem(source.itemId, assignment.assignmentId)
			if (!reserved) {
				return { actions: [{ type: WorkActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
			}
			releaseFns.push(() => reservationSystem.releaseLootReservation(source.itemId, assignment.assignmentId))

			return {
				actions: [
					{ type: WorkActionType.Move, position: source.position, targetType: 'item', targetId: source.itemId, setState: SettlerState.MovingToItem },
					{ type: WorkActionType.PickupLoot, itemId: source.itemId, setState: SettlerState.CarryingItem },
					{ type: WorkActionType.Move, position: targetBuilding.position, targetType: 'building', targetId: targetBuilding.id, setState: SettlerState.CarryingItem },
					// Construction consumes collectedResources (pre-storage), so it uses a dedicated action.
					step.target.type === TransportTargetType.Construction
						? { type: WorkActionType.DeliverConstruction, buildingInstanceId: targetBuilding.id, itemType: step.itemType, quantity: step.quantity, setState: SettlerState.Working }
						: { type: WorkActionType.DeliverStorage, buildingInstanceId: targetBuilding.id, itemType: step.itemType, quantity: step.quantity, setState: SettlerState.Working }
				],
				releaseReservations: () => releaseFns.forEach(fn => fn())
			}
		}

		if (step.source.type === TransportSourceType.Storage) {
			const reservationId = reservationSystem.reserveStorageOutgoing(step.source.buildingInstanceId, step.itemType, step.quantity, assignment.assignmentId)
			if (!reservationId) {
				return { actions: [{ type: WorkActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
			}
			releaseFns.push(() => reservationSystem.releaseStorageReservation(reservationId))

			const sourceBuilding = managers.buildings.getBuildingInstance(step.source.buildingInstanceId)
			if (!sourceBuilding) {
				releaseFns.forEach(fn => fn())
				return { actions: [] }
			}

			let targetReservationId: string | null = null
			if (step.target.type === TransportTargetType.Storage) {
				targetReservationId = reservationSystem.reserveStorageIncoming(step.target.buildingInstanceId, step.itemType, step.quantity, assignment.assignmentId)
				if (!targetReservationId) {
					releaseFns.forEach(fn => fn())
					return { actions: [{ type: WorkActionType.Wait, durationMs: 1000, setState: SettlerState.WaitingForWork }] }
				}
				const reservationToRelease = targetReservationId
				releaseFns.push(() => reservationSystem.releaseStorageReservation(reservationToRelease))
			}

			return {
				actions: [
					{ type: WorkActionType.Move, position: sourceBuilding.position, targetType: 'building', targetId: sourceBuilding.id, setState: SettlerState.MovingToBuilding },
					{ type: WorkActionType.WithdrawStorage, buildingInstanceId: sourceBuilding.id, itemType: step.itemType, quantity: step.quantity, reservationId, setState: SettlerState.CarryingItem },
					{ type: WorkActionType.Move, position: targetBuilding.position, targetType: 'building', targetId: targetBuilding.id, setState: SettlerState.CarryingItem },
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
