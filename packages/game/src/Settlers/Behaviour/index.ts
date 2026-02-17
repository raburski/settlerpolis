import { Receiver } from '../../Receiver'
import { BaseManager } from '../../Managers'
import { WorkProviderEvents } from '../Work/events'
import type { WorkAssignment, WorkStep, WorkAction } from '../Work/types'
import { WorkStepType, WorkWaitReason } from '../Work/types'
import { SettlerState } from '../../Population/types'
import { StepHandlers } from '../Work/stepHandlers'
import type { ActionQueueContext } from '../../state/types'
import { ActionQueueContextKind } from '../../state/types'
import type { SettlerId } from '../../ids'
import { SimulationEvents } from '../../Simulation/events'
import type { SimulationTickData } from '../../Simulation/types'
import { SettlerBehaviourState, type SettlerBehaviourSnapshot } from './SettlerBehaviourState'
import type { SettlerBehaviourDeps } from './deps'
import {
	ActiveStepDispatchRule,
	BehaviourRuleResult,
	type BehaviourDispatchRule,
	type BehaviourDispatchRuleContext,
	HomeRelocationDispatchHelper,
	MovementRecoveryDispatchRule,
	NoAssignmentDispatchRule,
	NoStepDispatchRule,
	PauseDispatchRule,
	ProviderDispatchRule,
	WaitStepDispatchRule,
	WorkStepLifecycleHandler
} from './rules'

export class SettlerBehaviourManager extends BaseManager<SettlerBehaviourDeps> {
	private readonly state = new SettlerBehaviourState()
	private readonly homeRelocation = new HomeRelocationDispatchHelper()
	private readonly preDispatchRules: BehaviourDispatchRule[] = [
		new PauseDispatchRule(),
		new NoAssignmentDispatchRule(),
		new MovementRecoveryDispatchRule(),
		new ProviderDispatchRule()
	]
	private readonly stepDispatchRules: BehaviourDispatchRule[] = [
		new NoStepDispatchRule(),
		new WaitStepDispatchRule(),
		new ActiveStepDispatchRule()
	]
	private readonly stepLifecycle: WorkStepLifecycleHandler
	private needPlanCallbacksResolver?: (
		settlerId: SettlerId,
		context: Extract<ActionQueueContext, { kind: ActionQueueContextKind.Need }>,
		actions: WorkAction[]
	) => { onComplete?: () => void, onFail?: (reason: string) => void }

	constructor(managers: SettlerBehaviourDeps) {
		super(managers)
		this.stepLifecycle = new WorkStepLifecycleHandler({
			managers,
			work: managers.work,
			state: this.state,
			event: managers.event,
			dispatchNextStep: (settlerId: SettlerId) => this.dispatchNextStep(settlerId)
		})

		this.managers.event.on<SimulationTickData>(SimulationEvents.SS.Tick, this.handleSimulationSSTick)
		this.managers.event.on<{ settlerId: SettlerId }>(WorkProviderEvents.SS.DispatchRequested, this.handleDispatchRequested)
		this.managers.event.on<{ settlerId: SettlerId }>(WorkProviderEvents.SS.AssignmentRemoved, this.handleAssignmentRemoved)
		this.managers.actions.registerContextResolver(ActionQueueContextKind.Work, (settlerId, context) => {
			if (context.kind !== ActionQueueContextKind.Work) {
				return {}
			}
			return this.buildWorkQueueCallbacks(settlerId, context.step)
		})
		this.managers.actions.registerContextResolver(ActionQueueContextKind.Need, (settlerId, context, actions) => {
			if (context.kind !== ActionQueueContextKind.Need || !this.needPlanCallbacksResolver) {
				return {}
			}
			return this.needPlanCallbacksResolver(settlerId, context, actions)
		})
	}

	private readonly handleSimulationSSTick = (_data: SimulationTickData): void => {
		this.processPendingDispatches()
	}

	private readonly handleDispatchRequested = (data: { settlerId: SettlerId }): void => {
		this.dispatchNextStep(data.settlerId)
	}

	private readonly handleAssignmentRemoved = (data: { settlerId: SettlerId }): void => {
		this.clearSettlerState(data.settlerId)
	}

	registerNeedPlanCallbacksResolver(
		resolver: (settlerId: SettlerId, context: Extract<ActionQueueContext, { kind: ActionQueueContextKind.Need }>, actions: WorkAction[]) => {
			onComplete?: () => void
			onFail?: (reason: string) => void
		}
	): void {
		this.needPlanCallbacksResolver = resolver
	}

