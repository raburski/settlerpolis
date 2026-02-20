import { SettlerState } from '../../../Population/types'
import { WorkActionType, WorkStepType } from '../types'
import type { StepHandler, StepHandlerResult } from './types'
import { MoveTargetType } from '../../../Movement/types'
import { ReservationKind, type ReservationRef } from '../../../Reservation'

export const HuntHandler: StepHandler = {
	type: WorkStepType.Hunt,
	build: ({ step, settlerId, assignment, managers, reservationSystem }): StepHandlerResult => {
		if (step.type !== WorkStepType.Hunt) {
			return { actions: [] }
		}

		const npc = managers.npc.getNPC(step.npcId)
		if (!npc || npc.active === false) {
			return { actions: [] }
		}

		const reservationRefs: ReservationRef[] = []
		const releaseReservations = () => reservationSystem.releaseMany(reservationRefs)
		const npcReservation = reservationSystem.reserve({
			kind: ReservationKind.Npc,
			npcId: step.npcId,
			ownerId: settlerId
		})
		if (!npcReservation || npcReservation.kind !== ReservationKind.Npc) {
			return { actions: [{ type: WorkActionType.Wait, durationMs: 1500, setState: SettlerState.WaitingForWork }] }
		}
		reservationRefs.push(npcReservation.ref)

		const building = managers.buildings.getBuildingInstance(step.buildingInstanceId)
		if (!building) {
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
			return { actions: [{ type: WorkActionType.Wait, durationMs: 1500, setState: SettlerState.WaitingForWork }] }
		}
		reservationRefs.push(storageReservation.ref)

		const targetPosition = npc.position

		return {
			actions: [
				{ type: WorkActionType.Move, position: targetPosition, targetType: MoveTargetType.Resource, targetId: npc.id, setState: SettlerState.MovingToResource },
				{ type: WorkActionType.Wait, durationMs: step.durationMs, setState: SettlerState.Harvesting },
				{
					type: WorkActionType.HuntNpc,
					npcId: npc.id,
					outputItemType: step.outputItemType,
					quantity: step.quantity,
					wildlifeType: step.wildlifeType,
					reservationRefs: [npcReservation.ref],
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
