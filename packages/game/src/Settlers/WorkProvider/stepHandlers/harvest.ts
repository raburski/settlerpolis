import { SettlerState } from '../../../Population/types'
import { WorkActionType, WorkStepType } from '../types'
import type { StepHandler, StepHandlerResult } from './types'

export const HarvestHandler: StepHandler = {
	type: WorkStepType.Harvest,
	build: ({ step, settlerId, assignment, managers, reservationSystem }): StepHandlerResult => {
		if (step.type !== WorkStepType.Harvest) {
			return { actions: [] }
		}

		const releaseFns: Array<() => void> = []
		const nodeReserved = reservationSystem.reserveNode(step.resourceNodeId, settlerId)
		if (!nodeReserved) {
			return { actions: [{ type: WorkActionType.Wait, durationMs: 1500, setState: SettlerState.WaitingForWork }] }
		}
		releaseFns.push(() => reservationSystem.releaseNode(step.resourceNodeId, settlerId))

		const building = managers.buildings.getBuildingInstance(step.buildingInstanceId)
		if (!building) {
			releaseFns.forEach(fn => fn())
			return { actions: [] }
		}

		const node = managers.resourceNodes.getNode(step.resourceNodeId)
		if (!node) {
			releaseFns.forEach(fn => fn())
			return { actions: [] }
		}

		const reservation = reservationSystem.reserveStorageIncoming(building.id, step.outputItemType, step.quantity, assignment.assignmentId)
		if (!reservation) {
			releaseFns.forEach(fn => fn())
			return { actions: [{ type: WorkActionType.Wait, durationMs: 1500, setState: SettlerState.WaitingForWork }] }
		}
		releaseFns.push(() => reservationSystem.releaseStorageReservation(reservation.reservationId))

		return {
			actions: [
				{ type: WorkActionType.Move, position: node.position, targetType: 'resource', targetId: node.id, setState: SettlerState.MovingToResource },
				{ type: WorkActionType.Wait, durationMs: step.durationMs, setState: SettlerState.Harvesting },
				{ type: WorkActionType.HarvestNode, nodeId: node.id, quantity: step.quantity, setState: SettlerState.CarryingItem },
				{ type: WorkActionType.Move, position: reservation.position, targetType: 'storage_slot', targetId: reservation.reservationId, setState: SettlerState.CarryingItem },
				{ type: WorkActionType.DeliverStorage, buildingInstanceId: building.id, itemType: step.outputItemType, quantity: step.quantity, reservationId: reservation.reservationId, setState: SettlerState.Working },
				{ type: WorkActionType.Move, position: building.position, targetType: 'building', targetId: building.id, setState: SettlerState.MovingToBuilding }
			],
			releaseReservations: () => releaseFns.forEach(fn => fn())
		}
	}
}
