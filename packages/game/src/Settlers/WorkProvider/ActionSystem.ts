import type { EventManager } from '../../events'
import type { MovementManager } from '../../Movement'
import type { LootManager } from '../../Loot'
import type { StorageManager } from '../../Storage'
import type { ResourceNodesManager } from '../../ResourceNodes'
import type { BuildingManager } from '../../Buildings'
import type { PopulationManager } from '../../Population'
import type { WorkAction } from './types'
import { WorkActionType } from './types'
import type { Logger } from '../../Logs'
import { Receiver } from '../../Receiver'
import { WorkProviderEvents } from './events'
import { ActionHandlers } from './actionHandlers'

interface ActiveQueue {
	actions: WorkAction[]
	index: number
	inProgress?: {
		type: WorkActionType.Wait | WorkActionType.Construct | WorkActionType.Consume | WorkActionType.Sleep
		endAtMs: number
		buildingInstanceId?: string
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
}

export class ActionSystem {
	private queues = new Map<string, ActiveQueue>()
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

	public enqueue(settlerId: string, actions: WorkAction[], onComplete?: () => void, onFail?: (reason: string) => void): void {
		if (actions.length === 0) {
			if (onComplete) {
				onComplete()
			}
			return
		}

		this.queues.set(settlerId, {
			actions,
			index: 0,
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
			this.queues.delete(settlerId)
			queue.onComplete?.()
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
		this.queues.delete(settlerId)
		queue.onFail?.(reason)
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
}