	enqueueNeedPlan(
		settlerId: SettlerId,
		actions: WorkAction[],
		context: Extract<ActionQueueContext, { kind: ActionQueueContextKind.Need }>,
		onComplete?: () => void,
		onFail?: (reason: string) => void
	): void {
		if (this.managers.actions.isBusy(settlerId)) {
			onFail?.('action_system_busy')
			return
		}
		this.managers.actions.enqueue(settlerId, actions, onComplete, onFail, context)
	}

	processPendingDispatches(): void {
		if (!this.state.hasPendingDispatches()) {
			return
		}

		const now = this.managers.work.getNowMs()
		for (const [settlerId, dispatchAt] of this.state.getPendingDispatchEntries()) {
			if (now < dispatchAt) {
				continue
			}
			if (this.managers.actions.isBusy(settlerId)) {
				continue
			}
			this.state.clearPendingDispatch(settlerId)
			this.dispatchNextStep(settlerId)
		}
	}

		dispatchNextStep(settlerId: SettlerId): void {
		if (this.managers.actions.isBusy(settlerId)) {
			return
		}

		const context: BehaviourDispatchRuleContext = {
			settlerId,
			nowMs: this.managers.work.getNowMs(),
			managers: this.managers,
			work: this.managers.work,
			actionsManager: this.managers.actions,
			state: this.state,
			dispatchNextStep: (nextSettlerId: SettlerId) => this.dispatchNextStep(nextSettlerId),
			homeRelocation: this.homeRelocation,
			assignment: this.managers.work.getAssignment(settlerId)
		}

		if (this.applyDispatchRules(this.preDispatchRules, context)) {
			return
		}

		if (!context.provider || !context.assignment) {
			return
		}

		context.step = context.provider.requestNextStep(settlerId)
		if (this.applyDispatchRules(this.stepDispatchRules, context)) {
			return
		}

		if (!context.step) {
			return
		}

		this.managers.work.updateProductionForStep(context.assignment, context.step)

		this.managers.event.emit(Receiver.All, WorkProviderEvents.SS.StepIssued, { settlerId, step: context.step })
		const { actions, releaseReservations } = this.buildActionsForStep(settlerId, context.assignment, context.step)

		if (!actions || actions.length === 0) {
			if (context.step.type === WorkStepType.Wait) {
				this.managers.population.setSettlerWaitReason(settlerId, context.step.reason)
			} else {
				this.managers.population.setSettlerWaitReason(settlerId, WorkWaitReason.NoWork)
			}
			this.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
			releaseReservations?.()
			return
		}

		const callbacks = this.buildWorkQueueCallbacks(settlerId, context.step, releaseReservations)
		const queueContext: ActionQueueContext = {
			kind: ActionQueueContextKind.Work,
			step: context.step,
			reservationOwnerId: context.assignment.assignmentId
		}
		this.managers.actions.enqueue(settlerId, actions, callbacks.onComplete, callbacks.onFail, queueContext)
	}

	private applyDispatchRules(rules: BehaviourDispatchRule[], context: BehaviourDispatchRuleContext): boolean {
		for (const rule of rules) {
			if (rule.apply(context) === BehaviourRuleResult.Stop) {
				return true
			}
		}
		return false
	}

	buildWorkQueueCallbacks(
		settlerId: SettlerId,
		step?: WorkStep,
		releaseReservations?: () => void
	): { onComplete: () => void, onFail: (reason: string) => void } {
		return this.stepLifecycle.buildCallbacks(settlerId, step, releaseReservations)
	}

	clearSettlerState(settlerId: SettlerId): void {
		this.state.clearSettlerState(settlerId)
	}

	serialize(): SettlerBehaviourSnapshot {
		return this.state.serialize()
	}

	deserialize(state: SettlerBehaviourSnapshot): void {
		this.state.deserialize(state)
	}

	reset(): void {
		this.homeRelocation.reset()
		this.state.reset()
	}

	private buildActionsForStep(
		settlerId: SettlerId,
		assignment: WorkAssignment,
		step: WorkStep
	): { actions: WorkAction[], releaseReservations?: () => void } {
		const handler = StepHandlers[step.type]
		if (!handler) {
			return { actions: [] }
		}
		return handler.build({
			settlerId,
			assignment,
			step,
			managers: this.managers,
			reservationSystem: this.managers.reservations,
			simulationTimeMs: this.managers.work.getNowMs()
		})
	}
}

export { SettlerBehaviourManager as DispatchCoordinator }
export type { SettlerBehaviourDeps } from './deps'
