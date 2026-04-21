import type { EventManager } from '../../events'
import type { MovementManager } from '../../Movement'
import type { LootManager } from '../../Loot'
import type { StorageManager } from '../../Storage'
import type { ResourceNodesManager } from '../../ResourceNodes'
import type { BuildingManager } from '../../Buildings'
import type { PopulationManager } from '../../Population'
import type { RoadManager } from '../../Roads'
import type { ReservationSystem } from '../../Reservation'
import type { NPCManager } from '../../NPC'
import type { WildlifeManager } from '../../Wildlife'
import type { ActionQueueInterruptionOptions, SettlerAction } from './types'
import {
	ActionInterruptibility,
	InterruptionFailurePolicy,
	InterruptionPreemptMode,
	QueueInterruptionReason,
	SettlerActionType
} from './types'
import type { Logger } from '../../Logs'
import { Receiver } from '../../Receiver'
import { WorkProviderEvents } from '../Work/events'
import { ActionHandlers } from './actionHandlers'
import type { ActionQueueContext, ActionSystemSnapshot } from '../../state/types'
import type { MapManager } from '../../Map'
import { SimulationEvents } from '../../Simulation/events'
import type { SimulationTickData } from '../../Simulation/types'
import { SettlerActionsState } from './SettlerActionsState'
import type { ActionQueueRuntimeState } from './SettlerActionsState'
import { SettlerActionsEvents } from './events'
import { releaseActionReservations } from './releaseReservations'
import { SettlerActionFailureReason } from '../failureReasons'

export interface SettlerActionsDeps {
	movement: MovementManager
	loot: LootManager
	storage: StorageManager
	resourceNodes: ResourceNodesManager
	buildings: BuildingManager
	population: PopulationManager
	reservations: ReservationSystem
	roads: RoadManager
	map: MapManager
	npc: NPCManager
	wildlife: WildlifeManager
}

interface InterruptedQueueFrame {
	queue: ActionQueueRuntimeState
}

const ACTION_INTERRUPTIBILITY: Record<SettlerActionType, ActionInterruptibility> = {
	[SettlerActionType.Move]: ActionInterruptibility.InterruptibleReplay,
	[SettlerActionType.FollowPath]: ActionInterruptibility.InterruptibleReplay,
	[SettlerActionType.Wait]: ActionInterruptibility.InterruptibleReplay,
	[SettlerActionType.Construct]: ActionInterruptibility.NonInterruptible,
	[SettlerActionType.BuildRoad]: ActionInterruptibility.NonInterruptible,
	[SettlerActionType.PickupTool]: ActionInterruptibility.NonInterruptibleDeferNext,
	[SettlerActionType.PickupLoot]: ActionInterruptibility.NonInterruptibleDeferNext,
	[SettlerActionType.WithdrawStorage]: ActionInterruptibility.NonInterruptibleDeferNext,
	[SettlerActionType.DeliverStorage]: ActionInterruptibility.NonInterruptibleDeferNext,
	[SettlerActionType.DeliverConstruction]: ActionInterruptibility.NonInterruptibleDeferNext,
	[SettlerActionType.HarvestNode]: ActionInterruptibility.NonInterruptibleDeferNext,
	[SettlerActionType.HuntNpc]: ActionInterruptibility.NonInterruptibleDeferNext,
	[SettlerActionType.Produce]: ActionInterruptibility.NonInterruptibleDeferNext,
	[SettlerActionType.Plant]: ActionInterruptibility.NonInterruptibleDeferNext,
	[SettlerActionType.ChangeProfession]: ActionInterruptibility.NonInterruptibleDeferNext,
	[SettlerActionType.ChangeHome]: ActionInterruptibility.NonInterruptibleDeferNext,
	[SettlerActionType.Consume]: ActionInterruptibility.NonInterruptible,
	[SettlerActionType.Sleep]: ActionInterruptibility.NonInterruptible,
	[SettlerActionType.ProspectNode]: ActionInterruptibility.NonInterruptibleDeferNext,
	[SettlerActionType.Socialize]: ActionInterruptibility.NonInterruptible
}

