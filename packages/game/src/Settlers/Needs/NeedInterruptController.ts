import type { EventManager } from '../../events'
import { Receiver } from '../../Receiver'
import type { Logger } from '../../Logs'
import { SimulationEvents } from '../../Simulation/events'
import type { SimulationTickData } from '../../Simulation/types'
import { NeedsEvents } from './events'
import { NeedType, NeedPriority } from './NeedTypes'
import type { NeedsSystem } from './NeedsSystem'
import type { NeedPlanner } from './NeedPlanner'
import type { ContextPausedEventData, NeedPlanFailedEventData, NeedPlanCreatedEventData, NeedInterruptEventData, NeedSatisfiedEventData } from './types'
import type { NeedInterruptSnapshot } from '../../state/types'
import { ActionQueueContextKind, type ActionQueueContext } from '../../state/types'
import type { WorkAction } from '../Work/types'

interface PendingNeed {
	needType: NeedType
	priority: NeedPriority
}

interface NeedInterruptState {
	activeNeed: NeedType | null
	priority: NeedPriority | null
	pendingNeed?: PendingNeed
	pausedContext: ContextPausedEventData['context']
	cooldowns: Record<NeedType, number>
}

const COOLDOWN_MS = 60000
const FAIL_COOLDOWN_MS = 15000

const createCooldowns = (): Record<NeedType, number> => ({
	[NeedType.Hunger]: 0,
	[NeedType.Fatigue]: 0
})

export interface NeedsBehaviourApi {
	registerNeedPlanCallbacksResolver(
		resolver: (settlerId: string, context: Extract<ActionQueueContext, { kind: ActionQueueContextKind.Need }>, actions: WorkAction[]) => {
			onComplete?: () => void
			onFail?: (reason: string) => void
		}
	): void
	enqueueNeedPlan(
		settlerId: string,
		actions: WorkAction[],
		context: Extract<ActionQueueContext, { kind: ActionQueueContextKind.Need }>,
		onComplete?: () => void,
		onFail?: (reason: string) => void
	): void
}

export class NeedInterruptController {
	private stateBySettler = new Map<string, NeedInterruptState>()

	constructor(
		private event: EventManager,
		private needs: NeedsSystem,
		private planner: NeedPlanner,
		private behaviour: NeedsBehaviourApi,
		private logger: Logger
	) {
		this.setupEventHandlers()
		this.behaviour.registerNeedPlanCallbacksResolver((settlerId, context) => {
			return {
				onComplete: () => {
					if (typeof context.satisfyValue === 'number') {
						this.needs.resolveNeed(settlerId, context.needType, context.satisfyValue)
					} else {
						this.needs.satisfyNeed(settlerId, context.needType)
					}
				},
				onFail: (reason: string) => {
					this.emitPlanFailed(settlerId, context.needType, reason)
					this.finishInterrupt(settlerId, context.needType, false)
				}
			}
		})
	}

	private setupEventHandlers(): void {
		this.event.on(NeedsEvents.SS.NeedBecameUrgent, data => {
			this.handleNeedTrigger(data.settlerId, data.needType, NeedPriority.Urgent)
		})
		this.event.on(NeedsEvents.SS.NeedBecameCritical, data => {
			this.handleNeedTrigger(data.settlerId, data.needType, NeedPriority.Critical)
		})
		this.event.on(NeedsEvents.SS.ContextPaused, (data: ContextPausedEventData) => {
			this.handleContextPaused(data)
		})
		this.event.on(NeedsEvents.SS.NeedSatisfied, (data: NeedSatisfiedEventData) => {
			this.handleNeedSatisfied(data)
		})
		this.event.on(SimulationEvents.SS.Tick, (data: SimulationTickData) => {
			this.tickCooldowns(data)
		})
	}

	private getState(settlerId: string): NeedInterruptState {
		let state = this.stateBySettler.get(settlerId)
		if (!state) {
			state = {
				activeNeed: null,
				priority: null,
				pendingNeed: undefined,
				pausedContext: null,
				cooldowns: createCooldowns()
			}
			this.stateBySettler.set(settlerId, state)
		}
		return state
	}

	private tickCooldowns(data: SimulationTickData): void {
		for (const state of this.stateBySettler.values()) {
			for (const needType of Object.values(NeedType)) {
				const remaining = state.cooldowns[needType]
				if (remaining <= 0) {
					continue
				}
				state.cooldowns[needType] = Math.max(0, remaining - data.deltaMs)
			}
		}
	}

