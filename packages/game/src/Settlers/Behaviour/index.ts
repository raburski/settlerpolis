import { BaseManager } from '../../Managers'
import { WorkProviderEvents } from '../Work/events'
import type { WorkAssignmentRemovedEventData, WorkDispatchRequestedEventData } from '../Work/events'
import type { WorkAssignment, WorkStep, WorkAction } from '../Work/types'
import { WorkActionType, WorkStepType, WorkWaitReason } from '../Work/types'
import { SettlerState } from '../../Population/types'
import { StepHandlers } from '../Work/stepHandlers'
import type { ActionQueueContext } from '../../state/types'
import { ActionQueueContextKind } from '../../state/types'
import type { SettlerId } from '../../ids'
import { SimulationEvents } from '../../Simulation/events'
import type { SimulationTickData } from '../../Simulation/types'
import type { NeedType } from '../Needs/NeedTypes'
import { SettlerActionsEvents } from '../Actions/events'
import type { ActionQueueCompletedEventData, ActionQueueFailedEventData } from '../Actions/events'
import { SettlerBehaviourState, type SettlerBehaviourSnapshot } from './SettlerBehaviourState'
import type { SettlerBehaviourDeps } from './deps'
import { MovementEvents } from '../../Movement/events'
import { MoveTargetType } from '../../Movement/types'
import {
	ActiveStepDispatchRule,
	BehaviourRuleResult,
	type BehaviourDispatchRule,
	type BehaviourDispatchRuleContext,
	HomeRelocationDispatchRule,
	MovementRecoveryDispatchRule,
	NoAssignmentDispatchRule,
	NoStepDispatchRule,
	PauseDispatchRule,
	ProviderDispatchRule,
	WaitStepDispatchRule,
	WorkStepLifecycleHandler
} from './rules'

export class SettlerBehaviourManager extends BaseManager<SettlerBehaviourDeps> {
	private readonly state = new SettlerBehaviourState()
	private readonly preDispatchRules: BehaviourDispatchRule[] = [
		new PauseDispatchRule(),
		new NoAssignmentDispatchRule(),
		new MovementRecoveryDispatchRule(),
		new ProviderDispatchRule()
	]
	private readonly stepDispatchRules: BehaviourDispatchRule[] = [
		new HomeRelocationDispatchRule(),
		new NoStepDispatchRule(),
		new WaitStepDispatchRule(),
		new ActiveStepDispatchRule()
	]
	private readonly stepLifecycle: WorkStepLifecycleHandler

	constructor(managers: SettlerBehaviourDeps) {
		super(managers)
		this.stepLifecycle = new WorkStepLifecycleHandler({
			managers,
			work: managers.work,
			state: this.state,
			event: managers.event,
			dispatchNextStep: (settlerId: SettlerId) => this.dispatchNextStep(settlerId)
		})

		this.managers.event.on<SimulationTickData>(SimulationEvents.SS.Tick, this.handleSimulationSSTick)
		this.managers.event.on<WorkDispatchRequestedEventData>(WorkProviderEvents.SS.DispatchRequested, this.handleDispatchRequested)
		this.managers.event.on<WorkAssignmentRemovedEventData>(WorkProviderEvents.SS.AssignmentRemoved, this.handleAssignmentRemoved)
		this.managers.event.on<ActionQueueCompletedEventData>(SettlerActionsEvents.SS.QueueCompleted, this.handleActionQueueCompleted)
		this.managers.event.on<ActionQueueFailedEventData>(SettlerActionsEvents.SS.QueueFailed, this.handleActionQueueFailed)
		this.managers.event.on<{ requesterEntityId: string, blockerEntityId: string, mapId: string, tile: { x: number, y: number } }>(MovementEvents.SS.YieldRequested, this.handleMovementSSYieldRequested)
	}

	private readonly handleSimulationSSTick = (_data: SimulationTickData): void => {
		this.managers.work.refreshWorldDemand(_data)
		this.managers.needs.update(_data)

		this.processPendingDispatches()
		this.recoverOrphanedMovingSettlers()
	}

	private readonly handleDispatchRequested = (data: WorkDispatchRequestedEventData): void => {
		this.dispatchNextStep(data.settlerId)
	}