export class SettlerActionsManager {
	private readonly state = new SettlerActionsState()
	private readonly interruptionStacks = new Map<string, InterruptedQueueFrame[]>()

	constructor(
		private managers: SettlerActionsDeps,
		private event: EventManager,
		private logger: Logger
	) {
		this.event.on<SimulationTickData>(SimulationEvents.SS.Tick, this.handleSimulationTick)
	}

	private readonly handleSimulationTick = (data: SimulationTickData): void => {
		this.state.setNowMs(data.nowMs)
		this.processTimedActions()
	}

	public isBusy(settlerId: string): boolean {
		return this.state.isBusy(settlerId)
	}

	public getCurrentAction(settlerId: string): SettlerAction | null {
		const queue = this.state.getQueue(settlerId)
		if (!queue) {
			return null
		}
		if (queue.index < 0 || queue.index >= queue.actions.length) {
			return null
		}
		return queue.actions[queue.index]
	}

	public isCurrentActionYieldInterruptible(settlerId: string): boolean {
		const action = this.getCurrentAction(settlerId)
		if (!action) {
			return false
		}
		return ACTION_INTERRUPTIBILITY[action.type] === ActionInterruptibility.InterruptibleReplay
	}

	public expediteCurrentWaitAction(settlerId: string): boolean {
		const queue = this.state.getQueue(settlerId)
		if (!queue) {
			return false
		}
		const current = this.getCurrentAction(settlerId)
		if (!current || current.type !== SettlerActionType.Wait) {
			return false
		}
		if (!queue.inProgress || queue.inProgress.type !== SettlerActionType.Wait) {
			return false
		}
		queue.inProgress.endAtMs = this.state.getNowMs()
		return true
	}

	public insertActionsAfterCurrent(settlerId: string, actions: SettlerAction[]): boolean {
		if (actions.length === 0) {
			return false
		}
		const queue = this.state.getQueue(settlerId)
		if (!queue) {
			return false
		}
		if (queue.index < 0 || queue.index >= queue.actions.length) {
			return false
		}
		const insertAt = queue.index + 1
		queue.actions.splice(insertAt, 0, ...actions)
		return true
	}

	public abort(settlerId: string): void {
		const queue = this.state.getQueue(settlerId)
		if (queue) {
			this.managers.movement.cancelMovement(settlerId)
			releaseActionReservations({
				actions: queue.actions,
				deps: this.managers
			})
			this.state.deleteQueue(settlerId)
		}
		this.clearInterruptionStack(settlerId)
	}

	public interruptWithActions(
		settlerId: string,
		actions: SettlerAction[],
		options?: ActionQueueInterruptionOptions
	): boolean {
		if (actions.length === 0) {
			return false
		}

		const queue = this.state.getQueue(settlerId)
		if (!queue) {
			this.enqueue(settlerId, actions)
			return true
		}

		const reason = options?.reason ?? QueueInterruptionReason.SystemRecovery
		const failurePolicy = options?.failurePolicy ?? InterruptionFailurePolicy.ResumeParent
		const preemptMode = options?.preemptMode ?? InterruptionPreemptMode.RequireImmediate
		const currentAction = this.getCurrentAction(settlerId)
		if (!currentAction) {
			return false
		}
		const interruptibility = ACTION_INTERRUPTIBILITY[currentAction.type] ?? ActionInterruptibility.NonInterruptible

		if (interruptibility === ActionInterruptibility.NonInterruptibleDeferNext) {
			return this.insertActionsAfterCurrent(settlerId, actions)
		}

		if (interruptibility === ActionInterruptibility.NonInterruptible) {
			if (preemptMode === InterruptionPreemptMode.RequireImmediate) {
				return false
			}
			if (currentAction.type === SettlerActionType.Wait) {
				this.expediteCurrentWaitAction(settlerId)
			}
			return this.insertActionsAfterCurrent(settlerId, actions)
		}

		this.pushInterruptionFrame(settlerId, this.cloneQueueForReplay(queue))
		this.managers.movement.cancelMovement(settlerId, { suppressCallbacks: true })
		this.state.setQueue(settlerId, {
			actions,
			index: 0,
			interruption: {
				reason,
				failurePolicy
			}
		})
		this.startNextAction(settlerId)
		return true
	}

