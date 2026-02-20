import { ActionQueueContextKind, type ActionQueueContext } from '../../../state/types'
import { WorkStepType } from '../../Work/types'
import { HomeRelocationPlanner } from './HomeRelocationPlanner'
import { BehaviourRuleResult, type BehaviourDispatchRule, type BehaviourDispatchRuleContext } from './types'

export class HomeRelocationDispatchRule implements BehaviourDispatchRule {
	public readonly id = 'home-relocation'
	private readonly planner = new HomeRelocationPlanner()

	public reset(): void {
		this.planner.reset()
	}

	public apply(context: BehaviourDispatchRuleContext): BehaviourRuleResult {
		if (!context.assignment) {
			return BehaviourRuleResult.Continue
		}

		const isNoStep = context.step === null
		const isWaitStep = context.step?.type === WorkStepType.Wait
		if (!isNoStep && !isWaitStep) {
			return BehaviourRuleResult.Continue
		}

		const plan = this.planner.tryBuildPlan(
			context.settlerId,
			context.assignment,
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
			return BehaviourRuleResult.Continue
		}
		if (context.actionsManager.isBusy(context.settlerId)) {
			return BehaviourRuleResult.Stop
		}

		context.managers.population.setSettlerWaitReason(context.settlerId, undefined)
		const queueContext: ActionQueueContext = {
			kind: ActionQueueContextKind.Work
		}
		context.actionsManager.enqueue(
			context.settlerId,
			plan.actions,
			undefined,
			undefined,
			queueContext
		)
		return BehaviourRuleResult.Stop
	}
}
