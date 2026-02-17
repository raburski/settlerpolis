import { WorkProviderType, WorkStepType, WorkWaitReason } from '../../Work/types'
import { isWarehouseLogisticsAssignment } from './assignmentPredicates'
import { BehaviourRuleResult, type BehaviourDispatchRule, type BehaviourDispatchRuleContext } from './types'

export class WaitStepDispatchRule implements BehaviourDispatchRule {
	public readonly id = 'wait-step'

	public apply(context: BehaviourDispatchRuleContext): BehaviourRuleResult {
		if (!context.step || context.step.type !== WorkStepType.Wait || !context.assignment) {
			return BehaviourRuleResult.Continue
		}
		if (context.homeRelocation.tryEnqueue(context, context.assignment)) {
			return BehaviourRuleResult.Stop
		}

		context.managers.population.setSettlerWaitReason(context.settlerId, context.step.reason)
		context.managers.population.setSettlerLastStep(context.settlerId, context.step.type, context.step.reason)

		if (context.assignment.providerType === WorkProviderType.Logistics &&
			(context.step.reason === WorkWaitReason.NoRequests || context.step.reason === WorkWaitReason.NoViableRequest)) {
			if (!isWarehouseLogisticsAssignment(context.assignment, context.managers)) {
				context.work.unassignSettler(context.settlerId)
				return BehaviourRuleResult.Stop
			}
		}
		if (context.assignment.providerType === WorkProviderType.Road &&
			(context.step.reason === WorkWaitReason.NoWork || context.step.reason === WorkWaitReason.WrongProfession)) {
			context.work.unassignSettler(context.settlerId)
			return BehaviourRuleResult.Stop
		}
		if (context.assignment.providerType === WorkProviderType.Prospecting &&
			(context.step.reason === WorkWaitReason.NoWork || context.step.reason === WorkWaitReason.WrongProfession)) {
			context.work.unassignSettler(context.settlerId)
			return BehaviourRuleResult.Stop
		}
		if (context.assignment.providerType === WorkProviderType.Construction && context.step.reason === WorkWaitReason.WrongProfession) {
			context.work.unassignSettler(context.settlerId)
			return BehaviourRuleResult.Stop
		}

		return BehaviourRuleResult.Continue
	}
}
