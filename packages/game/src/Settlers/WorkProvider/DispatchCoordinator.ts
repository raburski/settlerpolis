import { Receiver } from '../../Receiver'
import type { EventManager } from '../../events'
import type { WorkProviderDeps } from './deps'
import type { AssignmentStore } from './AssignmentStore'
import type { ProviderRegistry } from './ProviderRegistry'
import { WorkProviderEvents } from './events'
import type { WorkAssignment, WorkStep, WorkAction } from './types'
import { TransportTargetType, WorkProviderType, WorkStepType, WorkWaitReason } from './types'
import { SettlerState } from '../../Population/types'
import { StepHandlers } from './stepHandlers'
import type { ActionSystem } from './ActionSystem'
import type { LogisticsProvider } from './providers/LogisticsProvider'
import type { PolicyEngine } from './PolicyEngine'
import type { ProductionTracker } from './ProductionTracker'
import type { ActionQueueContext } from '../../state/types'
import { ActionQueueContextKind } from '../../state/types'
import type { WorkPolicyContext } from './policies/types'
import { WorkPolicyPhase } from './policies/constants'
import type { PausedContext } from '../../Needs/types'
import type { SettlerId } from '../../ids'

const MOVEMENT_RECOVERY_COOLDOWN_MS = 8000
const MOVEMENT_FAILURE_MAX_RETRIES = 3

export class DispatchCoordinator {
	private movementRecoveryUntil = new Map<SettlerId, number>()
	private movementRecoveryReason = new Map<SettlerId, WorkWaitReason>()
	private movementFailureCounts = new Map<SettlerId, number>()
	private pendingDispatchAtMs = new Map<SettlerId, number>()

	constructor(
		private managers: WorkProviderDeps,
		private event: EventManager,
		private assignments: AssignmentStore,
		private registry: ProviderRegistry,
		private actionSystem: ActionSystem,
		private logisticsProvider: LogisticsProvider,
		private policyEngine: PolicyEngine,
		private productionTracker: ProductionTracker,
		private getNowMs: () => number,
		private getPauseState: () => { pauseRequests: Map<SettlerId, { reason: string }>, pausedContexts: Map<SettlerId, PausedContext | null> },
		private applyPause: (settlerId: SettlerId) => void,
		private unassignWorker: (settlerId: SettlerId) => void
	) {}

	processPendingDispatches(): void {
		if (this.pendingDispatchAtMs.size === 0) {
			return
		}

		const now = this.getNowMs()
		for (const [settlerId, dispatchAt] of this.pendingDispatchAtMs.entries()) {
			if (now < dispatchAt) {
				continue
			}
			if (this.actionSystem.isBusy(settlerId)) {
				continue
			}
			this.pendingDispatchAtMs.delete(settlerId)
			this.dispatchNextStep(settlerId)
		}
	}

