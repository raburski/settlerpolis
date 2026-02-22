import type { EventManager } from '../../events'
import { Receiver } from '../../Receiver'
import type { Logger } from '../../Logs'
import type { SimulationTickData } from '../../Simulation/types'
import { NeedsEvents } from './events'
import { NeedType, NeedPriority } from './NeedTypes'
import type { NeedsSystem } from './NeedsSystem'
import type { NeedPlanner } from './NeedPlanner'
import type {
	NeedInterruptPlanRequest,
	NeedPlan,
	NeedPlanFailedEventData,
	NeedPlanCreatedEventData,
	NeedInterruptEventData
} from './types'
import type { NeedInterruptSnapshot } from '../../state/types'
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

export class NeedInterruptController {
	private stateBySettler = new Map<string, NeedInterruptState>()
	private pendingInterruptPlans: NeedInterruptPlanRequest[] = []

	constructor(
		private event: EventManager,
		private needs: NeedsSystem,
		private planner: NeedPlanner,
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
	}

	public handleNeedQueueCompleted(
		settlerId: string,
		needType: NeedType,
		satisfyValue?: number
	): void {
		if (typeof satisfyValue === 'number') {
			this.needs.resolveNeed(settlerId, needType, satisfyValue)
		} else {
			this.needs.satisfyNeed(settlerId, needType)
		}
		this.finishInterrupt(settlerId, needType, true)
	}

	public handleNeedQueueFailed(
		settlerId: string,
		needType: NeedType,
		reason: SettlerActionFailureReason
	): void {
		this.emitPlanFailed(settlerId, needType, reason)
		this.finishInterrupt(settlerId, needType, false)
	}

	public handleNeedPlanEnqueueFailed(settlerId: string, needType: NeedType): void {
		this.emitPlanFailed(settlerId, needType, NeedPlanningFailureReason.ActionSystemBusy)
		this.finishInterrupt(settlerId, needType, false)
	}

	public update(data: SimulationTickData): void {
		this.tickCooldowns(data)
	}

	public consumePendingInterruptPlans(): NeedInterruptPlanRequest[] {
		const pending = this.pendingInterruptPlans
		this.pendingInterruptPlans = []
		return pending
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
		if (this.shouldSkipNeedTrigger(state, needType, priority)) {
			return
		}

		const planResult = this.planner.createPlan(settlerId, needType)
		if (!planResult.plan) {
			this.emitPlanFailed(settlerId, needType, planResult.reason || NeedPlanningFailureReason.PlanFailed)
			state.cooldowns[needType] = FAIL_COOLDOWN_MS
			return
		}

		this.queueNeedInterruptPlan(settlerId, needType, priority, planResult.plan)
	}

	private shouldSkipNeedTrigger(state: NeedInterruptState, needType: NeedType, priority: NeedPriority): boolean {
		if (state.cooldowns[needType] > 0) {
			return true
		}
		if (!state.activeNeed) {
			return false
		}
		if (state.activeNeed === needType && state.priority === NeedPriority.Urgent && priority === NeedPriority.Critical) {
			state.priority = NeedPriority.Critical
		}
		return true
	}

	private queueNeedInterruptPlan(settlerId: string, needType: NeedType, priority: NeedPriority, plan: NeedPlan): void {
		const state = this.getState(settlerId)
		state.activeNeed = needType
		state.priority = priority
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

		this.pendingInterruptPlans.push({
			settlerId,
			needType,
			priority,
			plan
		})
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
		this.pendingInterruptPlans = []
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
		this.pendingInterruptPlans = []
	}
}