	public replaceQueueAfterCurrent(
		settlerId: string,
		actions: SettlerAction[],
		onComplete?: () => void,
		onFail?: (reason: SettlerActionFailureReason) => void
	): boolean {
		const queue = this.state.getQueue(settlerId)
		if (!queue) {
			return false
		}
		if (queue.index >= queue.actions.length) {
			this.state.deleteQueue(settlerId)
			return false
		}

		const currentAction = queue.actions[queue.index]
		const removedActions = queue.actions.slice(queue.index + 1)
		if (removedActions.length > 0) {
			releaseActionReservations({
				actions: removedActions,
				deps: this.managers
			})
		}

		queue.actions = [currentAction, ...actions]
		queue.index = 0
		queue.onComplete = onComplete
		queue.onFail = onFail
		return true
	}

	public enqueue(settlerId: string, actions: SettlerAction[], onComplete?: () => void, onFail?: (reason: SettlerActionFailureReason) => void, context?: ActionQueueContext): void {
		if (actions.length === 0) {
			if (onComplete) {
				onComplete()
			}
			return
		}

		this.state.setQueue(settlerId, {
			actions,
			index: 0,
			context,
			onComplete,
			onFail
		})

		this.startNextAction(settlerId)
	}

	private startNextAction(settlerId: string): void {
		const queue = this.state.getQueue(settlerId)
		if (!queue) {
			return
		}

		if (queue.index >= queue.actions.length) {
			this.finishQueue(settlerId)
			return
		}

		const action = queue.actions[queue.index]
		if (action.setState) {
			this.managers.population.setSettlerState(settlerId, action.setState)
		}

		const handler = ActionHandlers[action.type]
		if (!handler) {
			this.failAction(settlerId, SettlerActionFailureReason.UnknownAction)
			return
		}

		handler.start({
			settlerId,
			action,
			managers: this.managers,
			nowMs: this.state.getNowMs(),
			setInProgress: (inProgress) => {
				queue.inProgress = inProgress
			},
			complete: () => this.completeAction(settlerId),
			fail: (reason) => this.failAction(settlerId, reason)
		})
	}

	private completeAction(settlerId: string): void {
		const queue = this.state.getQueue(settlerId)
		if (!queue) {
			return
		}

		const action = queue.actions[queue.index]
		const handler = ActionHandlers[action.type]
		if (handler?.onComplete) {
			handler.onComplete({
				settlerId,
				action,
				managers: this.managers,
				nowMs: this.state.getNowMs()
			})
		}
		this.event.emit(Receiver.All, WorkProviderEvents.SS.ActionCompleted, { settlerId, action })
		queue.index += 1
		queue.inProgress = undefined
		this.startNextAction(settlerId)
	}

	private failAction(settlerId: string, reason: SettlerActionFailureReason): void {
		const queue = this.state.getQueue(settlerId)
		if (!queue) {
			return
		}

		const action = queue.actions[queue.index]
		const handler = ActionHandlers[action.type]
		if (handler?.onFail) {
			handler.onFail({
				settlerId,
				action,
				managers: this.managers,
				nowMs: this.state.getNowMs()
			}, reason)
		}
		this.logger.warn(`[SettlerActions] Action failed for ${settlerId}: ${action.type} (${reason})`)
		this.event.emit(Receiver.All, WorkProviderEvents.SS.ActionFailed, { settlerId, action, reason })
		this.finishQueue(settlerId, reason)
	}

	private processTimedActions(): void {
		for (const [settlerId, queue] of this.state.getQueueEntries()) {
			if (!queue.inProgress) {
				continue
			}
			if (this.state.getNowMs() < queue.inProgress.endAtMs) {
				continue
			}
			queue.inProgress = undefined
			this.completeAction(settlerId)
		}
	}

