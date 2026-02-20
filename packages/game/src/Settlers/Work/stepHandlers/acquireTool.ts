import { SettlerState } from '../../../Population/types'
import { WorkActionType, WorkStepType } from '../types'
import type { WorkAction } from '../types'
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
			const reservedTool = reservationSystem.reserve({
				kind: ReservationKind.Tool,
				mapId: settler.mapId,
				profession: step.profession,
				ownerId: settlerId
			})
			if (!reservedTool || reservedTool.kind !== ReservationKind.Tool) {
				return {
					actions: [{ type: WorkActionType.Wait, durationMs: 2000, setState: SettlerState.WaitingForWork }]
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
				actions: [{ type: WorkActionType.Wait, durationMs: 2000, setState: SettlerState.WaitingForWork }]
			}
		}

		const actions: WorkAction[] = [
			{ type: WorkActionType.Move, position: toolPosition!, targetType: MoveTargetType.Tool, targetId: toolItemId, setState: SettlerState.MovingToTool },
			{
				type: WorkActionType.PickupTool,
				itemId: toolItemId!,
				reservationRefs: [{ kind: ReservationKind.Tool, itemId: toolItemId! }],
				setState: SettlerState.MovingToTool
			},
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
			actions
		}
	}
}
