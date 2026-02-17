import { BehaviourRuleResult, type BehaviourDispatchRule, type BehaviourDispatchRuleContext } from './types'

export class PauseDispatchRule implements BehaviourDispatchRule {
	public readonly id = 'pause-dispatch'

	public apply(context: BehaviourDispatchRuleContext): BehaviourRuleResult {
		const { pauseRequests, pausedContexts } = context.work.getPauseState()
		if (!pauseRequests.has(context.settlerId) && !pausedContexts.has(context.settlerId)) {
			return BehaviourRuleResult.Continue
		}
		if (!pausedContexts.has(context.settlerId)) {
			context.work.requestPause(context.settlerId)
		}
		return BehaviourRuleResult.Stop
	}
}
