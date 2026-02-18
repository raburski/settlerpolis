import { BaseManager } from '../../Managers'
import { WorkProviderEvents } from '../Work/events'
import type { WorkAssignmentRemovedEventData, WorkDispatchRequestedEventData } from '../Work/events'
import type { WorkAssignment, WorkStep, WorkAction } from '../Work/types'
import { WorkStepType, WorkWaitReason } from '../Work/types'
import { SettlerState } from '../../Population/types'
import { StepHandlers } from '../Work/stepHandlers'
import type { ActionQueueContext } from '../../state/types'
import { ActionQueueContextKind } from '../../state/types'
import type { SettlerId } from '../../ids'
import { SimulationEvents } from '../../Simulation/events'
import type { SimulationTickData } from '../../Simulation/types'
import type { NeedType } from '../Needs/NeedTypes'
import { SettlerActionsEvents } from '../Actions/events'
import type { ActionQueueCompletedEventData, ActionQueueFailedEventData } from '../Actions/events'
import { SettlerBehaviourState, type SettlerBehaviourSnapshot } from './SettlerBehaviourState'
import type { SettlerBehaviourDeps } from './deps'
import {
	ActiveStepDispatchRule,
	BehaviourRuleResult,
	type BehaviourDispatchRule,
	type BehaviourDispatchRuleContext,
	HomeRelocationDispatchRule,
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
	private readonly preDispatchRules: BehaviourDispatchRule[] = [
		new PauseDispatchRule(),
		new NoAssignmentDispatchRule(),
		new MovementRecoveryDispatchRule(),
		new ProviderDispatchRule()
	]
	private readonly stepDispatchRules: BehaviourDispatchRule[] = [
		new HomeRelocationDispatchRule(),
		new NoStepDispatchRule(),
		new WaitStepDispatchRule(),
		new ActiveStepDispatchRule()
	]
	private readonly stepLifecycle: WorkStepLifecycleHandler

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
		this.managers.event.on<WorkDispatchRequestedEventData>(WorkProviderEvents.SS.DispatchRequested, this.handleDispatchRequested)
		this.managers.event.on<WorkAssignmentRemovedEventData>(WorkProviderEvents.SS.AssignmentRemoved, this.handleAssignmentRemoved)
		this.managers.event.on<ActionQueueCompletedEventData>(SettlerActionsEvents.SS.QueueCompleted, this.handleActionQueueCompleted)
		this.managers.event.on<ActionQueueFailedEventData>(SettlerActionsEvents.SS.QueueFailed, this.handleActionQueueFailed)
	}

	private readonly handleSimulationSSTick = (_data: SimulationTickData): void => {
		this.managers.work.refreshWorldDemand(_data)
		this.managers.needs.update(_data)

		this.processPendingDispatches()
	}

	private readonly handleDispatchRequested = (data: WorkDispatchRequestedEventData): void => {
		this.dispatchNextStep(data.settlerId)
	}

	private readonly handleAssignmentRemoved = (data: WorkAssignmentRemovedEventData): void => {
		this.clearSettlerState(data.settlerId)
	}

	private readonly handleActionQueueCompleted = (data: ActionQueueCompletedEventData): void => {
		const context = data.context
		if (!context || context.kind !== ActionQueueContextKind.Work) {
			return
		}
		this.buildWorkQueueCallbacks(data.settlerId, context.step).onComplete()
	}

	private readonly handleActionQueueFailed = (data: ActionQueueFailedEventData): void => {
		const context = data.context
		if (!context || context.kind !== ActionQueueContextKind.Work) {
			return
		}
		this.buildWorkQueueCallbacks(data.settlerId, context.step).onFail(data.reason)
	}

	enqueueNeedPlan(
		settlerId: SettlerId,
		actions: WorkAction[],
		context: Extract<ActionQueueContext, { kind: ActionQueueContextKind.Need }>
	): boolean {
		if (this.managers.actions.isBusy(settlerId)) {
			return false
		}
		this.managers.actions.enqueue(settlerId, actions, undefined, undefined, context)
		return true
	}

	public beginNeedInterrupt(settlerId: SettlerId, _needType: NeedType): void {
		this.state.clearPendingDispatch(settlerId)
		this.managers.work.pauseAssignment(settlerId, 'NEED')
		if (this.managers.actions.isBusy(settlerId)) {
			this.managers.actions.abort(settlerId)
		}
	}

	public endNeedInterrupt(settlerId: SettlerId, _needType: NeedType): void {
		this.managers.work.resumeAssignment(settlerId)
		if (!this.managers.actions.isBusy(settlerId)) {
			this.dispatchNextStep(settlerId)
		}
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

		this.managers.work.onStepIssued(settlerId, context.assignment, context.step)
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

		const queueContext: ActionQueueContext = {
			kind: ActionQueueContextKind.Work,
			step: context.step,
			reservationOwnerId: context.assignment.assignmentId
		}
		this.managers.actions.enqueue(settlerId, actions, undefined, undefined, queueContext)
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
		this.resetRules()
		this.state.reset()
	}

	private resetRules(): void {
		for (const rule of this.preDispatchRules) {
			rule.reset?.()
		}
		for (const rule of this.stepDispatchRules) {
			rule.reset?.()
		}
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
