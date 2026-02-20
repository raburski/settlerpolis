import { SettlerState } from '../../../Population/types'
import { WorkActionType, WorkStepType } from '../types'
import type { StepHandler, StepHandlerResult } from './types'
import { ReservationBag } from '../reservations'
import { MoveTargetType } from '../../../Movement/types'
import { ReservationKind } from '../../../Reservation'

export const FishHandler: StepHandler = {
	type: WorkStepType.Fish,
	build: ({ step, settlerId, assignment, managers, reservationSystem }): StepHandlerResult => {
		if (step.type !== WorkStepType.Fish) {
			return { actions: [] }
		}

		const reservations = new ReservationBag()
		const nodeReservation = reservationSystem.reserve({
			kind: ReservationKind.Node,
			nodeId: step.resourceNodeId,
			ownerId: settlerId
		})
		if (!nodeReservation || nodeReservation.kind !== ReservationKind.Node) {
			return { actions: [{ type: WorkActionType.Wait, durationMs: 1500, setState: SettlerState.WaitingForWork }] }
		}
		reservations.add(() => reservationSystem.release(nodeReservation.ref))

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

		const storageReservation = reservationSystem.reserve({
			kind: ReservationKind.Storage,
			direction: 'incoming',
			buildingInstanceId: building.id,
			itemType: step.outputItemType,
			quantity: step.quantity,
			ownerId: assignment.assignmentId
		})
		if (!storageReservation || storageReservation.kind !== ReservationKind.Storage) {
			reservations.releaseAll()
			return { actions: [{ type: WorkActionType.Wait, durationMs: 1500, setState: SettlerState.WaitingForWork }] }
		}
		reservations.add(() => reservationSystem.release(storageReservation.ref))

		return {
			actions: [
				{ type: WorkActionType.Move, position: step.targetPosition, targetType: MoveTargetType.Spot, targetId: node.id, setState: SettlerState.MovingToResource },
				{ type: WorkActionType.Wait, durationMs: step.durationMs, setState: SettlerState.Harvesting },
				{
					type: WorkActionType.HarvestNode,
					nodeId: node.id,
					quantity: step.quantity,
					reservationRefs: [nodeReservation.ref],
					setState: SettlerState.CarryingItem
				},
				{
					type: WorkActionType.Move,
					position: storageReservation.position,
					targetType: MoveTargetType.StorageSlot,
					targetId: storageReservation.reservationId,
					setState: SettlerState.CarryingItem
				},
				{
					type: WorkActionType.DeliverStorage,
					buildingInstanceId: building.id,
					itemType: step.outputItemType,
					quantity: step.quantity,
					reservationId: storageReservation.reservationId,
					reservationRefs: [storageReservation.ref],
					setState: SettlerState.Working
				},
				{ type: WorkActionType.Move, position: building.position, targetType: MoveTargetType.Building, targetId: building.id, setState: SettlerState.MovingToBuilding }
			]
		}
	}
}
