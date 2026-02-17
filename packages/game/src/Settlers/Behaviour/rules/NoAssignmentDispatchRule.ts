import { SettlerState } from '../../../Population/types'
import { WorkWaitReason } from '../../Work/types'
import { BehaviourRuleResult, type BehaviourDispatchRule, type BehaviourDispatchRuleContext } from './types'

export class NoAssignmentDispatchRule implements BehaviourDispatchRule {
	public readonly id = 'no-assignment'

	public apply(context: BehaviourDispatchRuleContext): BehaviourRuleResult {
		if (context.assignment) {
			return BehaviourRuleResult.Continue
		}
		context.managers.population.setSettlerAssignment(context.settlerId, undefined, undefined, undefined)
		context.managers.population.setSettlerWaitReason(context.settlerId, WorkWaitReason.NoWork)
		context.managers.population.setSettlerLastStep(context.settlerId, undefined, WorkWaitReason.NoWork)
		context.managers.population.setSettlerState(context.settlerId, SettlerState.Idle)
		return BehaviourRuleResult.Stop
	}
}
