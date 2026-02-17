import { SettlerState } from '../../../Population/types'
import { WorkWaitReason } from '../../Work/types'
import { BehaviourRuleResult, type BehaviourDispatchRule, type BehaviourDispatchRuleContext } from './types'

export class MovementRecoveryDispatchRule implements BehaviourDispatchRule {
	public readonly id = 'movement-recovery'

	public apply(context: BehaviourDispatchRuleContext): BehaviourRuleResult {
		const recoveryUntil = context.state.getMovementRecoveryUntil(context.settlerId)
		if (!recoveryUntil) {
			return BehaviourRuleResult.Continue
		}
		if (context.nowMs >= recoveryUntil) {
			context.state.clearMovementRecovery(context.settlerId)
			return BehaviourRuleResult.Continue
		}
		const reason = context.state.getMovementRecoveryReason(context.settlerId) ?? WorkWaitReason.MovementFailed
		context.managers.population.setSettlerWaitReason(context.settlerId, reason)
		context.managers.population.setSettlerLastStep(context.settlerId, undefined, reason)
		context.managers.population.setSettlerState(context.settlerId, SettlerState.WaitingForWork)
		return BehaviourRuleResult.Stop
	}
}
