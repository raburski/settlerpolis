import type { EventManager } from '../../events'
import type { Logger } from '../../Logs'
import { BaseManager } from '../../Managers'
import type { BuildingManager } from '../../Buildings'
import type { LootManager } from '../../Loot'
import type { StorageManager } from '../../Storage'
import type { PopulationManager } from '../../Population'
import type { ItemsManager } from '../../Items'
import type { ReservationSystem } from '../../Reservation'
import { NeedsSystem } from './NeedsSystem'
import { NeedPlanner } from './NeedPlanner'
import { NeedInterruptController } from './NeedInterruptController'
import type { NeedsSnapshot } from '../../state/types'
import { ActionQueueContextKind, type ActionQueueContext } from '../../state/types'
import { NeedsManagerState } from './NeedsManagerState'
import type { SimulationTickData } from '../../Simulation/types'
import type { SettlerActionFailureReason } from '../failureReasons'
import type { NeedInterruptPlanRequest } from './types'
import { NeedType } from './NeedTypes'
import { NeedPriority } from './NeedTypes'
import {
	BehaviourIntentType,
	type BehaviourIntent,
	BehaviourIntentPriority,
	EnqueueActionsReason,
	PauseAssignmentReason,
	RequestDispatchReason,
	ResumeAssignmentReason
} from '../Behaviour/intentTypes'

export interface NeedsDeps {
	event: EventManager
	buildings: BuildingManager
	loot: LootManager
	storage: StorageManager
	population: PopulationManager
	items: ItemsManager
	reservations: ReservationSystem
}

export class SettlerNeedsManager extends BaseManager<NeedsDeps> {
	private readonly system: NeedsSystem
	private readonly planner: NeedPlanner
	private readonly interrupts: NeedInterruptController
	private readonly state = new NeedsManagerState()
	private pendingIntents: BehaviourIntent[] = []

	constructor(
		managers: NeedsDeps,
		logger: Logger
	) {
		super(managers)
		this.system = new NeedsSystem({ population: managers.population }, managers.event)
		this.planner = new NeedPlanner(managers, logger)
		this.interrupts = new NeedInterruptController(managers.event, this.system, this.planner, logger)
	}

	public update(data: SimulationTickData): void {
		this.system.update(data)
		this.interrupts.update(data)
	}

	public consumePendingIntents(): BehaviourIntent[] {
		const planRequests = this.interrupts.consumePendingInterruptPlans()
		for (const request of planRequests) {
			this.bufferIntentsForInterruptPlan(request)
		}
		const intents = this.pendingIntents
		this.pendingIntents = []
		return intents
	}

	public handleNeedQueueCompleted(
		settlerId: string,
		context: Extract<ActionQueueContext, { kind: ActionQueueContextKind.Need }>
	): void {
		this.interrupts.handleNeedQueueCompleted(settlerId, context)
		this.bufferPostInterruptIntents(settlerId, RequestDispatchReason.QueueCompleted)
	}

	public handleNeedQueueFailed(
		settlerId: string,
		context: Extract<ActionQueueContext, { kind: ActionQueueContextKind.Need }>,
		reason: SettlerActionFailureReason
	): void {
		this.interrupts.handleNeedQueueFailed(settlerId, context, reason)
		this.bufferPostInterruptIntents(settlerId, RequestDispatchReason.Recovery)
	}

	public handleNeedPlanEnqueueFailed(settlerId: string, needType: NeedType): void {
		this.interrupts.handleNeedPlanEnqueueFailed(settlerId, needType)
		this.bufferPostInterruptIntents(settlerId, RequestDispatchReason.Recovery)
	}

	public onNeedPlanEnqueueFailed(settlerId: string, needType: NeedType): void {
		this.handleNeedPlanEnqueueFailed(settlerId, needType)
	}

	private bufferIntentsForInterruptPlan(request: NeedInterruptPlanRequest): void {
		const { settlerId, needType, plan, priority } = request
		if (!plan.actions || plan.actions.length === 0) {
			this.handleNeedPlanEnqueueFailed(settlerId, needType)
			return
		}

		const mappedPriority = this.mapNeedPriority(priority)
		const context: Extract<ActionQueueContext, { kind: ActionQueueContextKind.Need }> = {
			kind: ActionQueueContextKind.Need,
			needType,
			satisfyValue: plan.satisfyValue
		}

		this.pendingIntents.push({
			type: BehaviourIntentType.PauseAssignment,
			priority: mappedPriority,
			settlerId,
			reason: PauseAssignmentReason.NeedInterrupt
		})
		this.pendingIntents.push({
			type: BehaviourIntentType.EnqueueActions,
			priority: mappedPriority,
			settlerId,
			actions: plan.actions,
			context,
			reason: EnqueueActionsReason.NeedPlan
		})
	}

	private bufferPostInterruptIntents(settlerId: string, dispatchReason: RequestDispatchReason): void {
		this.pendingIntents.push({
			type: BehaviourIntentType.ResumeAssignment,
			priority: BehaviourIntentPriority.High,
			settlerId,
			reason: ResumeAssignmentReason.NeedInterruptEnded
		})
		this.pendingIntents.push({
			type: BehaviourIntentType.RequestDispatch,
			priority: BehaviourIntentPriority.Normal,
			settlerId,
			reason: dispatchReason
		})
	}

	private mapNeedPriority(priority: NeedPriority): BehaviourIntentPriority {
		return priority === NeedPriority.Critical
			? BehaviourIntentPriority.Critical
			: BehaviourIntentPriority.High
	}

	serialize(): NeedsSnapshot {
		const systemSnapshot = this.system.serialize()
		this.state.capture(systemSnapshot, this.interrupts.serialize())
		return this.state.serialize()
	}

	deserialize(state: NeedsSnapshot): void {
		this.state.deserialize(state)
		this.system.deserialize({
			needsBySettler: this.state.needsBySettler,
			lastLevels: this.state.lastLevels
		})
		this.interrupts.deserialize(this.state.interrupts)
	}

	reset(): void {
		this.system.reset()
		this.interrupts.reset()
		this.state.reset()
	}
}

export * from './NeedTypes'
export * from './NeedMeter'
export * from './NeedsManagerState'
export * from './NeedsState'
export * from './events'
export * from './types'
