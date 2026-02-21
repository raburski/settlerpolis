import { BaseManager } from '../../Managers'
import { WorkProviderEvents } from '../Work/events'
import type { WorkAssignmentRemovedEventData } from '../Work/events'
import type { WorkStep } from '../Work/types'
import { WorkStepType, WorkWaitReason } from '../Work/types'
import { SettlerState } from '../../Population/types'
import type { ActionQueueContext } from '../../state/types'
import { ActionQueueContextKind } from '../../state/types'
import type { SettlerId } from '../../ids'
import { SimulationEvents } from '../../Simulation/events'
import type { SimulationTickData } from '../../Simulation/types'
import { SettlerActionsEvents } from '../Actions/events'
import type { ActionQueueCompletedEventData, ActionQueueFailedEventData } from '../Actions/events'
import { SettlerBehaviourState, type SettlerBehaviourSnapshot } from './SettlerBehaviourState'
import type { SettlerBehaviourDeps } from './deps'
import { MovementEvents } from '../../Movement/events'
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
	WaitStepDispatchRule,
	WorkStepLifecycleHandler
} from './rules'
import type { SettlerActionFailureReason } from '../failureReasons'
import {
	BehaviourIntentType,
	type BehaviourIntent,
	BehaviourIntentPriority,
	EnqueueActionsReason,
	PauseAssignmentReason,
	RequestDispatchReason,
	SetWaitStateReason
} from './intentTypes'
import { IntentOrigin, rankIntent, rankOrigin, type TaggedIntent } from './intentPolicy'

interface ResolvedSettlerIntents {
	settlerId: SettlerId
	assignmentIntent?: BehaviourIntent
	waitIntent?: BehaviourIntent
	enqueueIntent?: Extract<BehaviourIntent, { type: BehaviourIntentType.EnqueueActions }>
	dispatchIntent?: Extract<BehaviourIntent, { type: BehaviourIntentType.RequestDispatch }>
}

export class SettlerBehaviourManager extends BaseManager<SettlerBehaviourDeps> {
	private readonly state = new SettlerBehaviourState()
	private readonly preDispatchRules: BehaviourDispatchRule[] = [
		new PauseDispatchRule(),
		new NoAssignmentDispatchRule(),
		new MovementRecoveryDispatchRule()
	]
	private readonly stepDispatchRules: BehaviourDispatchRule[] = [
		new HomeRelocationDispatchRule(),
		new NoStepDispatchRule(),
		new WaitStepDispatchRule(),
		new ActiveStepDispatchRule()
	]
	private readonly stepLifecycle: WorkStepLifecycleHandler
	private pendingIntents: BehaviourIntent[] = []
	private arrivalOrder = 0

	constructor(managers: SettlerBehaviourDeps) {
		super(managers)
		this.stepLifecycle = new WorkStepLifecycleHandler({
			managers,
			work: managers.work,
			state: this.state,
			event: managers.event,
			dispatchNextStep: (settlerId: SettlerId) => {
				this.enqueueIntent({
					type: BehaviourIntentType.RequestDispatch,
					priority: BehaviourIntentPriority.Normal,
					settlerId,
					reason: RequestDispatchReason.QueueCompleted
				})
			}
		})

		this.managers.event.on<SimulationTickData>(SimulationEvents.SS.Tick, this.handleSimulationSSTick)
		this.managers.event.on<WorkAssignmentRemovedEventData>(WorkProviderEvents.SS.AssignmentRemoved, this.handleAssignmentRemoved)
		this.managers.event.on<ActionQueueCompletedEventData>(SettlerActionsEvents.SS.QueueCompleted, this.handleActionQueueCompleted)
		this.managers.event.on<ActionQueueFailedEventData>(SettlerActionsEvents.SS.QueueFailed, this.handleActionQueueFailed)
		this.managers.event.on<{ requesterEntityId: string, blockerEntityId: string, mapId: string, tile: { x: number, y: number } }>(
			MovementEvents.SS.YieldRequested,
			this.handleMovementSSYieldRequested
		)
	}

	private readonly handleSimulationSSTick = (data: SimulationTickData): void => {
		this.managers.work.refreshWorldDemand(data)
		this.managers.needs.update(data)
		this.managers.navigation.update()

		this.collectPendingDispatchIntents()

		const tagged = [
			...this.tagIntents(IntentOrigin.Needs, this.managers.needs.consumePendingIntents()),
			...this.tagIntents(IntentOrigin.Navigation, this.managers.navigation.consumePendingIntents()),
			...this.tagIntents(IntentOrigin.Work, this.managers.work.consumePendingIntents()),
			...this.tagIntents(IntentOrigin.Behaviour, this.consumePendingIntents())
		]

		const resolved = this.resolvePerSettler(tagged)
		this.executeResolvedIntents(resolved)
	}

