import type { WorkPolicy, WorkPolicyContext, WorkPolicyResult } from './policies/types'
import { WorkPolicyPhase, WorkPolicyResultType } from './policies/constants'
import type { WorkStep } from './types'
import type { ActionQueueContext } from '../../state/types'
import { ActionQueueContextKind } from '../../state/types'
import type { WorkProviderDeps } from './deps'
import type { ActionSystem } from './ActionSystem'
import type { AssignmentStore } from './AssignmentStore'
import type { SettlerId } from '../../ids'
import { SettlerState } from '../../Population/types'

export class PolicyEngine {
	constructor(
		private policies: WorkPolicy[],
		private managers: WorkProviderDeps,
		private actionSystem: ActionSystem,
		private assignments: AssignmentStore,
		private dispatchNextStep: (settlerId: SettlerId) => void
	) {}

	evaluate(phase: WorkPolicyPhase, ctx: WorkPolicyContext, step?: WorkStep): WorkPolicyResult | null {
		for (const policy of this.policies) {
			let result: WorkPolicyResult | null = null
			if (phase === WorkPolicyPhase.BeforeStep && policy.onBeforeStep) {
				result = policy.onBeforeStep(ctx)
			} else if (phase === WorkPolicyPhase.NoStep && policy.onNoStep) {
				result = policy.onNoStep(ctx)
			} else if (phase === WorkPolicyPhase.WaitStep && policy.onWaitStep && step) {
				result = policy.onWaitStep(ctx, step)
			}
			if (result) {
				return result
			}
		}
		return null
	}

	apply(settlerId: SettlerId, result: WorkPolicyResult | null): boolean {
		if (!result) {
			return false
		}

		if (result.type === WorkPolicyResultType.Block) {
			this.managers.population.setSettlerWaitReason(settlerId, result.reason)
			this.managers.population.setSettlerLastStep(settlerId, undefined, result.reason)
			this.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
			return true
		}

		if (result.type === WorkPolicyResultType.Enqueue) {
			if (this.actionSystem.isBusy(settlerId)) {
				return true
			}
			this.managers.population.setSettlerWaitReason(settlerId, undefined)
			const reservationOwnerId = this.assignments.get(settlerId)?.assignmentId
			const context: ActionQueueContext = { kind: ActionQueueContextKind.Work, reservationOwnerId }
			this.actionSystem.enqueue(settlerId, result.actions, () => {
				result.onComplete?.()
				this.dispatchNextStep(settlerId)
			}, (reason) => {
				result.onFail?.(reason)
				this.dispatchNextStep(settlerId)
			}, context)
			return true
		}

		return false
	}
}