	private readonly handleAssignmentRemoved = (data: WorkAssignmentRemovedEventData): void => {
		this.clearSettlerState(data.settlerId)
	}

	private readonly handleActionQueueCompleted = (data: ActionQueueCompletedEventData): void => {
		const context = data.context
		if (!context || context.kind !== ActionQueueContextKind.Work) {
			return
		}
		this.buildWorkQueueCallbacks(data.settlerId, context.step).onComplete()
	}

	private readonly handleActionQueueFailed = (data: ActionQueueFailedEventData): void => {
		const context = data.context
		if (!context || context.kind !== ActionQueueContextKind.Work) {
			return
		}
		this.buildWorkQueueCallbacks(data.settlerId, context.step).onFail(data.reason)
	}

	private readonly handleMovementSSYieldRequested = (
		data: { requesterEntityId: string, blockerEntityId: string, mapId: string, tile: { x: number, y: number } }
	): void => {
		const blocker = this.managers.population.getSettler(data.blockerEntityId)
		if (!blocker) {
			return
		}
		if (blocker.mapId !== data.mapId) {
			return
		}
		if (this.managers.movement.hasActiveMovement(blocker.id)) {
			return
		}
		if (
			blocker.state !== SettlerState.Idle &&
			blocker.state !== SettlerState.WaitingForWork &&
			blocker.state !== SettlerState.Assigned &&
			blocker.state !== SettlerState.Working
		) {
			return
		}

		const requesterPosition = this.managers.movement.getEntityPosition(data.requesterEntityId)
		const stepAsideTarget = requesterPosition
			? this.findYieldSidePosition(blocker.mapId, blocker.id, blocker.position, requesterPosition)
			: null
		const swapTarget = stepAsideTarget || !requesterPosition
			? null
			: this.findYieldSwapPosition(blocker.mapId, data.requesterEntityId, blocker.position, requesterPosition)
		const yieldTarget = stepAsideTarget ?? swapTarget
		if (!yieldTarget) {
			return
		}
		const yieldMode = stepAsideTarget ? 'side' : 'swap'

		const stepAsideTargetId = `yield:${yieldMode}:${data.requesterEntityId}:${Math.round(yieldTarget.x)},${Math.round(yieldTarget.y)}`
		const stepAsideAction: WorkAction = {
			type: WorkActionType.Move,
			position: yieldTarget,
			targetType: MoveTargetType.Spot,
			targetId: stepAsideTargetId,
			setState: SettlerState.Moving
		}

		if (this.managers.actions.isBusy(blocker.id)) {
			if (!this.managers.actions.isCurrentActionYieldInterruptible(blocker.id)) {
				return
			}
			this.managers.actions.expediteCurrentWaitAction(blocker.id)
			this.managers.actions.insertActionsAfterCurrent(blocker.id, [stepAsideAction])
			return
		}

		this.managers.actions.enqueue(blocker.id, [stepAsideAction], () => {
			if (this.managers.actions.isBusy(blocker.id)) {
				return
			}
			const assignment = this.managers.work.getAssignment(blocker.id)
			if (!assignment) {
				this.managers.population.setSettlerWaitReason(blocker.id, undefined)
				this.managers.population.setSettlerState(blocker.id, SettlerState.Idle)
				return
			}
			this.dispatchNextStep(blocker.id)
		})
	}

	private recoverOrphanedMovingSettlers(): void {
		for (const settler of this.managers.population.getSettlers()) {
			if (!this.isTransitState(settler.state)) {
				continue
			}
			if (this.managers.actions.isBusy(settler.id)) {
				continue
			}
			if (this.managers.movement.hasActiveMovement(settler.id)) {
				continue
			}
			const assignment = this.managers.work.getAssignment(settler.id)
			if (!assignment) {
				this.managers.population.setSettlerWaitReason(settler.id, undefined)
				this.managers.population.setSettlerState(settler.id, SettlerState.Idle)
				continue
			}
			this.dispatchNextStep(settler.id)
		}
	}