	private handleNeedTrigger(settlerId: string, needType: NeedType, priority: NeedPriority): void {
		const state = this.getState(settlerId)
		if (state.cooldowns[needType] > 0) {
			return
		}

		if (state.activeNeed) {
			if (state.activeNeed === needType && state.priority === NeedPriority.Urgent && priority === NeedPriority.Critical) {
				state.priority = NeedPriority.Critical
			}
			return
		}

		if (state.pendingNeed) {
			if (state.pendingNeed.needType === needType && state.pendingNeed.priority === priority) {
				return
			}
			if (state.pendingNeed.priority === NeedPriority.Urgent && priority === NeedPriority.Critical) {
				state.pendingNeed = { needType, priority }
				this.emitInterruptRequested(settlerId, needType, priority)
			}
			return
		}

		state.pendingNeed = { needType, priority }
		this.emitInterruptRequested(settlerId, needType, priority)
		this.event.emit(Receiver.All, NeedsEvents.SS.ContextPauseRequested, {
			settlerId,
			reason: 'NEED'
		})
	}

	private handleContextPaused(data: ContextPausedEventData): void {
		const state = this.getState(data.settlerId)
		if (!state.pendingNeed) {
			return
		}

		const { needType, priority } = state.pendingNeed
		state.pendingNeed = undefined
		state.activeNeed = needType
		state.priority = priority
		state.pausedContext = data.context

		const planResult = this.planner.createPlan(data.settlerId, needType)
		if (!planResult.plan) {
			this.emitPlanFailed(data.settlerId, needType, planResult.reason || 'plan_failed')
			this.finishInterrupt(data.settlerId, needType, false)
			return
		}

		const plan = planResult.plan
		this.event.emit(Receiver.All, NeedsEvents.SS.NeedPlanCreated, {
			settlerId: data.settlerId,
			needType,
			planId: plan.id
		} as NeedPlanCreatedEventData)
		this.event.emit(Receiver.All, NeedsEvents.SS.NeedInterruptStarted, {
			settlerId: data.settlerId,
			needType,
			level: priority
		} as NeedInterruptEventData)

		const context: Extract<ActionQueueContext, { kind: ActionQueueContextKind.Need }> = {
			kind: ActionQueueContextKind.Need,
			needType,
			satisfyValue: plan.satisfyValue,
			reservationOwnerId: data.settlerId
		}

		this.behaviour.enqueueNeedPlan(data.settlerId, plan.actions, context, () => {
			plan.releaseReservations?.()
			if (typeof plan.satisfyValue === 'number') {
				this.needs.resolveNeed(data.settlerId, needType, plan.satisfyValue)
			} else {
				this.needs.satisfyNeed(data.settlerId, needType)
			}
		}, (reason) => {
			plan.releaseReservations?.()
			this.emitPlanFailed(data.settlerId, needType, reason)
			this.finishInterrupt(data.settlerId, needType, false)
		})
	}

	private handleNeedSatisfied(data: NeedSatisfiedEventData): void {
		const state = this.getState(data.settlerId)
		if (state.activeNeed !== data.needType) {
			return
		}
		this.finishInterrupt(data.settlerId, data.needType, true)
	}

	private finishInterrupt(settlerId: string, needType: NeedType, success: boolean): void {
		const state = this.getState(settlerId)
		state.activeNeed = null
		state.priority = null
		state.pausedContext = null
		state.pendingNeed = undefined
		state.cooldowns[needType] = success ? COOLDOWN_MS : FAIL_COOLDOWN_MS

		this.event.emit(Receiver.All, NeedsEvents.SS.NeedInterruptEnded, {
			settlerId,
			needType
		})
		this.event.emit(Receiver.All, NeedsEvents.SS.ContextResumeRequested, { settlerId })
	}

	private emitPlanFailed(settlerId: string, needType: NeedType, reason: string): void {
		this.logger.warn(`[Needs] Plan failed for ${settlerId} (${needType}): ${reason}`)
		this.event.emit(Receiver.All, NeedsEvents.SS.NeedPlanFailed, {
			settlerId,
			needType,
			reason
		} as NeedPlanFailedEventData)
	}

	private emitInterruptRequested(settlerId: string, needType: NeedType, priority: NeedPriority): void {
		this.event.emit(Receiver.All, NeedsEvents.SS.NeedInterruptRequested, {
			settlerId,
			needType,
			level: priority
		} as NeedInterruptEventData)
	}

	serialize(): NeedInterruptSnapshot[] {
		return Array.from(this.stateBySettler.entries()).map(([settlerId, state]) => ({
			settlerId,
			activeNeed: state.activeNeed,
			priority: state.priority,
			pendingNeed: state.pendingNeed ? { ...state.pendingNeed } : null,
			pausedContext: state.pausedContext ?? null,
			cooldowns: { ...state.cooldowns }
		}))
	}

	deserialize(state: NeedInterruptSnapshot[]): void {
		this.stateBySettler.clear()
		for (const entry of state) {
			this.stateBySettler.set(entry.settlerId, {
				activeNeed: entry.activeNeed,
				priority: entry.priority,
				pendingNeed: entry.pendingNeed ? { ...entry.pendingNeed } : undefined,
				pausedContext: entry.pausedContext ?? null,
				cooldowns: { ...entry.cooldowns }
			})
		}
	}

	reset(): void {
		this.stateBySettler.clear()
	}
}