	private readonly handleAssignmentRemoved = (data: WorkAssignmentRemovedEventData): void => {
		this.clearSettlerState(data.settlerId)
	}

	private readonly handleActionQueueCompleted = (data: ActionQueueCompletedEventData): void => {
		const context = data.context
		if (!context) {
			return
		}
		if (context.kind === ActionQueueContextKind.Work) {
			this.buildWorkQueueCallbacks(data.settlerId, context.step).onComplete()
			return
		}
		if (context.kind === ActionQueueContextKind.Need) {
			this.managers.needs.handleNeedQueueCompleted(data.settlerId, context)
		}
	}

	private readonly handleActionQueueFailed = (data: ActionQueueFailedEventData): void => {
		const context = data.context
		if (!context) {
			return
		}
		if (context.kind === ActionQueueContextKind.Work) {
			this.buildWorkQueueCallbacks(data.settlerId, context.step).onFail(data.reason)
			return
		}
		if (context.kind === ActionQueueContextKind.Need) {
			this.managers.needs.handleNeedQueueFailed(data.settlerId, context, data.reason)
		}
	}

	private readonly handleMovementSSYieldRequested = (
		data: { requesterEntityId: string, blockerEntityId: string, mapId: string, tile: { x: number, y: number } }
	): void => {
		this.managers.navigation.onYieldRequested(data)
	}

	private enqueueIntent(intent: BehaviourIntent): void {
		this.pendingIntents.push(intent)
	}

	private consumePendingIntents(): BehaviourIntent[] {
		const intents = this.pendingIntents
		this.pendingIntents = []
		return intents
	}

	private tagIntents(origin: IntentOrigin, intents: BehaviourIntent[]): TaggedIntent[] {
		return intents.map(intent => ({
			origin,
			intent,
			arrivalOrder: ++this.arrivalOrder
		}))
	}