	private isTransitState(state: SettlerState): boolean {
		return state === SettlerState.Moving
			|| state === SettlerState.MovingToItem
			|| state === SettlerState.CarryingItem
			|| state === SettlerState.MovingToBuilding
			|| state === SettlerState.MovingToTool
			|| state === SettlerState.MovingToResource
	}

	enqueueNeedPlan(
		settlerId: SettlerId,
		actions: WorkAction[],
		context: Extract<ActionQueueContext, { kind: ActionQueueContextKind.Need }>
	): boolean {
		if (this.managers.actions.isBusy(settlerId)) {
			return false
		}
		this.managers.actions.enqueue(settlerId, actions, undefined, undefined, context)
		return true
	}

	public beginNeedInterrupt(settlerId: SettlerId, _needType: NeedType): void {
		this.state.clearPendingDispatch(settlerId)
		this.managers.work.pauseAssignment(settlerId, 'NEED')
		if (this.managers.actions.isBusy(settlerId)) {
			this.managers.actions.abort(settlerId)
		}
	}

	public endNeedInterrupt(settlerId: SettlerId, _needType: NeedType): void {
		this.managers.work.resumeAssignment(settlerId)
		if (!this.managers.actions.isBusy(settlerId)) {
			this.dispatchNextStep(settlerId)
		}
	}

	processPendingDispatches(): void {
		if (!this.state.hasPendingDispatches()) {
			return
		}

		const now = this.managers.work.getNowMs()
		for (const [settlerId, dispatchAt] of this.state.getPendingDispatchEntries()) {
			if (now < dispatchAt) {
				continue
			}
			if (this.managers.actions.isBusy(settlerId)) {
				continue
			}
			this.state.clearPendingDispatch(settlerId)
			this.dispatchNextStep(settlerId)
		}
	}

	dispatchNextStep(settlerId: SettlerId): void {
		if (this.managers.actions.isBusy(settlerId)) {
			return
		}

		const context: BehaviourDispatchRuleContext = {
			settlerId,
			nowMs: this.managers.work.getNowMs(),
			managers: this.managers,
			work: this.managers.work,
			actionsManager: this.managers.actions,
			state: this.state,
			dispatchNextStep: (nextSettlerId: SettlerId) => this.dispatchNextStep(nextSettlerId),
			assignment: this.managers.work.getAssignment(settlerId)
		}

		if (this.applyDispatchRules(this.preDispatchRules, context)) {
			return
		}

		if (!context.provider || !context.assignment) {
			return
		}

		context.step = context.provider.requestNextStep(settlerId)
		if (this.applyDispatchRules(this.stepDispatchRules, context)) {
			return
		}

		if (!context.step) {
			return
		}

		this.managers.work.onStepIssued(settlerId, context.assignment, context.step)
		const { actions, releaseReservations } = this.buildActionsForStep(settlerId, context.assignment, context.step)

		if (!actions || actions.length === 0) {
			if (context.step.type === WorkStepType.Wait) {
				this.managers.population.setSettlerWaitReason(settlerId, context.step.reason)
			} else {
				this.managers.population.setSettlerWaitReason(settlerId, WorkWaitReason.NoWork)
			}
			this.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
			releaseReservations?.()
			return
		}

		const queueContext: ActionQueueContext = {
			kind: ActionQueueContextKind.Work,
			step: context.step,
			reservationOwnerId: context.assignment.assignmentId
		}
		this.managers.actions.enqueue(settlerId, actions, undefined, undefined, queueContext)
	}

	private applyDispatchRules(rules: BehaviourDispatchRule[], context: BehaviourDispatchRuleContext): boolean {
		for (const rule of rules) {
			if (rule.apply(context) === BehaviourRuleResult.Stop) {
				return true
			}
		}
		return false
	}

	buildWorkQueueCallbacks(
		settlerId: SettlerId,
		step?: WorkStep,
		releaseReservations?: () => void
	): { onComplete: () => void, onFail: (reason: string) => void } {
		return this.stepLifecycle.buildCallbacks(settlerId, step, releaseReservations)
	}

	clearSettlerState(settlerId: SettlerId): void {
		this.state.clearSettlerState(settlerId)
	}

