import { SettlerState } from '../../../Population/types'
import { ActionQueueContextKind, type ActionQueueContext } from '../../../state/types'
import type { WorkAssignment } from '../../Work/types'
import { HomeRelocationPlanner } from './HomeRelocationPlanner'
import type { BehaviourDispatchRuleContext } from './types'

export class HomeRelocationDispatchHelper {
	private planner = new HomeRelocationPlanner()

	public reset(): void {
		this.planner.reset()
	}

	public tryEnqueue(context: BehaviourDispatchRuleContext, assignment: WorkAssignment): boolean {
		const plan = this.planner.tryBuildPlan(
			context.settlerId,
			assignment,
			context.nowMs,
			{
				buildings: context.managers.buildings,
				population: context.managers.population,
				reservations: context.managers.reservations,
				roads: context.managers.roads,
				map: context.managers.map
			}
		)
		if (!plan) {
			return false
		}
		if (context.actionsManager.isBusy(context.settlerId)) {
			return true
		}

		context.managers.population.setSettlerWaitReason(context.settlerId, undefined)
		const queueContext: ActionQueueContext = {
			kind: ActionQueueContextKind.Work,
			reservationOwnerId: assignment.assignmentId
		}
		context.actionsManager.enqueue(
			context.settlerId,
			plan.actions,
			() => {
				context.managers.population.setSettlerState(context.settlerId, SettlerState.Idle)
				context.dispatchNextStep(context.settlerId)
			},
			() => {
				plan.releaseReservation()
				context.managers.population.setSettlerState(context.settlerId, SettlerState.Idle)
				context.dispatchNextStep(context.settlerId)
			},
			queueContext
		)
		return true
	}
}
