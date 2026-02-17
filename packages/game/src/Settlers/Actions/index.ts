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
import type { WorkAction } from '../Work/types'
import { WorkActionType } from '../Work/types'
import { MoveTargetType } from '../../Movement/types'
import type { Logger } from '../../Logs'
import { Receiver } from '../../Receiver'
import { WorkProviderEvents } from '../Work/events'
import { ActionHandlers } from './actionHandlers'
import type { ActionQueueContext, ActionSystemSnapshot } from '../../state/types'
import type { MapManager } from '../../Map'
import { SimulationEvents } from '../../Simulation/events'
import type { SimulationTickData } from '../../Simulation/types'
import { SettlerActionsState } from './SettlerActionsState'

export type ActionQueueContextResolver = (settlerId: string, context: ActionQueueContext, actions: WorkAction[]) => {
	onComplete?: () => void
	onFail?: (reason: string) => void
}

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

export class SettlerActionsManager {
	private readonly state = new SettlerActionsState()
	private contextResolvers = new Map<ActionQueueContext['kind'], ActionQueueContextResolver>()

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

	public abort(settlerId: string): void {
		const queue = this.state.getQueue(settlerId)
		if (!queue) {
			return
		}
		this.managers.movement.cancelMovement(settlerId)
		this.releaseReservations(queue.actions, queue.context?.reservationOwnerId, settlerId)
		this.state.deleteQueue(settlerId)
	}

	public replaceQueueAfterCurrent(
		settlerId: string,
		actions: WorkAction[],
		onComplete?: () => void,
		onFail?: (reason: string) => void
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
			this.releaseReservations(removedActions, queue.context?.reservationOwnerId, settlerId)
		}

		queue.actions = [currentAction, ...actions]
		queue.index = 0
		queue.onComplete = onComplete
		queue.onFail = onFail
		return true
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
			this.failAction(settlerId, 'unknown_action')
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

	private failAction(settlerId: string, reason: string): void {
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
	}

	serialize(): ActionSystemSnapshot {
		return this.state.serialize()
	}

	deserialize(state: ActionSystemSnapshot, nowMs?: number): void {
		if (typeof nowMs === 'number') {
			this.state.setNowMs(nowMs)
		}
		const restoredSettlers = this.state.deserialize(state, this.resolveCallbacks)
		for (const settlerId of restoredSettlers) {
			this.startNextAction(settlerId)
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
		const queue = this.state.getQueue(settlerId)
		if (!queue) {
			return
		}
		this.releaseReservations(queue.actions, queue.context?.reservationOwnerId, settlerId)
		this.state.deleteQueue(settlerId)
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

			if (action.type === WorkActionType.HuntNpc) {
				const npc = this.managers.npc.getNPC(action.npcId)
				const reservedBy = npc?.attributes?.reservedBy
				if (reservedBy === settlerId) {
					this.managers.npc.removeNPCAttribute(action.npcId, 'reservedBy')
				}
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

export type ActionSystemDeps = SettlerActionsDeps
export { SettlerActionsManager as ActionSystem }
