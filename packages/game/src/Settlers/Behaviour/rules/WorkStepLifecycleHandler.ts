import { Receiver } from '../../../Receiver'
import type { EventManager } from '../../../events'
import { SettlerState } from '../../../Population/types'
import type { SettlerId } from '../../../ids'
import { WorkProviderEvents } from '../../Work/events'
import type { WorkAssignment, WorkStep } from '../../Work/types'
import { TransportTargetType, WorkProviderType, WorkStepType, WorkWaitReason } from '../../Work/types'
import type { SettlerBehaviourDeps } from '../deps'
import type { SettlerWorkManager } from '../../Work'
import type { SettlerBehaviourState } from '../SettlerBehaviourState'
import { isWarehouseLogisticsAssignment } from './assignmentPredicates'

const MOVEMENT_RECOVERY_COOLDOWN_MS = 8000
const MOVEMENT_FAILURE_MAX_RETRIES = 3

export interface WorkStepLifecycleHandlerDeps {
	managers: SettlerBehaviourDeps
	work: SettlerWorkManager
	state: SettlerBehaviourState
	event: EventManager
	dispatchNextStep: (settlerId: SettlerId) => void
}

export class WorkStepLifecycleHandler {
	constructor(private deps: WorkStepLifecycleHandlerDeps) {}

	public buildCallbacks(
		settlerId: SettlerId,
		step?: WorkStep
	): { onComplete: () => void, onFail: (reason: string) => void } {
		return {
			onComplete: () => {
				if (!step) {
					this.deps.managers.population.setSettlerState(settlerId, SettlerState.Idle)
					this.deps.dispatchNextStep(settlerId)
					return
				}
				const assignment = this.deps.work.getAssignment(settlerId)
				if (!assignment) {
					return
				}
				this.handleStepCompleted(settlerId, assignment, step)
			},
			onFail: (reason: string) => {
				if (!step) {
					this.deps.managers.population.setSettlerState(settlerId, SettlerState.Idle)
					this.deps.dispatchNextStep(settlerId)
					return
				}
				const assignment = this.deps.work.getAssignment(settlerId)
				if (!assignment) {
					return
				}
				this.handleStepFailed(settlerId, step, reason)
			}
		}
	}

	private clearConstructionWorker(settlerId: SettlerId, step: WorkStep): void {
		if (step.type !== WorkStepType.Construct) {
			return
		}
		this.deps.managers.buildings.setConstructionWorkerActive(step.buildingInstanceId, settlerId, false)
	}

	private handleStepCompleted(
		settlerId: SettlerId,
		assignment: WorkAssignment,
		step: WorkStep
	): void {
		this.deps.event.emit(Receiver.All, WorkProviderEvents.SS.StepCompleted, { settlerId, step })
		this.deps.managers.population.setSettlerLastStep(settlerId, step.type, undefined)
		this.deps.managers.population.setSettlerState(settlerId, SettlerState.Idle)
		this.clearConstructionWorker(settlerId, step)
		this.deps.state.clearMovementFailureCount(settlerId)
		if (step.type === WorkStepType.Transport && step.target.type === TransportTargetType.Construction) {
			this.deps.work.releaseConstructionInFlight(step.target.buildingInstanceId, step.itemType, step.quantity)
		}
		if (step.type === WorkStepType.Produce && assignment.buildingInstanceId) {
			this.deps.work.handleProductionCompleted(assignment.buildingInstanceId, step.recipe)
		}
		if (assignment.providerType === WorkProviderType.Logistics && !this.deps.work.hasPendingLogisticsRequests()) {
			if (!isWarehouseLogisticsAssignment(assignment, this.deps.managers)) {
				this.deps.work.unassignSettler(settlerId)
				return
			}
		}
		this.deps.dispatchNextStep(settlerId)
	}

	private handleStepFailed(
		settlerId: SettlerId,
		step: WorkStep,
		reason: string
	): void {
		this.deps.event.emit(Receiver.All, WorkProviderEvents.SS.StepFailed, { settlerId, step, reason })
		this.clearConstructionWorker(settlerId, step)
		let retryDelayMs = 1000
		const isWaitReason = (Object.values(WorkWaitReason) as string[]).includes(reason)
		let waitReason: WorkWaitReason = isWaitReason ? (reason as WorkWaitReason) : WorkWaitReason.NoWork
		let shouldDispatch = true
		if (reason === 'movement_failed' || reason === 'movement_cancelled') {
			const currentFailures = this.deps.state.incrementMovementFailureCount(settlerId)
			retryDelayMs = MOVEMENT_RECOVERY_COOLDOWN_MS
			waitReason = reason === 'movement_failed'
				? WorkWaitReason.MovementFailed
				: WorkWaitReason.MovementCancelled
			this.deps.state.setMovementRecovery(settlerId, this.deps.work.getNowMs() + retryDelayMs, waitReason)
			if (currentFailures >= MOVEMENT_FAILURE_MAX_RETRIES) {
				if (step.type === WorkStepType.BuildRoad) {
					this.deps.managers.roads.releaseJob(step.jobId)
				}
				this.deps.work.unassignSettler(settlerId)
				this.deps.state.clearMovementFailureCount(settlerId)
				this.deps.state.clearMovementRecovery(settlerId)
				shouldDispatch = false
			}
		}
		if (shouldDispatch) {
			this.deps.managers.population.setSettlerWaitReason(settlerId, waitReason)
			this.deps.managers.population.setSettlerLastStep(settlerId, step.type, waitReason)
			this.deps.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
		}
		if (step.type === WorkStepType.Transport && step.target.type === TransportTargetType.Construction) {
			this.deps.work.releaseConstructionInFlight(step.target.buildingInstanceId, step.itemType, step.quantity)
		}
		if (shouldDispatch) {
			this.deps.state.schedulePendingDispatch(settlerId, this.deps.work.getNowMs() + retryDelayMs)
		}

	}
}
