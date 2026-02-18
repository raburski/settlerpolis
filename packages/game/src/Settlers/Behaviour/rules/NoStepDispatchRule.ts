import { SettlerState } from '../../../Population/types'
import { WorkWaitReason } from '../../Work/types'
import { BehaviourRuleResult, type BehaviourDispatchRule, type BehaviourDispatchRuleContext } from './types'

export class NoStepDispatchRule implements BehaviourDispatchRule {
	public readonly id = 'no-step'

	public apply(context: BehaviourDispatchRuleContext): BehaviourRuleResult {
		if (context.step !== null) {
			return BehaviourRuleResult.Continue
		}
		if (!context.assignment) {
			return BehaviourRuleResult.Stop
		}
		context.managers.population.setSettlerWaitReason(context.settlerId, WorkWaitReason.NoWork)
		context.managers.population.setSettlerLastStep(context.settlerId, undefined, WorkWaitReason.NoWork)
		context.managers.population.setSettlerState(context.settlerId, SettlerState.WaitingForWork)
		return BehaviourRuleResult.Stop
	}
}