	private collectPendingDispatchIntents(): void {
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
			this.enqueueIntent({
				type: BehaviourIntentType.RequestDispatch,
				priority: BehaviourIntentPriority.Normal,
				settlerId,
				reason: RequestDispatchReason.Recovery
			})
		}
	}

	private resolvePerSettler(taggedIntents: TaggedIntent[]): ResolvedSettlerIntents[] {
		const bySettler = new Map<string, TaggedIntent[]>()
		for (const tagged of taggedIntents) {
			const list = bySettler.get(tagged.intent.settlerId)
			if (list) {
				list.push(tagged)
			} else {
				bySettler.set(tagged.intent.settlerId, [tagged])
			}
		}

		const resolved: ResolvedSettlerIntents[] = []
		for (const [settlerId, intents] of bySettler.entries()) {
			intents.sort((a, b) => {
				const priorityDelta = rankIntent(b.intent) - rankIntent(a.intent)
				if (priorityDelta !== 0) {
					return priorityDelta
				}
				const originDelta = rankOrigin(b.origin) - rankOrigin(a.origin)
				if (originDelta !== 0) {
					return originDelta
				}
				return b.arrivalOrder - a.arrivalOrder
			})

			const entry: ResolvedSettlerIntents = { settlerId }
			for (const tagged of intents) {
				switch (tagged.intent.type) {
					case BehaviourIntentType.PauseAssignment:
					case BehaviourIntentType.ResumeAssignment:
						if (!entry.assignmentIntent) {
							entry.assignmentIntent = tagged.intent
						}
						break
					case BehaviourIntentType.SetWaitState:
						if (!entry.waitIntent) {
							entry.waitIntent = tagged.intent
						}
						break
					case BehaviourIntentType.EnqueueActions:
						if (!entry.enqueueIntent) {
							entry.enqueueIntent = tagged.intent
						}
						break
					case BehaviourIntentType.RequestDispatch:
						if (!entry.dispatchIntent) {
							entry.dispatchIntent = tagged.intent
						}
						break
				}
			}

			if (entry.enqueueIntent && entry.dispatchIntent) {
				if (rankIntent(entry.dispatchIntent) >= rankIntent(entry.enqueueIntent)) {
					entry.enqueueIntent = undefined
				} else {
					entry.dispatchIntent = undefined
				}
			}
			resolved.push(entry)
		}

		return resolved
	}

	private executeResolvedIntents(resolvedIntents: ResolvedSettlerIntents[]): void {
		for (const resolved of resolvedIntents) {
			if (resolved.assignmentIntent) {
				this.executeAssignmentIntent(resolved.assignmentIntent)
			}
			if (resolved.waitIntent && !this.managers.actions.isBusy(resolved.settlerId)) {
				this.executeWaitIntent(resolved.waitIntent)
			}
			if (resolved.enqueueIntent) {
				this.executeEnqueueIntent(resolved.enqueueIntent)
			}
			if (resolved.dispatchIntent) {
				this.executeDispatchIntent(resolved.dispatchIntent)
			}
		}
	}

	private executeAssignmentIntent(intent: BehaviourIntent): void {
		if (intent.type === BehaviourIntentType.PauseAssignment) {
			if (intent.reason === PauseAssignmentReason.NeedInterrupt) {
				this.state.clearPendingDispatch(intent.settlerId)
				this.managers.work.pauseAssignment(intent.settlerId, 'NEED')
				if (this.managers.actions.isBusy(intent.settlerId)) {
					this.managers.actions.abort(intent.settlerId)
				}
				return
			}
			this.managers.work.pauseAssignment(intent.settlerId, intent.reason)
			return
		}
		if (intent.type === BehaviourIntentType.ResumeAssignment) {
			this.managers.work.resumeAssignment(intent.settlerId)
		}
	}

	private executeWaitIntent(intent: BehaviourIntent): void {
		if (intent.type !== BehaviourIntentType.SetWaitState) {
			return
		}

		if (intent.reason === SetWaitStateReason.ClearWait) {
			this.managers.population.setSettlerWaitReason(intent.settlerId, undefined)
			this.managers.population.setSettlerState(intent.settlerId, intent.state ?? SettlerState.Idle)
			return
		}

		this.managers.population.setSettlerWaitReason(intent.settlerId, intent.waitReason ?? WorkWaitReason.NoWork)
		this.managers.population.setSettlerState(intent.settlerId, intent.state ?? SettlerState.WaitingForWork)
	}

	private executeEnqueueIntent(intent: Extract<BehaviourIntent, { type: BehaviourIntentType.EnqueueActions }>): void {
		if (intent.actions.length === 0) {
			if (intent.context.kind === ActionQueueContextKind.Need) {
				this.managers.needs.onNeedPlanEnqueueFailed(intent.settlerId, intent.context.needType)
			}
			return
		}

		if (this.managers.actions.isBusy(intent.settlerId)) {
			if (intent.reason === EnqueueActionsReason.NavigationYield) {
				if (!this.managers.actions.isCurrentActionYieldInterruptible(intent.settlerId)) {
					return
				}
				this.managers.actions.expediteCurrentWaitAction(intent.settlerId)
				this.managers.actions.insertActionsAfterCurrent(intent.settlerId, intent.actions)
				return
			}
			if (intent.context.kind === ActionQueueContextKind.Need) {
				this.managers.needs.onNeedPlanEnqueueFailed(intent.settlerId, intent.context.needType)
			}
			return
		}

		this.managers.actions.enqueue(intent.settlerId, intent.actions, undefined, undefined, intent.context)
	}

	private executeDispatchIntent(intent: Extract<BehaviourIntent, { type: BehaviourIntentType.RequestDispatch }>): void {
		const now = this.managers.work.getNowMs()
		if (typeof intent.atMs === 'number' && now < intent.atMs) {
			this.state.schedulePendingDispatch(intent.settlerId, intent.atMs)
			return
		}
		if (this.managers.actions.isBusy(intent.settlerId)) {
			this.state.schedulePendingDispatch(intent.settlerId, now + 250)
			return
		}
		this.state.clearPendingDispatch(intent.settlerId)
		this.dispatchNextStep(intent.settlerId)
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

		if (!context.assignment) {
			return
		}

		const dispatchResult = this.managers.work.requestDispatchStep(settlerId)
		if (dispatchResult.status === 'provider_missing') {
			this.managers.population.setSettlerWaitReason(settlerId, WorkWaitReason.ProviderMissing)
			this.managers.population.setSettlerLastStep(settlerId, undefined, WorkWaitReason.ProviderMissing)
			this.managers.work.unassignSettler(settlerId)
			return
		}
		if (dispatchResult.status === 'no_assignment') {
			return
		}
		context.step = dispatchResult.step
		if (this.applyDispatchRules(this.stepDispatchRules, context)) {
			return
		}

		if (!context.step) {
			return
		}

		this.managers.work.onStepIssued(settlerId, context.assignment, context.step)
		const actions = this.managers.work.buildActionsForStep(settlerId, context.assignment, context.step)

		if (!actions || actions.length === 0) {
			if (context.step.type === WorkStepType.Wait) {
				this.managers.population.setSettlerWaitReason(settlerId, context.step.reason)
			} else {
				this.managers.population.setSettlerWaitReason(settlerId, WorkWaitReason.NoWork)
			}
			this.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
			return
		}

		const queueContext: ActionQueueContext = {
			kind: ActionQueueContextKind.Work,
			step: context.step
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
		step?: WorkStep
	): { onComplete: () => void, onFail: (reason: SettlerActionFailureReason) => void } {
		return this.stepLifecycle.buildCallbacks(settlerId, step)
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
		this.pendingIntents = []
		this.arrivalOrder = 0
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
}

export { SettlerBehaviourManager as DispatchCoordinator }
export type { SettlerBehaviourDeps } from './deps'