	dispatchNextStep(settlerId: SettlerId): void {
		if (this.actionSystem.isBusy(settlerId)) {
			return
		}

		const { pauseRequests, pausedContexts } = this.getPauseState()
		if (pauseRequests.has(settlerId) || pausedContexts.has(settlerId)) {
			if (!pausedContexts.has(settlerId)) {
				this.applyPause(settlerId)
			}
			return
		}

		const assignment = this.assignments.get(settlerId)
		if (!assignment) {
			this.managers.population.setSettlerWaitReason(settlerId, WorkWaitReason.NoWork)
			this.managers.population.setSettlerLastStep(settlerId, undefined, WorkWaitReason.NoWork)
			return
		}

		const recoveryUntil = this.movementRecoveryUntil.get(settlerId)
		if (recoveryUntil) {
			if (this.getNowMs() < recoveryUntil) {
				const reason = this.movementRecoveryReason.get(settlerId) ?? WorkWaitReason.MovementFailed
				this.managers.population.setSettlerWaitReason(settlerId, reason)
				this.managers.population.setSettlerLastStep(settlerId, undefined, reason)
				this.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
				return
			}
			this.movementRecoveryUntil.delete(settlerId)
			this.movementRecoveryReason.delete(settlerId)
		}

		const policyContext: WorkPolicyContext = {
			settlerId,
			assignment,
			managers: this.managers,
			simulationTimeMs: this.getNowMs()
		}

		const prePolicyResult = this.policyEngine.evaluate(WorkPolicyPhase.BeforeStep, policyContext)
		if (this.policyEngine.apply(settlerId, prePolicyResult)) {
			return
		}

		const provider = this.registry.get(assignment.providerId)
		if (!provider) {
			this.managers.population.setSettlerWaitReason(settlerId, WorkWaitReason.ProviderMissing)
			this.managers.population.setSettlerLastStep(settlerId, undefined, WorkWaitReason.ProviderMissing)
			return
		}

		const step = provider.requestNextStep(settlerId)
		if (!step) {
			const noStepPolicyResult = this.policyEngine.evaluate(WorkPolicyPhase.NoStep, policyContext)
			if (this.policyEngine.apply(settlerId, noStepPolicyResult)) {
				return
			}
			this.managers.population.setSettlerWaitReason(settlerId, WorkWaitReason.NoWork)
			this.managers.population.setSettlerLastStep(settlerId, undefined, WorkWaitReason.NoWork)
			this.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
			return
		}

		if (step.type === WorkStepType.Wait) {
			const waitPolicyResult = this.policyEngine.evaluate(WorkPolicyPhase.WaitStep, policyContext, step)
			if (this.policyEngine.apply(settlerId, waitPolicyResult)) {
				return
			}
			this.managers.population.setSettlerWaitReason(settlerId, step.reason)
			this.managers.population.setSettlerLastStep(settlerId, step.type, step.reason)
			if (assignment.providerType === WorkProviderType.Logistics &&
				(step.reason === WorkWaitReason.NoRequests || step.reason === WorkWaitReason.NoViableRequest)) {
				this.unassignWorker(settlerId)
				return
			}
			if (assignment.providerType === WorkProviderType.Road &&
				(step.reason === WorkWaitReason.NoWork || step.reason === WorkWaitReason.WrongProfession)) {
				this.unassignWorker(settlerId)
				return
			}
			if (assignment.providerType === WorkProviderType.Construction && step.reason === WorkWaitReason.WrongProfession) {
				this.unassignWorker(settlerId)
				return
			}
		} else {
			this.managers.population.setSettlerWaitReason(settlerId, undefined)
			this.managers.population.setSettlerLastStep(settlerId, step.type, undefined)
		}

		this.productionTracker.updateForStep(assignment, step)

		this.event.emit(Receiver.All, WorkProviderEvents.SS.StepIssued, { settlerId, step })
		const { actions, releaseReservations } = this.buildActionsForStep(settlerId, assignment, step)

		if (!actions || actions.length === 0) {
			if (step.type === WorkStepType.Wait) {
				this.managers.population.setSettlerWaitReason(settlerId, step.reason)
			} else {
				this.managers.population.setSettlerWaitReason(settlerId, WorkWaitReason.NoWork)
			}
			this.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
			releaseReservations?.()
			return
		}

		const callbacks = this.buildWorkQueueCallbacks(settlerId, step, releaseReservations)
		const context: ActionQueueContext = {
			kind: ActionQueueContextKind.Work,
			step,
			reservationOwnerId: assignment.assignmentId
		}
		this.actionSystem.enqueue(settlerId, actions, callbacks.onComplete, callbacks.onFail, context)
	}

	buildWorkQueueCallbacks(
		settlerId: SettlerId,
		step?: WorkStep,
		releaseReservations?: () => void
	): { onComplete: () => void, onFail: (reason: string) => void } {
		return {
			onComplete: () => {
				if (!step) {
					releaseReservations?.()
					this.dispatchNextStep(settlerId)
					return
				}
				const assignment = this.assignments.get(settlerId)
				if (!assignment) {
					releaseReservations?.()
					return
				}
				this.handleStepCompleted(settlerId, assignment, step, releaseReservations)
			},
			onFail: (reason: string) => {
				if (!step) {
					releaseReservations?.()
					this.dispatchNextStep(settlerId)
					return
				}
				const assignment = this.assignments.get(settlerId)
				if (!assignment) {
					releaseReservations?.()
					return
				}
				this.handleStepFailed(settlerId, assignment, step, reason, releaseReservations)
			}
		}
	}

	clearSettlerState(settlerId: SettlerId): void {
		this.movementFailureCounts.delete(settlerId)
		this.movementRecoveryUntil.delete(settlerId)
		this.movementRecoveryReason.delete(settlerId)
		this.pendingDispatchAtMs.delete(settlerId)
	}

	serialize(): {
		movementRecoveryUntil: Array<[SettlerId, number]>
		movementRecoveryReason: Array<[SettlerId, WorkWaitReason]>
		movementFailureCounts: Array<[SettlerId, number]>
		pendingDispatchAtMs: Array<[SettlerId, number]>
	} {
		return {
			movementRecoveryUntil: Array.from(this.movementRecoveryUntil.entries()),
			movementRecoveryReason: Array.from(this.movementRecoveryReason.entries()),
			movementFailureCounts: Array.from(this.movementFailureCounts.entries()),
			pendingDispatchAtMs: Array.from(this.pendingDispatchAtMs.entries())
		}
	}

