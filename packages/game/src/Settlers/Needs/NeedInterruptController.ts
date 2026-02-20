import type { EventManager } from '../../events'
import { Receiver } from '../../Receiver'
import type { Logger } from '../../Logs'
import type { SimulationTickData } from '../../Simulation/types'
import { NeedsEvents } from './events'
import { NeedType, NeedPriority } from './NeedTypes'
import type { NeedsSystem } from './NeedsSystem'
import type { NeedPlanner } from './NeedPlanner'
import type { NeedPlanFailedEventData, NeedPlanCreatedEventData, NeedInterruptEventData, NeedSatisfiedEventData } from './types'
import type { NeedInterruptSnapshot } from '../../state/types'
import { ActionQueueContextKind, type ActionQueueContext } from '../../state/types'
import type { SettlerAction } from '../Actions/types'
import {
	type SettlerActionFailureReason,
	type NeedPlanFailureReason,
	NeedPlanningFailureReason
} from '../failureReasons'

interface NeedInterruptState {
	activeNeed: NeedType | null
	priority: NeedPriority | null
	cooldowns: Record<NeedType, number>
}

const COOLDOWN_MS = 60000
const FAIL_COOLDOWN_MS = 15000

const createCooldowns = (): Record<NeedType, number> => ({
	[NeedType.Hunger]: 0,
	[NeedType.Fatigue]: 0
})

export interface NeedsBehaviourApi {
	enqueueNeedPlan(
		settlerId: string,
		actions: SettlerAction[],
		context: Extract<ActionQueueContext, { kind: ActionQueueContextKind.Need }>
	): boolean
	beginNeedInterrupt(settlerId: string, needType: NeedType): void
	endNeedInterrupt(settlerId: string, needType: NeedType): void
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
	}

	private setupEventHandlers(): void {
		this.event.on(NeedsEvents.SS.NeedBecameUrgent, data => {
			this.handleNeedTrigger(data.settlerId, data.needType, NeedPriority.Urgent)
		})
		this.event.on(NeedsEvents.SS.NeedBecameCritical, data => {
			this.handleNeedTrigger(data.settlerId, data.needType, NeedPriority.Critical)
		})
		this.event.on(NeedsEvents.SS.NeedSatisfied, (data: NeedSatisfiedEventData) => {
			this.handleNeedSatisfied(data)
		})
	}

	public handleNeedQueueCompleted(
		settlerId: string,
		context: Extract<ActionQueueContext, { kind: ActionQueueContextKind.Need }>
	): void {
		if (typeof context.satisfyValue === 'number') {
			this.needs.resolveNeed(settlerId, context.needType, context.satisfyValue)
		} else {
			this.needs.satisfyNeed(settlerId, context.needType)
		}
	}

	public handleNeedQueueFailed(
		settlerId: string,
		context: Extract<ActionQueueContext, { kind: ActionQueueContextKind.Need }>,
		reason: SettlerActionFailureReason
	): void {
		this.emitPlanFailed(settlerId, context.needType, reason)
		this.finishInterrupt(settlerId, context.needType, false)
	}

	public update(data: SimulationTickData): void {
		this.tickCooldowns(data)
	}

	private getState(settlerId: string): NeedInterruptState {
		let state = this.stateBySettler.get(settlerId)
		if (!state) {
			state = {
				activeNeed: null,
				priority: null,
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

		const planResult = this.planner.createPlan(settlerId, needType)
		if (!planResult.plan) {
			this.emitPlanFailed(settlerId, needType, planResult.reason || NeedPlanningFailureReason.PlanFailed)
			state.cooldowns[needType] = FAIL_COOLDOWN_MS
			return
		}

		const plan = planResult.plan
		state.activeNeed = needType
		state.priority = priority
		this.behaviour.beginNeedInterrupt(settlerId, needType)
		this.emitInterruptRequested(settlerId, needType, priority)

		this.event.emit(Receiver.All, NeedsEvents.SS.NeedPlanCreated, {
			settlerId,
			needType,
			planId: plan.id
		} as NeedPlanCreatedEventData)
		this.event.emit(Receiver.All, NeedsEvents.SS.NeedInterruptStarted, {
			settlerId,
			needType,
			level: priority
		} as NeedInterruptEventData)

		const context: Extract<ActionQueueContext, { kind: ActionQueueContextKind.Need }> = {
			kind: ActionQueueContextKind.Need,
			needType,
			satisfyValue: plan.satisfyValue
		}

		const enqueued = this.behaviour.enqueueNeedPlan(settlerId, plan.actions, context)
		if (!enqueued) {
			this.emitPlanFailed(settlerId, needType, NeedPlanningFailureReason.ActionSystemBusy)
			this.finishInterrupt(settlerId, needType, false)
		}
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
		state.cooldowns[needType] = success ? COOLDOWN_MS : FAIL_COOLDOWN_MS

		this.event.emit(Receiver.All, NeedsEvents.SS.NeedInterruptEnded, {
			settlerId,
			needType
		})
		this.behaviour.endNeedInterrupt(settlerId, needType)
	}

	private emitPlanFailed(settlerId: string, needType: NeedType, reason: NeedPlanFailureReason): void {
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
			cooldowns: { ...state.cooldowns }
		}))
	}

	deserialize(state: NeedInterruptSnapshot[]): void {
		this.stateBySettler.clear()
		for (const entry of state) {
			this.stateBySettler.set(entry.settlerId, {
				activeNeed: entry.activeNeed,
				priority: entry.priority,
				cooldowns: { ...entry.cooldowns }
			})
		}
	}

	reset(): void {
		this.stateBySettler.clear()
	}
}
