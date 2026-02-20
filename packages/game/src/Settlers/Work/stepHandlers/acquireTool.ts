import { SettlerState } from '../../../Population/types'
import { WorkStepType } from '../types'
import { SettlerActionType } from '../../Actions/types'
import type { SettlerAction } from '../../Actions/types'
import type { StepHandler, StepHandlerResult } from './types'
import { MoveTargetType } from '../../../Movement/types'
import { ReservationKind, type ReservationRef } from '../../../Reservation'

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

		const reservationRefs: ReservationRef[] = []
		const releaseReservations = () => reservationSystem.releaseMany(reservationRefs)
		const toolItemType = managers.population.getToolItemType(step.profession)
		if (settler.profession === step.profession) {
			if (!toolItemType || settler.stateContext.equippedItemType === toolItemType) {
				return { actions: [] }
			}
		}
		if (!toolItemType) {
			const actions: SettlerAction[] = [
				{ type: SettlerActionType.ChangeProfession, profession: step.profession, setState: SettlerState.Idle }
			]
			if (assignment.buildingInstanceId) {
				const building = managers.buildings.getBuildingInstance(assignment.buildingInstanceId)
				if (building) {
					actions.push({
						type: SettlerActionType.Move,
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
			const reservedTool = reservationSystem.reserve({
				kind: ReservationKind.Tool,
				mapId: settler.mapId,
				profession: step.profession,
				ownerId: settlerId
			})
			if (!reservedTool || reservedTool.kind !== ReservationKind.Tool) {
				return {
					actions: [{ type: SettlerActionType.Wait, durationMs: 2000, setState: SettlerState.WaitingForWork }]
				}
			}
			toolItemId = reservedTool.itemId
			toolPosition = reservedTool.position
			reservationRefs.push(reservedTool.ref)
		}

		const roadData = managers.roads.getRoadData(settler.mapId) || undefined
		const path = managers.map.findPath(settler.mapId, settler.position, toolPosition!, {
			roadData,
			allowDiagonal: true
		})
		if (!path || path.length === 0) {
			releaseReservations()
			return {
				actions: [{ type: SettlerActionType.Wait, durationMs: 2000, setState: SettlerState.WaitingForWork }]
			}
		}

		const actions: SettlerAction[] = [
			{ type: SettlerActionType.Move, position: toolPosition!, targetType: MoveTargetType.Tool, targetId: toolItemId, setState: SettlerState.MovingToTool },
			{
				type: SettlerActionType.PickupTool,
				itemId: toolItemId!,
				reservationRefs: [{ kind: ReservationKind.Tool, itemId: toolItemId! }],
				setState: SettlerState.MovingToTool
			},
			{ type: SettlerActionType.ChangeProfession, profession: step.profession, setState: SettlerState.Idle }
		]

		if (assignment.buildingInstanceId) {
			const building = managers.buildings.getBuildingInstance(assignment.buildingInstanceId)
			if (building) {
				actions.push({
					type: SettlerActionType.Move,
					position: building.position,
					targetType: MoveTargetType.Building,
					targetId: building.id,
					setState: SettlerState.MovingToBuilding
				})
			}
		}

		return {
			actions
		}
	}
}
