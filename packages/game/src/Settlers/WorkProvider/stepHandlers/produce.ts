import { SettlerState } from '../../../Population/types'
import { WorkActionType, WorkStepType } from '../types'
import type { WorkAction } from '../types'
import type { StepHandler, StepHandlerResult } from './types'
import { ReservationBag } from '../reservations'
import { MoveTargetType } from '../../../Movement/types'

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

		const reservations = new ReservationBag()

		const inputReservations = step.recipe.inputs.map(input => {
			const reservation = reservationSystem.reserveStorageOutgoingInternal(building.id, input.itemType, input.quantity, assignment.assignmentId)
			if (!reservation) {
				return null
			}
			reservations.add(() => reservationSystem.releaseStorageReservation(reservation.reservationId))
			return {
				itemType: input.itemType,
				quantity: input.quantity,
				reservationId: reservation.reservationId,
				position: reservation.position
			}
		})

		if (inputReservations.some(res => !res)) {
			reservations.releaseAll()
			return { actions: [{ type: WorkActionType.Wait, durationMs: 1500, setState: SettlerState.WaitingForWork }] }
		}

		const outputReservations = step.recipe.outputs.map(output => {
			const reservation = reservationSystem.reserveStorageIncoming(building.id, output.itemType, output.quantity, assignment.assignmentId)
			if (!reservation) {
				return null
			}
			reservations.add(() => reservationSystem.releaseStorageReservation(reservation.reservationId))
			return {
				itemType: output.itemType,
				quantity: output.quantity,
				reservationId: reservation.reservationId,
				position: reservation.position
			}
		})

		if (outputReservations.some(res => !res)) {
			reservations.releaseAll()
			return { actions: [{ type: WorkActionType.Wait, durationMs: 1500, setState: SettlerState.WaitingForWork }] }
		}

		const actions: WorkAction[] = []

		for (const input of inputReservations) {
			actions.push(
				{ type: WorkActionType.Move, position: input!.position, targetType: MoveTargetType.StorageSlot, targetId: input!.reservationId, setState: SettlerState.MovingToBuilding },
				{
					type: WorkActionType.WithdrawStorage,
					buildingInstanceId: building.id,
					itemType: input!.itemType,
					quantity: input!.quantity,
					reservationId: input!.reservationId,
					setState: SettlerState.Working
				}
			)
		}

		actions.push({ type: WorkActionType.Move, position: building.position, targetType: MoveTargetType.Building, targetId: building.id, setState: SettlerState.MovingToBuilding })
		actions.push({ type: WorkActionType.Wait, durationMs: step.durationMs, setState: SettlerState.Working })

		for (const output of outputReservations) {
			actions.push(
				{ type: WorkActionType.Move, position: output!.position, targetType: MoveTargetType.StorageSlot, targetId: output!.reservationId, setState: SettlerState.CarryingItem },
				{
					type: WorkActionType.DeliverStorage,
					buildingInstanceId: building.id,
					itemType: output!.itemType,
					quantity: output!.quantity,
					reservationId: output!.reservationId,
					setState: SettlerState.Working
				}
			)
		}

		return {
			actions,
			releaseReservations: () => reservations.releaseAll()
		}
	}
}
