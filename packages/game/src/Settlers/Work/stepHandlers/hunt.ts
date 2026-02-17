import { SettlerState } from '../../../Population/types'
import { WorkActionType, WorkStepType } from '../types'
import type { StepHandler, StepHandlerResult } from './types'
import { ReservationBag } from '../reservations'
import { MoveTargetType } from '../../../Movement/types'

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

		const reservations = new ReservationBag()
		const reservedBy = npc.attributes?.reservedBy
		if (reservedBy && reservedBy !== settlerId) {
			return { actions: [{ type: WorkActionType.Wait, durationMs: 1500, setState: SettlerState.WaitingForWork }] }
		}

		managers.npc.setNPCAttribute(step.npcId, 'reservedBy', settlerId)
		reservations.add(() => {
			const current = managers.npc.getNPC(step.npcId)
			if (!current) {
				return
			}
			const currentReservedBy = current.attributes?.reservedBy
			if (currentReservedBy === settlerId) {
				managers.npc.removeNPCAttribute(step.npcId, 'reservedBy')
			}
		})

		const building = managers.buildings.getBuildingInstance(step.buildingInstanceId)
		if (!building) {
			reservations.releaseAll()
			return { actions: [] }
		}

		const reservation = reservationSystem.reserveStorageIncoming(building.id, step.outputItemType, step.quantity, assignment.assignmentId)
		if (!reservation) {
			reservations.releaseAll()
			return { actions: [{ type: WorkActionType.Wait, durationMs: 1500, setState: SettlerState.WaitingForWork }] }
		}
		reservations.add(() => reservationSystem.releaseStorageReservation(reservation.reservationId))

		const targetPosition = npc.position

		return {
			actions: [
				{ type: WorkActionType.Move, position: targetPosition, targetType: MoveTargetType.Resource, targetId: npc.id, setState: SettlerState.MovingToResource },
				{ type: WorkActionType.Wait, durationMs: step.durationMs, setState: SettlerState.Harvesting },
				{ type: WorkActionType.HuntNpc, npcId: npc.id, outputItemType: step.outputItemType, quantity: step.quantity, wildlifeType: step.wildlifeType, setState: SettlerState.CarryingItem },
				{ type: WorkActionType.Move, position: reservation.position, targetType: MoveTargetType.StorageSlot, targetId: reservation.reservationId, setState: SettlerState.CarryingItem },
				{ type: WorkActionType.DeliverStorage, buildingInstanceId: building.id, itemType: step.outputItemType, quantity: step.quantity, reservationId: reservation.reservationId, setState: SettlerState.Working },
				{ type: WorkActionType.Move, position: building.position, targetType: MoveTargetType.Building, targetId: building.id, setState: SettlerState.MovingToBuilding }
			],
			releaseReservations: () => reservations.releaseAll()
		}
	}
}
