import type { SettlerId } from '../../../ids'
import { ActionQueueContextKind, type ActionQueueContext } from '../../../state/types'
import type { NeedInterruptPlanRequest } from '../../Needs/types'
import type { NeedType } from '../../Needs/NeedTypes'
import type { SettlerAction } from '../../Actions/types'
import type { SettlerActionFailureReason } from '../../failureReasons'
import type { SettlerBehaviourState } from '../SettlerBehaviourState'
import type { SettlerBehaviourDeps } from '../deps'

type NeedQueueContext = Extract<ActionQueueContext, { kind: ActionQueueContextKind.Need }>

interface NeedInterruptCoordinatorDeps {
	managers: Pick<SettlerBehaviourDeps, 'actions' | 'work' | 'needs'>
	state: SettlerBehaviourState
	dispatchNextStep: (settlerId: SettlerId) => void
}

export class NeedInterruptCoordinator {
	constructor(private readonly deps: NeedInterruptCoordinatorDeps) {}

	public processPendingNeedInterruptPlans(): void {
		const requests = this.deps.managers.needs.consumePendingInterruptPlans()
		for (const request of requests) {
			this.startNeedInterruptPlan(request)
		}
	}

	public handleNeedQueueCompleted(settlerId: SettlerId, context: NeedQueueContext): void {
		this.deps.managers.needs.handleNeedQueueCompleted(settlerId, context)
		this.endNeedInterrupt(settlerId, context.needType)
	}

	public handleNeedQueueFailed(
		settlerId: SettlerId,
		context: NeedQueueContext,
		reason: SettlerActionFailureReason
	): void {
		this.deps.managers.needs.handleNeedQueueFailed(settlerId, context, reason)
		this.endNeedInterrupt(settlerId, context.needType)
	}

	private startNeedInterruptPlan(request: NeedInterruptPlanRequest): void {
		const { settlerId, needType, plan } = request
		this.beginNeedInterrupt(settlerId, needType)
		if (!plan.actions || plan.actions.length === 0) {
			this.deps.managers.needs.handleNeedPlanEnqueueFailed(settlerId, needType)
			this.endNeedInterrupt(settlerId, needType)
			return
		}
		const context: NeedQueueContext = {
			kind: ActionQueueContextKind.Need,
			needType,
			satisfyValue: plan.satisfyValue
		}
		const enqueued = this.enqueueNeedPlan(settlerId, plan.actions, context)
		if (!enqueued) {
			this.deps.managers.needs.handleNeedPlanEnqueueFailed(settlerId, needType)
			this.endNeedInterrupt(settlerId, needType)
		}
	}

	private enqueueNeedPlan(
		settlerId: SettlerId,
		actions: SettlerAction[],
		context: NeedQueueContext
	): boolean {
		if (this.deps.managers.actions.isBusy(settlerId)) {
			return false
		}
		this.deps.managers.actions.enqueue(settlerId, actions, undefined, undefined, context)
		return true
	}

	private beginNeedInterrupt(settlerId: SettlerId, _needType: NeedType): void {
		this.deps.state.clearPendingDispatch(settlerId)
		this.deps.managers.work.pauseAssignment(settlerId, 'NEED')
		if (this.deps.managers.actions.isBusy(settlerId)) {
			this.deps.managers.actions.abort(settlerId)
		}
	}

	private endNeedInterrupt(settlerId: SettlerId, _needType: NeedType): void {
		this.deps.managers.work.resumeAssignment(settlerId)
		if (!this.deps.managers.actions.isBusy(settlerId)) {
			this.deps.dispatchNextStep(settlerId)
		}
	}
}
