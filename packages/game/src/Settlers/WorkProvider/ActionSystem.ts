import type { EventManager } from '../../events'
import type { MovementManager } from '../../Movement'
import type { LootManager } from '../../Loot'
import type { StorageManager } from '../../Storage'
import type { ResourceNodesManager } from '../../ResourceNodes'
import type { BuildingManager } from '../../Buildings'
import type { PopulationManager } from '../../Population'
import type { RoadManager } from '../../Roads'
import type { ReservationSystem } from '../../Reservation'
import type { WorkAction } from './types'
import { WorkActionType } from './types'
import { MoveTargetType } from '../../Movement/types'
import type { Logger } from '../../Logs'
import { Receiver } from '../../Receiver'
import { WorkProviderEvents } from './events'
import { ActionHandlers } from './actionHandlers'
import type { ActionQueueContext, ActionSystemSnapshot } from '../../state/types'
import type { MapManager } from '../../Map'

export type ActionQueueContextResolver = (settlerId: string, context: ActionQueueContext, actions: WorkAction[]) => {
	onComplete?: () => void
	onFail?: (reason: string) => void
}

interface ActiveQueue {
	actions: WorkAction[]
	index: number
	context?: ActionQueueContext
	inProgress?: {
		type: WorkActionType.Wait | WorkActionType.Construct | WorkActionType.BuildRoad | WorkActionType.Consume | WorkActionType.Sleep
		endAtMs: number
		buildingInstanceId?: string
		jobId?: string
	}
	carriedItem?: { itemType: string, quantity: number }
	onComplete?: () => void
	onFail?: (reason: string) => void
}

export interface ActionSystemDeps {
	movement: MovementManager
	loot: LootManager
	storage: StorageManager
	resourceNodes: ResourceNodesManager
	buildings: BuildingManager
	population: PopulationManager
	reservations: ReservationSystem
	roads: RoadManager
	map: MapManager
}

export class ActionSystem {
	private queues = new Map<string, ActiveQueue>()
	private contextResolvers = new Map<ActionQueueContext['kind'], ActionQueueContextResolver>()
	private nowMs = 0

	constructor(
		private managers: ActionSystemDeps,
		private event: EventManager,
		private logger: Logger
	) {}

	public setTime(nowMs: number): void {
		this.nowMs = nowMs
		this.processTimedActions()
	}

	public isBusy(settlerId: string): boolean {
		return this.queues.has(settlerId)
	}

	public abort(settlerId: string): void {
		const queue = this.queues.get(settlerId)
		if (!queue) {
			return
		}
		this.managers.movement.cancelMovement(settlerId)
		this.releaseReservations(queue.actions, queue.context?.reservationOwnerId, settlerId)
		this.queues.delete(settlerId)
	}

	public registerContextResolver(kind: ActionQueueContext['kind'], resolver: ActionQueueContextResolver): void {
		this.contextResolvers.set(kind, resolver)
	}

	public enqueue(settlerId: string, actions: WorkAction[], onComplete?: () => void, onFail?: (reason: string) => void, context?: ActionQueueContext): void {
		if (actions.length === 0) {
			if (onComplete) {
				onComplete()
			}
			return
		}

		this.queues.set(settlerId, {
			actions,
			index: 0,
			context,
			onComplete,
			onFail
		})

		this.startNextAction(settlerId)
	}

	private startNextAction(settlerId: string): void {
		const queue = this.queues.get(settlerId)
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
			this.failAction(settlerId, 'unknown_action')
			return
		}