	serialize(): SettlerBehaviourSnapshot {
		return this.state.serialize()
	}

	deserialize(state: SettlerBehaviourSnapshot): void {
		this.state.deserialize(state)
	}

	reset(): void {
		this.resetRules()
		this.state.reset()
	}

	private resetRules(): void {
		for (const rule of this.preDispatchRules) {
			rule.reset?.()
		}
		for (const rule of this.stepDispatchRules) {
			rule.reset?.()
		}
	}

	private buildActionsForStep(
		settlerId: SettlerId,
		assignment: WorkAssignment,
		step: WorkStep
	): { actions: WorkAction[], releaseReservations?: () => void } {
		const handler = StepHandlers[step.type]
		if (!handler) {
			return { actions: [] }
		}
		return handler.build({
			settlerId,
			assignment,
			step,
			managers: this.managers,
			reservationSystem: this.managers.reservations,
			simulationTimeMs: this.managers.work.getNowMs()
		})
	}

	private findYieldSidePosition(
		mapId: string,
		blockerEntityId: string,
		currentPosition: { x: number, y: number },
		requesterPosition: { x: number, y: number }
	): { x: number, y: number } | null {
		const map = this.managers.map.getMap(mapId)
		if (!map) {
			return null
		}
		const tileWidth = map.tiledMap.tilewidth || 32
		const tileHeight = map.tiledMap.tileheight || 32
		const baseTileX = Math.floor(currentPosition.x / tileWidth)
		const baseTileY = Math.floor(currentPosition.y / tileHeight)
		const requesterTileX = Math.floor(requesterPosition.x / tileWidth)
		const requesterTileY = Math.floor(requesterPosition.y / tileHeight)
		const incoming = {
			x: Math.sign(baseTileX - requesterTileX),
			y: Math.sign(baseTileY - requesterTileY)
		}

		if (incoming.x === 0 && incoming.y === 0) {
			return null
		}

		const sideDirections = [
			{ x: -incoming.y, y: incoming.x },
			{ x: incoming.y, y: -incoming.x }
		]

		for (const direction of sideDirections) {
			const tileX = baseTileX + direction.x
			const tileY = baseTileY + direction.y
			if (tileX < 0 || tileY < 0 || tileX >= map.collision.width || tileY >= map.collision.height) {
				continue
			}
			const tileIndex = tileY * map.collision.width + tileX
			if (map.collision.data[tileIndex] !== 0) {
				continue
			}
			if (!this.managers.movement.isTileFreeForYield(mapId, tileX, tileY, blockerEntityId)) {
				continue
			}
			return {
				x: tileX * tileWidth + tileWidth / 2,
				y: tileY * tileHeight + tileHeight / 2
			}
		}

		return null
	}

	private findYieldSwapPosition(
		mapId: string,
		requesterEntityId: string,
		blockerPosition: { x: number, y: number },
		requesterPosition: { x: number, y: number }
	): { x: number, y: number } | null {
		const map = this.managers.map.getMap(mapId)
		if (!map) {
			return null
		}
		if (!this.managers.movement.hasActiveMovement(requesterEntityId)) {
			return null
		}

		const tileWidth = map.tiledMap.tilewidth || 32
		const tileHeight = map.tiledMap.tileheight || 32
		const blockerTileX = Math.floor(blockerPosition.x / tileWidth)
		const blockerTileY = Math.floor(blockerPosition.y / tileHeight)
		const requesterTileX = Math.floor(requesterPosition.x / tileWidth)
		const requesterTileY = Math.floor(requesterPosition.y / tileHeight)

		const dx = Math.abs(blockerTileX - requesterTileX)
		const dy = Math.abs(blockerTileY - requesterTileY)
		if (Math.max(dx, dy) !== 1) {
			return null
		}

		if (!this.managers.movement.isTileFreeForYield(mapId, requesterTileX, requesterTileY, requesterEntityId)) {
			return null
		}

		return {
			x: requesterTileX * tileWidth + tileWidth / 2,
			y: requesterTileY * tileHeight + tileHeight / 2
		}
	}
}

export { SettlerBehaviourManager as DispatchCoordinator }
export type { SettlerBehaviourDeps } from './deps'
