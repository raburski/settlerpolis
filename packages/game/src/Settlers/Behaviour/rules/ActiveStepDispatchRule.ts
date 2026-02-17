import { WorkStepType } from '../../Work/types'
import { BehaviourRuleResult, type BehaviourDispatchRule, type BehaviourDispatchRuleContext } from './types'

export class ActiveStepDispatchRule implements BehaviourDispatchRule {
	public readonly id = 'active-step'

	public apply(context: BehaviourDispatchRuleContext): BehaviourRuleResult {
		if (!context.step || context.step.type === WorkStepType.Wait) {
			return BehaviourRuleResult.Continue
		}
		context.managers.population.setSettlerWaitReason(context.settlerId, undefined)
		context.managers.population.setSettlerLastStep(context.settlerId, context.step.type, undefined)
		return BehaviourRuleResult.Continue
	}
}
