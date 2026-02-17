import { WorkWaitReason } from '../../Work/types'
import { BehaviourRuleResult, type BehaviourDispatchRule, type BehaviourDispatchRuleContext } from './types'

export class ProviderDispatchRule implements BehaviourDispatchRule {
	public readonly id = 'provider-resolution'

	public apply(context: BehaviourDispatchRuleContext): BehaviourRuleResult {
		if (!context.assignment) {
			return BehaviourRuleResult.Continue
		}
		const provider = context.work.getProvider(context.assignment.providerId)
		if (!provider) {
			context.managers.population.setSettlerWaitReason(context.settlerId, WorkWaitReason.ProviderMissing)
			context.managers.population.setSettlerLastStep(context.settlerId, undefined, WorkWaitReason.ProviderMissing)
			context.work.unassignSettler(context.settlerId)
			return BehaviourRuleResult.Stop
		}
		context.provider = provider
		return BehaviourRuleResult.Continue
	}
}
