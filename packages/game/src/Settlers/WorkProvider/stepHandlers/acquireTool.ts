import { SettlerState } from '../../../Population/types'
import { WorkActionType, WorkStepType } from '../types'
import type { WorkAction } from '../types'
import type { StepHandler, StepHandlerResult } from './types'
import { ReservationBag } from '../reservations'
import { MoveTargetType } from '../../../Movement/types'

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

	const reservations = new ReservationBag()
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
					targetType: MoveTargetType.Building,
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
			reservations.add(() => reservationSystem.releaseToolReservation(toolItemId!))
		}

		const roadData = managers.roads.getRoadData(settler.mapName) || undefined
		const path = managers.map.findPath(settler.mapName, settler.position, toolPosition!, {
			roadData,
			allowDiagonal: true
		})
		if (!path || path.length === 0) {
			reservations.releaseAll()
			return {
				actions: [{ type: WorkActionType.Wait, durationMs: 2000, setState: SettlerState.WaitingForWork }]
			}
		}

		const actions: WorkAction[] = [
			{ type: WorkActionType.Move, position: toolPosition!, targetType: MoveTargetType.Tool, targetId: toolItemId, setState: SettlerState.MovingToTool },
			{ type: WorkActionType.PickupTool, itemId: toolItemId!, setState: SettlerState.MovingToTool },
			{ type: WorkActionType.ChangeProfession, profession: step.profession, setState: SettlerState.Idle }
		]

		if (assignment.buildingInstanceId) {
			const building = managers.buildings.getBuildingInstance(assignment.buildingInstanceId)
			if (building) {
				actions.push({
					type: WorkActionType.Move,
					position: building.position,
					targetType: MoveTargetType.Building,
					targetId: building.id,
					setState: SettlerState.MovingToBuilding
				})
			}
		}

		return {
			actions,
			releaseReservations: () => reservations.releaseAll()
		}
	}
}
