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

interface NeedQueueExecution {
	settlerId: string
	needType: NeedType
	satisfyValue?: number
}

export class SettlerNeedsManager extends BaseManager<NeedsDeps> {
	private readonly system: NeedsSystem
	private readonly planner: NeedPlanner
	private readonly interrupts: NeedInterruptController
	private readonly state = new NeedsManagerState()
	private pendingIntents: BehaviourIntent[] = []
	private pendingExecutions = new Map<string, NeedQueueExecution>()
	private executionSequence = 0

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

	public handleRoutedQueueCompleted(token: string): void {
		const execution = this.consumeExecution(token)
		if (!execution) {
			return
		}
		this.interrupts.handleNeedQueueCompleted(execution.settlerId, execution.needType, execution.satisfyValue)
		this.bufferPostInterruptIntents(execution.settlerId, RequestDispatchReason.QueueCompleted)
	}

	public handleRoutedQueueFailed(token: string, reason: SettlerActionFailureReason): void {
		const execution = this.consumeExecution(token)
		if (!execution) {
			return
		}
		this.interrupts.handleNeedQueueFailed(execution.settlerId, execution.needType, reason)
		this.bufferPostInterruptIntents(execution.settlerId, RequestDispatchReason.Recovery)
	}

	public handleRoutedEnqueueRejected(token: string): void {
		const execution = this.consumeExecution(token)
		if (!execution) {
			return
		}
		this.interrupts.handleNeedPlanEnqueueFailed(execution.settlerId, execution.needType)
		this.bufferPostInterruptIntents(execution.settlerId, RequestDispatchReason.Recovery)
	}

	private bufferIntentsForInterruptPlan(request: NeedInterruptPlanRequest): void {
		const { settlerId, needType, plan, priority } = request
		if (!plan.actions || plan.actions.length === 0) {
			this.interrupts.handleNeedPlanEnqueueFailed(settlerId, needType)
			this.bufferPostInterruptIntents(settlerId, RequestDispatchReason.Recovery)
			return
		}

		const mappedPriority = this.mapNeedPriority(priority)
		const token = this.registerExecution({
			settlerId,
			needType,
			satisfyValue: plan.satisfyValue
		})

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
			completionToken: token,
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

	private registerExecution(execution: NeedQueueExecution): string {
		const token = `needs:${++this.executionSequence}`
		this.pendingExecutions.set(token, execution)
		return token
	}

	private consumeExecution(token: string): NeedQueueExecution | undefined {
		const execution = this.pendingExecutions.get(token)
		if (!execution) {
			return undefined
		}
		this.pendingExecutions.delete(token)
		return execution
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
		this.pendingExecutions.clear()
		this.executionSequence = 0
	}
}

export * from './NeedTypes'
export * from './NeedMeter'
export * from './NeedsManagerState'
export * from './NeedsState'
export * from './events'
export * from './types'