	reset(): void {
		this.state.reset()
		this.interruptionStacks.clear()
	}

	serialize(): ActionSystemSnapshot {
		return this.state.serialize()
	}

	deserialize(state: ActionSystemSnapshot, nowMs?: number): void {
		if (typeof nowMs === 'number') {
			this.state.setNowMs(nowMs)
		}
		const restoredSettlers = this.state.deserialize(state)
		for (const settlerId of restoredSettlers) {
			this.startNextAction(settlerId)
		}
	}

	private finishQueue(settlerId: string, reason?: SettlerActionFailureReason): void {
		const queue = this.state.getQueue(settlerId)
		if (!queue) {
			return
		}
		releaseActionReservations({
			actions: queue.actions,
			deps: this.managers
		})
		this.state.deleteQueue(settlerId)
		if (queue.interruption) {
			this.handleInterruptionQueueSettled(settlerId, reason, queue.interruption.failurePolicy)
			return
		}
		if (reason) {
			this.event.emit(Receiver.All, SettlerActionsEvents.SS.QueueFailed, {
				settlerId,
				context: queue.context,
				reason
			})
			queue.onFail?.(reason)
			return
		}
		this.event.emit(Receiver.All, SettlerActionsEvents.SS.QueueCompleted, {
			settlerId,
			context: queue.context
		})
		queue.onComplete?.()
	}

	private handleInterruptionQueueSettled(
		settlerId: string,
		reason: SettlerActionFailureReason | undefined,
		failurePolicy: InterruptionFailurePolicy
	): void {
		const parentFrame = this.popInterruptionFrame(settlerId)
		if (!parentFrame) {
			return
		}

		if (!reason || failurePolicy === InterruptionFailurePolicy.ResumeParent) {
			this.state.setQueue(settlerId, parentFrame.queue)
			this.startNextAction(settlerId)
			return
		}

		if (failurePolicy === InterruptionFailurePolicy.FailParent) {
			this.state.setQueue(settlerId, parentFrame.queue)
			this.finishQueue(settlerId, reason)
			return
		}

		releaseActionReservations({
			actions: parentFrame.queue.actions,
			deps: this.managers
		})

		const ancestor = this.popInterruptionFrame(settlerId)
		if (!ancestor) {
			return
		}
		this.state.setQueue(settlerId, ancestor.queue)
		this.startNextAction(settlerId)
	}

	private clearInterruptionStack(settlerId: string): void {
		const stack = this.interruptionStacks.get(settlerId)
		if (!stack || stack.length === 0) {
			return
		}
		for (const frame of stack) {
			releaseActionReservations({
				actions: frame.queue.actions,
				deps: this.managers
			})
		}
		this.interruptionStacks.delete(settlerId)
	}

	private pushInterruptionFrame(settlerId: string, queue: ActionQueueRuntimeState): void {
		const stack = this.interruptionStacks.get(settlerId)
		if (stack) {
			stack.push({ queue })
			return
		}
		this.interruptionStacks.set(settlerId, [{ queue }])
	}

	private popInterruptionFrame(settlerId: string): InterruptedQueueFrame | null {
		const stack = this.interruptionStacks.get(settlerId)
		if (!stack || stack.length === 0) {
			return null
		}
		const frame = stack.pop() || null
		if (stack.length === 0) {
			this.interruptionStacks.delete(settlerId)
		}
		return frame
	}

	private cloneQueueForReplay(queue: ActionQueueRuntimeState): ActionQueueRuntimeState {
		return {
			actions: queue.actions.map(action => ({ ...action })),
			index: queue.index,
			context: queue.context,
			interruption: queue.interruption ? { ...queue.interruption } : undefined,
			onComplete: queue.onComplete,
			onFail: queue.onFail,
			carriedItem: queue.carriedItem ? { ...queue.carriedItem } : undefined
		}
	}

}

export type ActionSystemDeps = SettlerActionsDeps
export { SettlerActionsManager as ActionSystem }
export * from './types'
