import { SettlerState } from '../../../Population/types'
import { WorkActionType, WorkStepType } from '../types'
import type { StepHandler, StepHandlerResult } from './types'
import { ReservationBag } from '../reservations'
import { MoveTargetType } from '../../../Movement/types'

export const FishHandler: StepHandler = {
	type: WorkStepType.Fish,
	build: ({ step, settlerId, assignment, managers, reservationSystem }): StepHandlerResult => {
		if (step.type !== WorkStepType.Fish) {
			return { actions: [] }
		}

		const reservations = new ReservationBag()
		const nodeReserved = reservationSystem.reserveNode(step.resourceNodeId, settlerId)
		if (!nodeReserved) {
			return { actions: [{ type: WorkActionType.Wait, durationMs: 1500, setState: SettlerState.WaitingForWork }] }
		}
		reservations.add(() => reservationSystem.releaseNode(step.resourceNodeId, settlerId))

		const building = managers.buildings.getBuildingInstance(step.buildingInstanceId)
		if (!building) {
			reservations.releaseAll()
			return { actions: [] }
		}

		const node = managers.resourceNodes.getNode(step.resourceNodeId)
		if (!node) {
			reservations.releaseAll()
			return { actions: [] }
		}

		const reservation = reservationSystem.reserveStorageIncoming(building.id, step.outputItemType, step.quantity, assignment.assignmentId)
		if (!reservation) {
			reservations.releaseAll()
			return { actions: [{ type: WorkActionType.Wait, durationMs: 1500, setState: SettlerState.WaitingForWork }] }
		}
		reservations.add(() => reservationSystem.releaseStorageReservation(reservation.reservationId))

		return {
			actions: [
				{ type: WorkActionType.Move, position: step.targetPosition, targetType: MoveTargetType.Spot, targetId: node.id, setState: SettlerState.MovingToResource },
				{ type: WorkActionType.Wait, durationMs: step.durationMs, setState: SettlerState.Harvesting },
				{ type: WorkActionType.HarvestNode, nodeId: node.id, quantity: step.quantity, setState: SettlerState.CarryingItem },
				{ type: WorkActionType.Move, position: reservation.position, targetType: MoveTargetType.StorageSlot, targetId: reservation.reservationId, setState: SettlerState.CarryingItem },
				{ type: WorkActionType.DeliverStorage, buildingInstanceId: building.id, itemType: step.outputItemType, quantity: step.quantity, reservationId: reservation.reservationId, setState: SettlerState.Working },
				{ type: WorkActionType.Move, position: building.position, targetType: MoveTargetType.Building, targetId: building.id, setState: SettlerState.MovingToBuilding }
			],
			releaseReservations: () => reservations.releaseAll()
		}
	}
}
