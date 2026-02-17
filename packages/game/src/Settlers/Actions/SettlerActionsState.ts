import type { WorkAction } from '../Work/types'
import { WorkActionType } from '../Work/types'
import type { ActionQueueContext, ActionSystemSnapshot } from '../../state/types'

export interface ActionQueueCallbacks {
	onComplete?: () => void
	onFail?: (reason: string) => void
}

export interface ActionQueueRuntimeState extends ActionQueueCallbacks {
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
}

export type ActionQueueCallbacksResolver = (
	settlerId: string,
	context: ActionQueueContext | undefined,
	actions: WorkAction[]
) => ActionQueueCallbacks

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

	public deserialize(snapshot: ActionSystemSnapshot, resolveCallbacks: ActionQueueCallbacksResolver): string[] {
		this.queues.clear()
		const restoredSettlers: string[] = []
		for (const queue of snapshot.queues) {
			const callbacks = resolveCallbacks(queue.settlerId, queue.context, queue.actions)
			this.queues.set(queue.settlerId, {
				actions: queue.actions.map(action => ({ ...action })),
				index: queue.index,
				context: queue.context,
				onComplete: callbacks.onComplete,
				onFail: callbacks.onFail
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
