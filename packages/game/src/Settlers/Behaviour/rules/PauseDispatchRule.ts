import { BehaviourRuleResult, type BehaviourDispatchRule, type BehaviourDispatchRuleContext } from './types'

export class PauseDispatchRule implements BehaviourDispatchRule {
	public readonly id = 'pause-dispatch'

	public apply(context: BehaviourDispatchRuleContext): BehaviourRuleResult {
		if (!context.work.isSettlerPaused(context.settlerId)) {
			return BehaviourRuleResult.Continue
		}
		return BehaviourRuleResult.Stop
	}
}
