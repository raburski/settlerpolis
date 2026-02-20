import type { SettlerAction } from './types'
import { SettlerActionType } from './types'
import type { ActionQueueContext, ActionSystemSnapshot } from '../../state/types'
import type { SettlerActionFailureReason } from '../failureReasons'

export interface ActionQueueCallbacks {
	onComplete?: () => void
	onFail?: (reason: SettlerActionFailureReason) => void
}

export interface ActionQueueRuntimeState extends ActionQueueCallbacks {
	actions: SettlerAction[]
	index: number
	context?: ActionQueueContext
	inProgress?: {
		type: SettlerActionType.Wait | SettlerActionType.Construct | SettlerActionType.BuildRoad | SettlerActionType.Consume | SettlerActionType.Sleep
		endAtMs: number
		buildingInstanceId?: string
		jobId?: string
	}
	carriedItem?: { itemType: string, quantity: number }
}

export class SettlerActionsState {
	private readonly queues = new Map<string, ActionQueueRuntimeState>()
	private nowMs = 0

	public getNowMs(): number {
		return this.nowMs
	}

	public setNowMs(nowMs: number): void {
		this.nowMs = nowMs
	}

	public isBusy(settlerId: string): boolean {
		return this.queues.has(settlerId)
	}

	public getQueue(settlerId: string): ActionQueueRuntimeState | undefined {
		return this.queues.get(settlerId)
	}

	public setQueue(settlerId: string, queue: ActionQueueRuntimeState): void {
		this.queues.set(settlerId, queue)
	}

	public deleteQueue(settlerId: string): void {
		this.queues.delete(settlerId)
	}

	public getQueueEntries(): IterableIterator<[string, ActionQueueRuntimeState]> {
		return this.queues.entries()
	}

	public serialize(): ActionSystemSnapshot {
		return {
			queues: Array.from(this.queues.entries()).map(([settlerId, queue]) => ({
				settlerId,
				actions: queue.actions.map(action => ({ ...action })),
				index: queue.index,
				context: queue.context
			}))
		}
	}

	public deserialize(snapshot: ActionSystemSnapshot): string[] {
		this.queues.clear()
		const restoredSettlers: string[] = []
		for (const queue of snapshot.queues) {
			this.queues.set(queue.settlerId, {
				actions: queue.actions.map(action => ({ ...action })),
				index: queue.index,
				context: queue.context
			})
			restoredSettlers.push(queue.settlerId)
		}
		return restoredSettlers
	}

	public reset(): void {
		this.queues.clear()
		this.nowMs = 0
	}
}
