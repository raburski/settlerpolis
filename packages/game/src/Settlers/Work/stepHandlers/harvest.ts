import { SettlerState } from '../../../Population/types'
import { WorkStepType } from '../types'
import { SettlerActionType } from '../../Actions/types'
import type { StepHandler, StepHandlerResult } from './types'
import { MoveTargetType } from '../../../Movement/types'
import { ReservationKind, type ReservationRef } from '../../../Reservation'

export const HarvestHandler: StepHandler = {
	type: WorkStepType.Harvest,
	build: ({ step, settlerId, assignment, managers, reservationSystem }): StepHandlerResult => {
		if (step.type !== WorkStepType.Harvest) {
			return { actions: [] }
		}

		const reservationRefs: ReservationRef[] = []
		const releaseReservations = () => reservationSystem.releaseMany(reservationRefs)
		const nodeReservation = reservationSystem.reserve({
			kind: ReservationKind.Node,
			nodeId: step.resourceNodeId,
			ownerId: settlerId
		})
		if (!nodeReservation || nodeReservation.kind !== ReservationKind.Node) {
			return { actions: [{ type: SettlerActionType.Wait, durationMs: 1500, setState: SettlerState.WaitingForWork }] }
		}
		reservationRefs.push(nodeReservation.ref)

		const building = managers.buildings.getBuildingInstance(step.buildingInstanceId)
		if (!building) {
			releaseReservations()
			return { actions: [] }
		}

		const node = managers.resourceNodes.getNode(step.resourceNodeId)
		if (!node) {
			releaseReservations()
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
			releaseReservations()
			return { actions: [{ type: SettlerActionType.Wait, durationMs: 1500, setState: SettlerState.WaitingForWork }] }
		}
		reservationRefs.push(storageReservation.ref)

		return {
			actions: [
				{ type: SettlerActionType.Move, position: node.position, targetType: MoveTargetType.Resource, targetId: node.id, setState: SettlerState.MovingToResource },
				{ type: SettlerActionType.Wait, durationMs: step.durationMs, setState: SettlerState.Harvesting },
				{
					type: SettlerActionType.HarvestNode,
					nodeId: node.id,
					quantity: step.quantity,
					reservationRefs: [nodeReservation.ref],
					setState: SettlerState.CarryingItem
				},
				{
					type: SettlerActionType.Move,
					position: storageReservation.position,
					targetType: MoveTargetType.StorageSlot,
					targetId: storageReservation.reservationId,
					setState: SettlerState.CarryingItem
				},
				{
					type: SettlerActionType.DeliverStorage,
					buildingInstanceId: building.id,
					itemType: step.outputItemType,
					quantity: step.quantity,
					reservationId: storageReservation.reservationId,
					reservationRefs: [storageReservation.ref],
					setState: SettlerState.Working
				},
				{ type: SettlerActionType.Move, position: building.position, targetType: MoveTargetType.Building, targetId: building.id, setState: SettlerState.MovingToBuilding }
			]
		}
	}
}
