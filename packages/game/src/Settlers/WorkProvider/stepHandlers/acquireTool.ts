import { SettlerState } from '../../../Population/types'
import { WorkActionType, WorkStepType } from '../types'
import type { WorkAction } from '../types'
import type { StepHandler, StepHandlerResult } from './types'

export const AcquireToolHandler: StepHandler = {
	type: WorkStepType.AcquireTool,
	build: ({ settlerId, step, assignment, managers, reservationSystem }): StepHandlerResult => {
		if (step.type !== WorkStepType.AcquireTool) {
			return { actions: [] }
		}

		const settler = managers.population.getSettler(settlerId)
		if (!settler) {
			return { actions: [] }
		}
		if (settler.profession === step.profession) {
			return { actions: [] }
		}

	const releaseFns: Array<() => void> = []
	const toolItemType = managers.population.getToolItemType(step.profession)
	if (!toolItemType) {
		const actions: WorkAction[] = [
			{ type: WorkActionType.ChangeProfession, profession: step.profession, setState: SettlerState.Idle }
		]
		if (assignment.buildingInstanceId) {
			const building = managers.buildings.getBuildingInstance(assignment.buildingInstanceId)
			if (building) {
				actions.push({
					type: WorkActionType.Move,
					position: building.position,
					targetType: 'building',
					targetId: building.id,
					setState: SettlerState.MovingToBuilding
				})
			}
		}
		return { actions }
	}

	let toolItemId = step.toolItemId
	let toolPosition = step.toolPosition
	if (!toolItemId || !toolPosition) {
			const reservedTool = reservationSystem.reserveToolForProfession(settler.mapName, step.profession, settlerId)
			if (!reservedTool) {
				return {
					actions: [{ type: WorkActionType.Wait, durationMs: 2000, setState: SettlerState.WaitingForWork }]
				}
			}
			toolItemId = reservedTool.itemId
			toolPosition = reservedTool.position
			releaseFns.push(() => reservationSystem.releaseToolReservation(toolItemId!))
		}

		const actions: WorkAction[] = [
			{ type: WorkActionType.Move, position: toolPosition!, targetType: 'tool', targetId: toolItemId, setState: SettlerState.MovingToTool },
			{ type: WorkActionType.PickupTool, itemId: toolItemId!, setState: SettlerState.MovingToTool },
			{ type: WorkActionType.ChangeProfession, profession: step.profession, setState: SettlerState.Idle }
		]

		if (assignment.buildingInstanceId) {
			const building = managers.buildings.getBuildingInstance(assignment.buildingInstanceId)
			if (building) {
				actions.push({
					type: WorkActionType.Move,
					position: building.position,
					targetType: 'building',
					targetId: building.id,
					setState: SettlerState.MovingToBuilding
				})
			}
		}

		return {
			actions,
			releaseReservations: () => releaseFns.forEach(fn => fn())
		}
	}
}