	deserialize(state: {
		movementRecoveryUntil: Array<[SettlerId, number]>
		movementRecoveryReason: Array<[SettlerId, WorkWaitReason]>
		movementFailureCounts: Array<[SettlerId, number]>
		pendingDispatchAtMs: Array<[SettlerId, number]>
	}): void {
		this.movementRecoveryUntil = new Map(state.movementRecoveryUntil)
		this.movementRecoveryReason = new Map(state.movementRecoveryReason)
		this.movementFailureCounts = new Map(state.movementFailureCounts)
		this.pendingDispatchAtMs = new Map(state.pendingDispatchAtMs)
	}

	reset(): void {
		this.movementFailureCounts.clear()
		this.movementRecoveryUntil.clear()
		this.movementRecoveryReason.clear()
		this.pendingDispatchAtMs.clear()
	}

	private handleStepCompleted(
		settlerId: SettlerId,
		assignment: WorkAssignment,
		step: WorkStep,
		releaseReservations?: () => void
	): void {
		releaseReservations?.()
		this.event.emit(Receiver.All, WorkProviderEvents.SS.StepCompleted, { settlerId, step })
		this.managers.population.setSettlerLastStep(settlerId, step.type, undefined)
		this.managers.population.setSettlerState(settlerId, SettlerState.Idle)
		this.movementFailureCounts.delete(settlerId)
		if (step.type === WorkStepType.Transport && step.target.type === TransportTargetType.Construction) {
			this.logisticsProvider.releaseConstructionInFlight(step.target.buildingInstanceId, step.itemType, step.quantity)
		}
		if (step.type === WorkStepType.Produce && assignment.buildingInstanceId) {
			this.productionTracker.handleProductionCompleted(assignment.buildingInstanceId, step.recipe)
		}
		if (assignment.providerType === WorkProviderType.Logistics && !this.logisticsProvider.hasPendingRequests()) {
			this.unassignWorker(settlerId)
			return
		}
		this.dispatchNextStep(settlerId)
	}

	private handleStepFailed(
		settlerId: SettlerId,
		assignment: WorkAssignment,
		step: WorkStep,
		reason: string,
		releaseReservations?: () => void
	): void {
		releaseReservations?.()
		this.event.emit(Receiver.All, WorkProviderEvents.SS.StepFailed, { settlerId, step, reason })
		let retryDelayMs = 1000
		const isWaitReason = (Object.values(WorkWaitReason) as string[]).includes(reason)
		let waitReason: WorkWaitReason = isWaitReason ? (reason as WorkWaitReason) : WorkWaitReason.NoWork
		let shouldDispatch = true
		if (reason === 'movement_failed' || reason === 'movement_cancelled') {
			const currentFailures = (this.movementFailureCounts.get(settlerId) || 0) + 1
			this.movementFailureCounts.set(settlerId, currentFailures)
			retryDelayMs = MOVEMENT_RECOVERY_COOLDOWN_MS
			waitReason = reason === 'movement_failed'
				? WorkWaitReason.MovementFailed
				: WorkWaitReason.MovementCancelled
			this.movementRecoveryUntil.set(settlerId, this.getNowMs() + retryDelayMs)
			this.movementRecoveryReason.set(settlerId, waitReason)
			if (currentFailures >= MOVEMENT_FAILURE_MAX_RETRIES) {
				if (step.type === WorkStepType.BuildRoad) {
					this.managers.roads.releaseJob(step.jobId)
				}
				this.unassignWorker(settlerId)
				this.movementFailureCounts.delete(settlerId)
				this.movementRecoveryUntil.delete(settlerId)
				this.movementRecoveryReason.delete(settlerId)
				shouldDispatch = false
			}
		}
		if (shouldDispatch) {
			this.managers.population.setSettlerWaitReason(settlerId, waitReason)
			this.managers.population.setSettlerLastStep(settlerId, step.type, waitReason)
			this.managers.population.setSettlerState(settlerId, SettlerState.WaitingForWork)
		}
		if (step.type === WorkStepType.Transport && step.target.type === TransportTargetType.Construction) {
			this.logisticsProvider.releaseConstructionInFlight(step.target.buildingInstanceId, step.itemType, step.quantity)
		}
		if (shouldDispatch) {
			this.pendingDispatchAtMs.set(settlerId, this.getNowMs() + retryDelayMs)
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
			simulationTimeMs: this.getNowMs()
		})
	}
}