		handler.start({
			settlerId,
			action,
			managers: this.managers,
			nowMs: this.nowMs,
			setInProgress: (inProgress) => {
				queue.inProgress = inProgress
			},
			complete: () => this.completeAction(settlerId),
			fail: (reason) => this.failAction(settlerId, reason)
		})
	}

	private completeAction(settlerId: string): void {
		const queue = this.queues.get(settlerId)
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
				nowMs: this.nowMs
			})
		}
		this.event.emit(Receiver.All, WorkProviderEvents.SS.ActionCompleted, { settlerId, action })
		queue.index += 1
		queue.inProgress = undefined
		this.startNextAction(settlerId)
	}

	private failAction(settlerId: string, reason: string): void {
		const queue = this.queues.get(settlerId)
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
				nowMs: this.nowMs
			}, reason)
		}
		this.logger.warn(`[ActionSystem] Action failed for ${settlerId}: ${action.type} (${reason})`)
		this.event.emit(Receiver.All, WorkProviderEvents.SS.ActionFailed, { settlerId, action, reason })
		this.finishQueue(settlerId, reason)
	}

	private processTimedActions(): void {
		for (const [settlerId, queue] of this.queues.entries()) {
			if (!queue.inProgress) {
				continue
			}
			if (this.nowMs < queue.inProgress.endAtMs) {
				continue
			}
			queue.inProgress = undefined
			this.completeAction(settlerId)
		}
	}

	reset(): void {
		this.queues.clear()
	}

	serialize(): ActionSystemSnapshot {
		return {
			queues: Array.from(this.queues.entries()).map(([settlerId, queue]) => ({
				settlerId,
				actions: queue.actions.map(action => ({ ...action })),
				index: queue.index,
				context: queue.context
			}))
		}
	}

	deserialize(state: ActionSystemSnapshot): void {
		this.queues.clear()
		for (const queue of state.queues) {
			const callbacks = this.resolveCallbacks(queue.settlerId, queue.context, queue.actions)
			this.queues.set(queue.settlerId, {
				actions: queue.actions.map(action => ({ ...action })),
				index: queue.index,
				context: queue.context,
				onComplete: callbacks.onComplete,
				onFail: callbacks.onFail
			})
			this.startNextAction(queue.settlerId)
		}
	}

	private resolveCallbacks(settlerId: string, context: ActionQueueContext | undefined, actions: WorkAction[]): { onComplete?: () => void, onFail?: (reason: string) => void } {
		if (!context) {
			return {}
		}
		const resolver = this.contextResolvers.get(context.kind)
		if (!resolver) {
			return {}
		}
		return resolver(settlerId, context, actions)
	}

	private finishQueue(settlerId: string, reason?: string): void {
		const queue = this.queues.get(settlerId)
		if (!queue) {
			return
		}
		this.releaseReservations(queue.actions, queue.context?.reservationOwnerId, settlerId)
		this.queues.delete(settlerId)
		if (reason) {
			queue.onFail?.(reason)
			return
		}
		queue.onComplete?.()
	}

	private releaseReservations(actions: WorkAction[], reservationOwnerId: string | undefined, settlerId: string): void {
		for (const action of actions) {
			if (action.type === WorkActionType.WithdrawStorage || action.type === WorkActionType.DeliverStorage) {
				if (action.reservationId) {
					this.managers.reservations.releaseStorageReservation(action.reservationId)
				}
				continue
			}

			if (action.type === WorkActionType.PickupLoot || action.type === WorkActionType.PickupTool) {
				if (reservationOwnerId) {
					this.managers.reservations.releaseLootReservation(action.itemId, reservationOwnerId)
				}
				this.managers.reservations.releaseLootReservation(action.itemId, settlerId)
				continue
			}

			if (action.type === WorkActionType.HarvestNode) {
				this.managers.reservations.releaseNode(action.nodeId, reservationOwnerId || settlerId)
				continue
			}

			if (action.type === WorkActionType.ChangeHome) {
				this.managers.reservations.releaseHouseReservation(action.reservationId)
				continue
			}

			if (action.type === WorkActionType.Move && action.targetType === MoveTargetType.AmenitySlot && action.targetId) {
				this.managers.reservations.releaseAmenitySlot(action.targetId)
			}
		}
	}
}
