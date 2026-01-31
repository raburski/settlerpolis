import { SettlerState } from '../../../Population/types'
import { WorkActionType, WorkStepType } from '../types'
import type { WorkAction } from '../types'
import type { StepHandler, StepHandlerResult } from './types'

export const ProduceHandler: StepHandler = {
	type: WorkStepType.Produce,
	build: ({ step, assignment, managers, reservationSystem }): StepHandlerResult => {
		if (step.type !== WorkStepType.Produce) {
			return { actions: [] }
		}

		const building = managers.buildings.getBuildingInstance(step.buildingInstanceId)
		if (!building) {
			return { actions: [] }
		}

		const releaseFns: Array<() => void> = []

		for (const input of step.recipe.inputs) {
			const reservationId = reservationSystem.reserveStorageOutgoing(building.id, input.itemType, input.quantity, assignment.assignmentId)
			if (!reservationId) {
				releaseFns.forEach(fn => fn())
				return { actions: [{ type: WorkActionType.Wait, durationMs: 1500, setState: SettlerState.WaitingForWork }] }
			}
			releaseFns.push(() => reservationSystem.releaseStorageReservation(reservationId))
		}

		const outputReservations: Array<string | null> = []
		for (const output of step.recipe.outputs) {
			const reservationId = reservationSystem.reserveStorageIncoming(building.id, output.itemType, output.quantity, assignment.assignmentId)
			if (!reservationId) {
				releaseFns.forEach(fn => fn())
				return { actions: [{ type: WorkActionType.Wait, durationMs: 1500, setState: SettlerState.WaitingForWork }] }
			}
			releaseFns.push(() => reservationSystem.releaseStorageReservation(reservationId))
			outputReservations.push(reservationId)
		}

		const actions: WorkAction[] = [
			{ type: WorkActionType.Move, position: building.position, targetType: 'building', targetId: building.id, setState: SettlerState.MovingToBuilding }
		]

		for (const input of step.recipe.inputs) {
			actions.push({
				type: WorkActionType.WithdrawStorage,
				buildingInstanceId: building.id,
				itemType: input.itemType,
				quantity: input.quantity,
				setState: SettlerState.Working
			})
		}

		actions.push({ type: WorkActionType.Wait, durationMs: step.durationMs, setState: SettlerState.Working })

		step.recipe.outputs.forEach((output, index) => {
			const reservationId = outputReservations[index]
			actions.push({
				type: WorkActionType.DeliverStorage,
				buildingInstanceId: building.id,
				itemType: output.itemType,
				quantity: output.quantity,
				reservationId: reservationId || undefined,
				setState: SettlerState.Working
			})
		})

		return {
			actions,
			releaseReservations: () => releaseFns.forEach(fn => fn())
		}
	}
}
